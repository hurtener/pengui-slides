/**
 * Shared path resolution used by the structural ops (insert / remove /
 * move / duplicate). The existing `replace-node.ts` predates this helper
 * and has its own inline walker; we leave it alone to avoid churn.
 *
 * Two cursor shapes:
 *   `node`      — path addresses a single node at `container[index]`.
 *   `container` — path addresses an array we can insert/remove from.
 *
 * Disambiguation: the walker classifies based on what the LAST step
 * descends into. Numeric step into an array → node-cursor. Numeric step
 * into the special `grid.cells` 2D shape → container-cursor on the row
 * (the row itself is the array of leaves we splice into). String step
 * into a node's container key (`left`/`right`/`cells`) → container.
 */

import type { SlideIR, SectionIR } from '../slide-ir.js';
import type { LeafSlideNode, SlideNode } from '../nodes.js';
import type { IRPath } from './replace-node.js';
import { PenguiError, ErrorCode } from '../../../types/errors.js';

const TWO_COLUMN_KEYS: ReadonlySet<string> = new Set(['left', 'right']);
const GRID_KEYS: ReadonlySet<string> = new Set(['cells']);

export type LeafContainer = LeafSlideNode[];
export type NodeContainer = SlideNode[];
export type AnyContainer = LeafContainer | NodeContainer;

export type NodeCursor = {
  kind: 'node';
  container: AnyContainer;
  index: number;
  isLeafContainer: boolean;
};

export type ContainerCursor = {
  kind: 'container';
  container: AnyContainer;
  isLeafContainer: boolean;
};

export type Cursor = NodeCursor | ContainerCursor;

export function badPath(path: IRPath, reason: string): never {
  throw new PenguiError(
    ErrorCode.INVALID_INPUT,
    `Invalid IR node path [${path.join(', ')}]: ${reason}`,
    { path: [...path], reason },
  );
}

/**
 * Resolve a path against a (cloned) root. Returns a cursor pointing at
 * either a node (path addresses a leaf) or a container (path addresses
 * an array we can mutate).
 *
 * Mutates nothing; the caller is responsible for cloning the root if
 * they intend to modify it. The returned `container` reference shares
 * structure with the input — assigning `cursor.container[cursor.index] = …`
 * mutates the input tree.
 */
export function resolvePath<T extends SlideIR | SectionIR>(
  root: T,
  path: IRPath,
): Cursor {
  if (path.length === 0) {
    badPath(path, 'path must address at least the body root (["body"])');
  }
  if (path[0] !== 'body') {
    badPath(path, 'path must start with "body"');
  }

  // Walk down. Track `parent` as the most recently descended-into
  // container or node. `inLeafContainer` flips on when we descend into
  // two_column.{left,right} or a grid row.
  type ParentShape = SlideNode | NodeContainer | LeafSlideNode[][];
  let parent: ParentShape = root.body;
  let inLeafContainer = false;

  for (let i = 1; i < path.length; i += 1) {
    const step = path[i];
    const isLastStep = i === path.length - 1;
    if (Array.isArray(parent)) {
      if (typeof step !== 'number') {
        badPath(path, `step ${i} must be a number (parent is an array)`);
      }
      if (step < 0 || step >= parent.length) {
        badPath(path, `step ${i} out of range (array length ${parent.length})`);
      }
      // grid.cells is LeafSlideNode[][] — descending in by index gives a
      // row (a leaf-container array). For all other arrays the entry is
      // a SlideNode.
      const entry = parent[step] as SlideNode | LeafContainer;
      if (Array.isArray(entry)) {
        // We just descended into a grid row. If this is the final step,
        // the path addresses the row as a container.
        if (isLastStep) {
          return { kind: 'container', container: entry, isLeafContainer: true };
        }
        parent = entry;
        inLeafContainer = true;
      } else {
        if (isLastStep) {
          return {
            kind: 'node',
            container: parent as AnyContainer,
            index: step,
            isLeafContainer: inLeafContainer,
          };
        }
        parent = entry;
      }
    } else {
      // parent is a SlideNode — it may have container fields.
      if (parent.type === 'two_column') {
        if (typeof step !== 'string' || !TWO_COLUMN_KEYS.has(step)) {
          badPath(path, `step ${i} on two_column must be "left" or "right"`);
        }
        const branch: LeafContainer = step === 'left' ? parent.left : parent.right;
        if (isLastStep) {
          return { kind: 'container', container: branch, isLeafContainer: true };
        }
        parent = branch;
        inLeafContainer = true;
      } else if (parent.type === 'grid') {
        if (typeof step !== 'string' || !GRID_KEYS.has(step)) {
          badPath(path, `step ${i} on grid must be "cells"`);
        }
        if (isLastStep) {
          // The cells array itself is a 2D structure — addressing it as
          // a container makes no sense (you'd be splicing in/out whole
          // rows, which is a separate operation we don't expose). Reject.
          badPath(path, '"cells" is a 2D array; address a specific row by index (e.g. ["body", N, "cells", 0])');
        }
        parent = parent.cells as unknown as LeafSlideNode[][];
        // We don't enter inLeafContainer until we descend into a specific row.
      } else {
        badPath(path, `step ${i} cannot descend into a ${parent.type} node`);
      }
    }
  }

  // path === ["body"] — the body array itself.
  return { kind: 'container', container: root.body, isLeafContainer: false };
}

/**
 * Convenience: resolve and assert the cursor is a node-cursor. Use when
 * the operation requires a target node (remove, duplicate).
 */
export function resolveNode<T extends SlideIR | SectionIR>(
  root: T,
  path: IRPath,
): NodeCursor {
  const cur = resolvePath(root, path);
  if (cur.kind !== 'node') {
    badPath(path, 'expected path to address a node, got a container');
  }
  return cur;
}

/**
 * Convenience: resolve and assert the cursor is a container-cursor.
 * Use when the operation needs an array to splice into (insert, move-target).
 */
export function resolveContainer<T extends SlideIR | SectionIR>(
  root: T,
  path: IRPath,
): ContainerCursor {
  const cur = resolvePath(root, path);
  if (cur.kind !== 'container') {
    badPath(path, 'expected path to address a container, got a node');
  }
  return cur;
}
