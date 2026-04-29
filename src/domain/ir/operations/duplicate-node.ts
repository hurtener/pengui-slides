/**
 * IR mutation: duplicate a node at a structural path.
 *
 * v4.9 — App's per-node "duplicate" action menu + agent's
 * `duplicate_slide_node` / `duplicate_section_node` MCP tools route
 * here. By default the clone lands immediately after the source
 * (`position = sourceIndex + 1`); pass an explicit `position` to insert
 * elsewhere in the same container.
 *
 * The clone is a deep structuredClone — the duplicate carries its own
 * subtree and shares no references with the source.
 *
 * Returns a new root; the input is not mutated.
 */

import type { SlideIR, SectionIR } from '../slide-ir.js';
import type { SlideNode } from '../nodes.js';
import type { IRPath } from './replace-node.js';
import { badPath, resolveNode } from './path-resolver.js';

export function duplicateNodeAtPath<T extends SlideIR | SectionIR>(
  root: T,
  path: IRPath,
  /** Where in the same container to drop the clone. Defaults to right
   *  after the source. */
  position?: number,
): T {
  if (path.length < 2) {
    badPath(path, 'path must address a node (length ≥ 2)');
  }

  const next = structuredClone(root) as T;
  const cursor = resolveNode(next, path);
  const clone = structuredClone(cursor.container[cursor.index]) as SlideNode;

  const targetPos = position ?? cursor.index + 1;
  if (!Number.isInteger(targetPos) || targetPos < 0 || targetPos > cursor.container.length + 1) {
    badPath(
      path,
      `duplicate position ${targetPos} out of range (container length ${cursor.container.length})`,
    );
  }
  // Clamp to the container's post-insert length.
  const clamped = Math.min(targetPos, cursor.container.length + 1);
  (cursor.container as SlideNode[]).splice(clamped, 0, clone);
  return next;
}
