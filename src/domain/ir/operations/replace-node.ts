/**
 * IR mutation: replace a single node at a structural path.
 *
 * v4.6: the agent / App can target a specific node inside a SlideIR or
 * SectionIR tree without resending the whole body. The path is an array
 * of structural keys: numbers index into arrays, strings index into
 * known container fields (currently only `left` / `right` inside
 * two_column nodes).
 *
 * Examples:
 *   ["body", 0]                 → top-level body[0]
 *   ["body", 2, "left", 1]      → two_column at body[2]'s left[1]
 *   ["body", 2, "right", 0]     → two_column at body[2]'s right[0]
 *
 * Returns a NEW root with the replacement applied; does not mutate the
 * input. Throws PenguiError(INVALID_INPUT) when the path doesn't
 * resolve, or when the replacement violates the leaf-only rule inside
 * two_column (no nested two_column).
 *
 * Path validation is intentionally strict: each step must match the
 * type of the parent (array index for arrays, container key for
 * containers). A wrong step type means the agent is addressing a node
 * that doesn't exist in the current tree shape.
 */

import type { SlideIR, SectionIR } from '../slide-ir.js';
import type { SlideNode } from '../nodes.js';
import { LeafSlideNodeSchema } from '../nodes.js';
import { PenguiError, ErrorCode } from '../../../types/errors.js';

export type IRPath = ReadonlyArray<string | number>;

const TWO_COLUMN_KEYS: ReadonlySet<string> = new Set(['left', 'right']);

function badPath(path: IRPath, reason: string): never {
  throw new PenguiError(
    ErrorCode.INVALID_INPUT,
    `Invalid IR node path [${path.join(', ')}]: ${reason}`,
    { path: [...path], reason },
  );
}

/**
 * Replace the node at `path` inside `root.body` with `newNode`. Returns
 * a new root; the input is not mutated.
 */
export function replaceNodeAtPath<T extends SlideIR | SectionIR>(
  root: T,
  path: IRPath,
  newNode: SlideNode,
): T {
  if (path.length < 2) {
    badPath(path, 'path must address at least one body child (e.g. ["body", 0])');
  }
  if (path[0] !== 'body') {
    badPath(path, 'path must start with "body"');
  }

  // Deep-clone via structuredClone so callers get an isolated tree.
  const next = structuredClone(root) as T;

  // Walk to the parent of the addressed node so we can reassign.
  // path: ["body", i, ...steps]
  let parent: SlideNode[] | SlideNode = next.body;

  for (let i = 1; i < path.length - 1; i += 1) {
    const step = path[i];
    if (Array.isArray(parent)) {
      if (typeof step !== 'number') {
        badPath(path, `step ${i} must be a number (parent is an array)`);
      }
      if (step < 0 || step >= parent.length) {
        badPath(path, `step ${i} out of range (array length ${parent.length})`);
      }
      parent = parent[step] as SlideNode;
    } else {
      // parent is a node — only two_column has descendable container fields
      if (parent.type !== 'two_column') {
        badPath(path, `step ${i} cannot descend into a ${parent.type} node`);
      }
      if (typeof step !== 'string' || !TWO_COLUMN_KEYS.has(step)) {
        badPath(path, `step ${i} on two_column must be "left" or "right"`);
      }
      parent = step === 'left' ? parent.left : parent.right;
    }
  }

  const lastStep = path[path.length - 1];
  if (!Array.isArray(parent)) {
    badPath(path, 'last step must address an array element');
  }
  if (typeof lastStep !== 'number') {
    badPath(path, 'last step must be a numeric index');
  }
  if (lastStep < 0 || lastStep >= parent.length) {
    badPath(path, `index ${lastStep} out of range (array length ${parent.length})`);
  }

  // Leaf-only enforcement inside two_column branches: no nested two_column.
  const isInsideTwoColumn = path.length >= 4
    && (path[path.length - 2] === 'left' || path[path.length - 2] === 'right');
  if (isInsideTwoColumn) {
    const leafCheck = LeafSlideNodeSchema.safeParse(newNode);
    if (!leafCheck.success) {
      throw new PenguiError(
        ErrorCode.INVALID_INPUT,
        'Replacement node inside two_column.left/right must be a leaf node ' +
          '(hero, heading, prose, list, image, callout, quote, table, divider). ' +
          'Nested two_column is not allowed.',
        { path: [...path], issues: leafCheck.error.issues },
      );
    }
  }

  parent[lastStep] = newNode;
  return next;
}
