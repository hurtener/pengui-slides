/**
 * IR mutation: insert a node into a container at a given position.
 *
 * v4.9 — App's "+ between" caret + agent's `insert_slide_node` /
 * `insert_section_node` MCP tools both route here. The `parentPath`
 * addresses an array (`body`, `two_column.{left,right}`, or a single
 * `grid.cells[i]` row), and `position` is the index where the new node
 * lands. Existing siblings at and after `position` shift right by one.
 *
 * Throws `PenguiError(INVALID_INPUT)` when:
 *   - the path doesn't resolve to a container,
 *   - the position is out of range (0 ≤ position ≤ container.length),
 *   - a non-leaf node is inserted into a leaf-only container,
 *   - inserting into a `grid.cells[i]` row breaks the column-multiple
 *     invariant (caller should rebalance, not splice).
 *
 * Returns a new root; the input is not mutated.
 */

import type { SlideIR, SectionIR } from '../slide-ir.js';
import { LeafSlideNodeSchema, type SlideNode } from '../nodes.js';
import { PenguiError, ErrorCode } from '../../../types/errors.js';
import type { IRPath } from './replace-node.js';
import { badPath, resolveContainer } from './path-resolver.js';

export function insertNodeAtPath<T extends SlideIR | SectionIR>(
  root: T,
  parentPath: IRPath,
  position: number,
  newNode: SlideNode,
): T {
  if (!Number.isInteger(position) || position < 0) {
    badPath(parentPath, `position must be a non-negative integer, got ${position}`);
  }

  const next = structuredClone(root) as T;
  const cursor = resolveContainer(next, parentPath);

  if (position > cursor.container.length) {
    badPath(
      parentPath,
      `position ${position} out of range (container length ${cursor.container.length})`,
    );
  }

  if (cursor.isLeafContainer) {
    const leafCheck = LeafSlideNodeSchema.safeParse(newNode);
    if (!leafCheck.success) {
      throw new PenguiError(
        ErrorCode.INVALID_INPUT,
        'Inserted node inside two_column.left/right or grid.cells[i] must be a leaf node ' +
          '(hero, heading, prose, list, image, callout, quote, table, divider). ' +
          'Nested layout containers (two_column, grid) are not allowed inside cells.',
        { parentPath: [...parentPath], issues: leafCheck.error.issues },
      );
    }
  }

  (cursor.container as SlideNode[]).splice(position, 0, newNode);
  return next;
}
