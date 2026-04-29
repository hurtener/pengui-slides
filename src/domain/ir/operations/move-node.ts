/**
 * IR mutation: move a node from one position to another.
 *
 * v4.9 — App's drag-and-drop reorder + agent's `move_slide_node` /
 * `move_section_node` MCP tools route here. Source path addresses a
 * specific node; destination is a parent container path + position.
 * Cross-container moves work too (e.g. moving a leaf from
 * `body[0].left[2]` to `body[3].right[0]`) subject to leaf-only rules.
 *
 * Path-rewriting: returns the new path of the moved node so callers
 * (notably the comment-pin migration) can update any addresses that
 * referred to the source. Pins on the moved subtree get their prefix
 * rewritten; pins on shifted siblings get their indices adjusted.
 * That migration logic lives in `path-migration.ts` and runs in the
 * service layer (it needs access to the comment store).
 *
 * Edge cases:
 *   - No-op move (from === to): returns root + path unchanged.
 *   - Same-container reorder where to-position > from-index: the
 *     destination is interpreted POST-removal so the displayed move
 *     ("drop after sibling N") matches user intent.
 *
 * Returns `{ root, newPath }`; the input root is not mutated.
 */

import type { SlideIR, SectionIR } from '../slide-ir.js';
import { LeafSlideNodeSchema, type SlideNode } from '../nodes.js';
import { PenguiError, ErrorCode } from '../../../types/errors.js';
import type { IRPath } from './replace-node.js';
import { badPath, resolveContainer, resolveNode } from './path-resolver.js';

export interface MoveResult<T extends SlideIR | SectionIR> {
  root: T;
  /** The address the moved node lives at after the operation. */
  newPath: IRPath;
}

export function moveNodeAtPath<T extends SlideIR | SectionIR>(
  root: T,
  fromPath: IRPath,
  toParentPath: IRPath,
  toPosition: number,
): MoveResult<T> {
  if (fromPath.length < 2) {
    badPath(fromPath, 'fromPath must address a node (length ≥ 2)');
  }
  if (!Number.isInteger(toPosition) || toPosition < 0) {
    badPath(toParentPath, `toPosition must be a non-negative integer, got ${toPosition}`);
  }

  const next = structuredClone(root) as T;

  // ── Detect no-op ────────────────────────────────────────────────
  // Same parent, same effective index. Skip the splice dance to avoid
  // pointless path migration churn.
  const fromParentPath = fromPath.slice(0, -1);
  const fromIndex = fromPath[fromPath.length - 1] as number;
  if (samePath(fromParentPath, toParentPath) && toPosition === fromIndex) {
    return { root: next, newPath: fromPath };
  }

  // ── Splice out the source ──────────────────────────────────────
  const sourceCursor = resolveNode(next, fromPath);
  const moved = sourceCursor.container[sourceCursor.index];
  sourceCursor.container.splice(sourceCursor.index, 1);

  // ── Resolve the destination container post-removal ─────────────
  // The toParentPath is interpreted against the post-removal tree.
  // When the destination shares a prefix with the source, we have to
  // adjust toParentPath if the removal shifted any of its indices.
  const adjustedToParentPath = adjustParentPathAfterRemoval(toParentPath, fromPath);
  const destCursor = resolveContainer(next, adjustedToParentPath);

  // Compute effective destination index: if the destination is the
  // same container as the source AND toPosition > fromIndex, the
  // removal already shifted indices by 1, so toPosition needs to
  // decrement to land at the user-intended slot.
  let effectiveTo = toPosition;
  if (samePath(fromParentPath, adjustedToParentPath) && toPosition > fromIndex) {
    effectiveTo = toPosition - 1;
  }

  if (effectiveTo > destCursor.container.length) {
    badPath(
      toParentPath,
      `toPosition ${toPosition} out of range (post-removal container length ${destCursor.container.length})`,
    );
  }

  // Leaf-only enforcement on the destination side.
  if (destCursor.isLeafContainer) {
    const leafCheck = LeafSlideNodeSchema.safeParse(moved);
    if (!leafCheck.success) {
      throw new PenguiError(
        ErrorCode.INVALID_INPUT,
        'Cannot move a non-leaf node into two_column.left/right or grid.cells[i]; ' +
          'destinations require leaf nodes only (hero, heading, prose, list, image, callout, quote, table, divider).',
        { fromPath: [...fromPath], toParentPath: [...toParentPath], issues: leafCheck.error.issues },
      );
    }
  }

  (destCursor.container as SlideNode[]).splice(effectiveTo, 0, moved);

  const newPath: IRPath = [...adjustedToParentPath, effectiveTo];
  return { root: next, newPath };
}

function samePath(a: IRPath, b: IRPath): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * If the destination parent path shares the source's parent and its
 * step matches an index ≥ fromIndex, decrement that step. Captures
 * the case where the destination references a sibling-of-source (or
 * a descendant of one) that shifted left after the removal.
 */
function adjustParentPathAfterRemoval(toParentPath: IRPath, fromPath: IRPath): IRPath {
  if (fromPath.length < 2) return toParentPath;
  const fromParentPath = fromPath.slice(0, -1);
  const fromIndex = fromPath[fromPath.length - 1] as number;

  // Common prefix length must equal fromParentPath length, and the
  // next step in toParentPath must be a numeric step.
  if (toParentPath.length <= fromParentPath.length) return toParentPath;
  for (let i = 0; i < fromParentPath.length; i += 1) {
    if (toParentPath[i] !== fromParentPath[i]) return toParentPath;
  }
  const stepInSourceContainer = toParentPath[fromParentPath.length];
  if (typeof stepInSourceContainer !== 'number') return toParentPath;
  if (stepInSourceContainer === fromIndex) {
    // The destination IS inside the moved subtree — disallowed.
    badPath(
      toParentPath,
      'cannot move a node into its own subtree',
    );
  }
  if (stepInSourceContainer > fromIndex) {
    return [
      ...toParentPath.slice(0, fromParentPath.length),
      stepInSourceContainer - 1,
      ...toParentPath.slice(fromParentPath.length + 1),
    ];
  }
  return toParentPath;
}
