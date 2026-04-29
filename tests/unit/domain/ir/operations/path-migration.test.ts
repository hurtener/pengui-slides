import { describe, it, expect } from 'vitest';
import {
  migratePathAfterInsert,
  migratePathAfterRemove,
  migratePathAfterMove,
  migratePathAfterDuplicate,
} from '../../../../../src/domain/ir/index.js';

describe('migratePathAfterInsert', () => {
  it('shifts paths at or after the insert position', () => {
    expect(migratePathAfterInsert(['body', 0], ['body'], 0)).toEqual(['body', 1]);
    expect(migratePathAfterInsert(['body', 1], ['body'], 0)).toEqual(['body', 2]);
    expect(migratePathAfterInsert(['body', 2], ['body'], 1)).toEqual(['body', 3]);
  });

  it('leaves paths before the insert position unchanged', () => {
    expect(migratePathAfterInsert(['body', 0], ['body'], 2)).toEqual(['body', 0]);
  });

  it('rewrites nested paths sharing the parent prefix', () => {
    expect(
      migratePathAfterInsert(['body', 2, 'left', 1], ['body'], 1),
    ).toEqual(['body', 3, 'left', 1]);
  });

  it('does not touch paths in unrelated containers', () => {
    expect(
      migratePathAfterInsert(['body', 0, 'right', 0], ['body', 5, 'left'], 0),
    ).toEqual(['body', 0, 'right', 0]);
  });
});

describe('migratePathAfterRemove', () => {
  it('returns null for paths inside the removed subtree', () => {
    expect(migratePathAfterRemove(['body', 2], ['body', 2])).toBeNull();
    expect(migratePathAfterRemove(['body', 2, 'left', 0], ['body', 2])).toBeNull();
  });

  it('decrements indices in the same container after the removed index', () => {
    expect(migratePathAfterRemove(['body', 3], ['body', 1])).toEqual(['body', 2]);
    expect(migratePathAfterRemove(['body', 3, 'left', 0], ['body', 1])).toEqual([
      'body',
      2,
      'left',
      0,
    ]);
  });

  it('leaves paths before the removed index unchanged', () => {
    expect(migratePathAfterRemove(['body', 0], ['body', 2])).toEqual(['body', 0]);
  });
});

describe('migratePathAfterMove', () => {
  it('re-roots paths inside the moved subtree to the new parent', () => {
    // Move body[2] → body[5]. A pin on body[2].left[1] should become body[4].left[1]
    // (post-removal, the destination index 5 effectively becomes 4).
    expect(
      migratePathAfterMove(['body', 2, 'left', 1], ['body', 2], ['body'], 5),
    ).toEqual(['body', 4, 'left', 1]);
  });

  it('decrements paths in the source container after the source', () => {
    // Move body[1] → body[5]. A pin on body[3] should become body[2].
    expect(
      migratePathAfterMove(['body', 3], ['body', 1], ['body'], 5),
    ).toEqual(['body', 2]);
  });

  it('shifts paths in the destination container at or after the insert', () => {
    // Move body[5] → body[1] (different container theoretically, but body
    // is single-container). After remove(5)+insert(1), body[1] (old) becomes body[2].
    expect(
      migratePathAfterMove(['body', 1], ['body', 5], ['body'], 1),
    ).toEqual(['body', 2]);
  });

  it('cross-container move (two_column.left → two_column.right)', () => {
    // Original tree: body[0] is a two_column; left[0] moves to right[1].
    // A pin on body[0].right[0] should stay at body[0].right[0]
    // (insert at 1 doesn't shift index 0).
    expect(
      migratePathAfterMove(
        ['body', 0, 'right', 0],
        ['body', 0, 'left', 0],
        ['body', 0, 'right'],
        1,
      ),
    ).toEqual(['body', 0, 'right', 0]);
  });

  it('no-op move returns path unchanged', () => {
    expect(
      migratePathAfterMove(['body', 0, 'left', 1], ['body', 0], ['body'], 0),
    ).toEqual(['body', 0, 'left', 1]);
  });
});

describe('migratePathAfterDuplicate', () => {
  it('shifts paths at or after the clone position (same as insert)', () => {
    // Duplicate body[0] to body[1]. body[1] (old) → body[2].
    expect(migratePathAfterDuplicate(['body', 1], ['body', 0], 1)).toEqual(['body', 2]);
  });

  it('leaves the original source path unchanged', () => {
    expect(migratePathAfterDuplicate(['body', 0], ['body', 0], 1)).toEqual(['body', 0]);
  });
});
