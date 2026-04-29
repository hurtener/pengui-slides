/**
 * IR mutation: remove a node at a structural path.
 *
 * v4.9 — App's per-node "delete" action menu + agent's
 * `remove_slide_node` / `remove_section_node` MCP tools route here.
 * Subsequent siblings in the same container shift left by one.
 *
 * Cannot remove the body root itself (`["body"]`). Cannot remove a
 * grid row by addressing `["body", N, "cells", row]` because the
 * column-multiple invariant means rows aren't independently removable
 * — caller must drop the corresponding cells across all rows. Out of
 * scope for v4.9; address as a `change-grid-shape` op in v4.10+.
 *
 * Returns a new root; the input is not mutated.
 */

import type { SlideIR, SectionIR } from '../slide-ir.js';
import type { IRPath } from './replace-node.js';
import { badPath, resolveNode } from './path-resolver.js';

export function removeNodeAtPath<T extends SlideIR | SectionIR>(
  root: T,
  path: IRPath,
): T {
  if (path.length < 2) {
    badPath(path, 'path must address a node (length ≥ 2)');
  }

  const next = structuredClone(root) as T;
  const cursor = resolveNode(next, path);
  cursor.container.splice(cursor.index, 1);
  return next;
}
