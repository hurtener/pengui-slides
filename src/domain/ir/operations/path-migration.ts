/**
 * Path migration after structural ops.
 *
 * When a structural op (insert / remove / move / duplicate) shifts
 * sibling indices or relocates subtrees, every existing reference to
 * an old IR path needs to be rewritten — most importantly the
 * comment-pin `target.ir_path`. This module exposes pure rewriters:
 *
 *   migratePathAfterInsert(oldPath, parentPath, position)       → newPath
 *   migratePathAfterRemove(oldPath, removedPath)                → newPath | null
 *   migratePathAfterMove(oldPath, fromPath, toParentPath, toPos) → newPath | null
 *   migratePathAfterDuplicate(oldPath, sourcePath, position)    → newPath (clone preserves the original)
 *
 * Returns `null` only when the addressed node was REMOVED outright
 * (path was inside the deleted subtree). Callers — usually the comment
 * service — surface a "this pin no longer points to a node" hint.
 *
 * Sibling-shift semantics:
 *   - Insert at parentPath[position]: paths inside parentPath whose
 *     next step is ≥ position get +1.
 *   - Remove at parentPath[position]: paths inside parentPath whose
 *     next step is > position get -1; paths == position are inside the
 *     removed subtree (return null).
 *   - Move = remove(from) ∘ insert(to). Composition matters: prefix-
 *     match against from FIRST so paths inside the moved subtree get
 *     re-rooted to the new location, THEN apply sibling-shifts.
 */

import type { IRPath } from './replace-node.js';

function samePath(a: IRPath, b: IRPath): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** True iff `prefix` is a structural prefix of `path` (or equal). */
function hasPrefix(path: IRPath, prefix: IRPath): boolean {
  if (path.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i += 1) {
    if (path[i] !== prefix[i]) return false;
  }
  return true;
}

/**
 * Rewrite `oldPath` after an insert at `parentPath[position]`. Paths
 * not inside `parentPath` are unchanged. Paths inside `parentPath`
 * whose index ≥ `position` shift up by 1.
 */
export function migratePathAfterInsert(
  oldPath: IRPath,
  parentPath: IRPath,
  position: number,
): IRPath {
  if (!hasPrefix(oldPath, parentPath)) return oldPath;
  const stepIdx = parentPath.length;
  if (oldPath.length <= stepIdx) return oldPath; // path === parentPath
  const step = oldPath[stepIdx];
  if (typeof step !== 'number') return oldPath;
  if (step >= position) {
    return [...oldPath.slice(0, stepIdx), step + 1, ...oldPath.slice(stepIdx + 1)];
  }
  return oldPath;
}

/**
 * Rewrite `oldPath` after a remove at `removedPath`. Paths inside the
 * removed subtree return `null` (caller invalidates / orphans). Paths
 * in the same container at index > the removed index decrement by 1.
 */
export function migratePathAfterRemove(
  oldPath: IRPath,
  removedPath: IRPath,
): IRPath | null {
  if (hasPrefix(oldPath, removedPath)) return null; // inside or equal
  const parentPath = removedPath.slice(0, -1);
  const removedIndex = removedPath[removedPath.length - 1];
  if (typeof removedIndex !== 'number') return oldPath;
  if (!hasPrefix(oldPath, parentPath)) return oldPath;
  const stepIdx = parentPath.length;
  if (oldPath.length <= stepIdx) return oldPath;
  const step = oldPath[stepIdx];
  if (typeof step !== 'number') return oldPath;
  if (step > removedIndex) {
    return [...oldPath.slice(0, stepIdx), step - 1, ...oldPath.slice(stepIdx + 1)];
  }
  return oldPath;
}

/**
 * Rewrite `oldPath` after a move(fromPath → toParentPath[toPosition]).
 *
 * The composition: paths inside the moved subtree get re-rooted to
 * `toParentPath[effectiveTo, ...suffix]` (where effectiveTo accounts
 * for the same-container shift, mirroring `moveNodeAtPath`). Paths
 * outside the moved subtree see remove-then-insert sibling shifts.
 */
export function migratePathAfterMove(
  oldPath: IRPath,
  fromPath: IRPath,
  toParentPath: IRPath,
  toPosition: number,
): IRPath | null {
  const fromParentPath = fromPath.slice(0, -1);
  const fromIndex = fromPath[fromPath.length - 1] as number;

  // No-op move.
  if (samePath(fromParentPath, toParentPath) && toPosition === fromIndex) {
    return oldPath;
  }

  // The destination parent path is interpreted against the
  // post-removal tree, so adjust it the same way moveNodeAtPath does.
  const adjustedToParent = adjustToParentForRemoval(toParentPath, fromPath);
  // Same-container effective index after removal.
  let effectiveTo = toPosition;
  if (samePath(fromParentPath, adjustedToParent) && toPosition > fromIndex) {
    effectiveTo = toPosition - 1;
  }

  // 1. If oldPath lives inside the moved subtree, re-root it.
  if (hasPrefix(oldPath, fromPath)) {
    const suffix = oldPath.slice(fromPath.length);
    return [...adjustedToParent, effectiveTo, ...suffix];
  }

  // 2. Otherwise treat as remove(from) then insert(at adjustedToParent + effectiveTo).
  const afterRemove = migratePathAfterRemove(oldPath, fromPath);
  if (afterRemove === null) return null;
  return migratePathAfterInsert(afterRemove, adjustedToParent, effectiveTo);
}

/**
 * Rewrite `oldPath` after duplicating `sourcePath` to `position` in
 * the same container. The original at sourcePath is preserved; a
 * fresh clone lands at `position`. Indices ≥ position in that
 * container shift up by 1 (same as insert).
 */
export function migratePathAfterDuplicate(
  oldPath: IRPath,
  sourcePath: IRPath,
  position: number,
): IRPath {
  const parentPath = sourcePath.slice(0, -1);
  return migratePathAfterInsert(oldPath, parentPath, position);
}

/**
 * Mirror of moveNodeAtPath's adjustParentPathAfterRemoval. Kept local
 * so this module has no dependency on move-node.ts (purer).
 */
function adjustToParentForRemoval(toParentPath: IRPath, fromPath: IRPath): IRPath {
  if (fromPath.length < 2) return toParentPath;
  const fromParentPath = fromPath.slice(0, -1);
  const fromIndex = fromPath[fromPath.length - 1] as number;
  if (toParentPath.length <= fromParentPath.length) return toParentPath;
  for (let i = 0; i < fromParentPath.length; i += 1) {
    if (toParentPath[i] !== fromParentPath[i]) return toParentPath;
  }
  const step = toParentPath[fromParentPath.length];
  if (typeof step !== 'number') return toParentPath;
  if (step > fromIndex) {
    return [
      ...toParentPath.slice(0, fromParentPath.length),
      step - 1,
      ...toParentPath.slice(fromParentPath.length + 1),
    ];
  }
  return toParentPath;
}
