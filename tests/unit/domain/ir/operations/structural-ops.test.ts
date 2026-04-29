import { describe, it, expect } from 'vitest';
import { rt } from '../../../../../src/domain/ir/rich-text.js';
import {
  insertNodeAtPath,
  removeNodeAtPath,
  duplicateNodeAtPath,
  moveNodeAtPath,
} from '../../../../../src/domain/ir/index.js';
import type { SlideIR, SlideNode } from '../../../../../src/domain/ir/index.js';

const HERO = (s: string): SlideNode => ({ type: 'hero', title: rt(s) });
const PROSE = (s: string): SlideNode => ({ type: 'prose', body: rt(s) });

describe('insertNodeAtPath', () => {
  it('inserts at the start of body[]', () => {
    const ir: SlideIR = { body: [HERO('A')] };
    const next = insertNodeAtPath(ir, ['body'], 0, PROSE('Z'));
    expect(next.body).toHaveLength(2);
    expect(next.body[0]).toMatchObject({ type: 'prose' });
    expect(next.body[1]).toMatchObject({ type: 'hero' });
  });

  it('inserts at the end of body[]', () => {
    const ir: SlideIR = { body: [HERO('A')] };
    const next = insertNodeAtPath(ir, ['body'], 1, PROSE('Z'));
    expect(next.body[1]).toMatchObject({ type: 'prose' });
  });

  it('inserts into two_column.left', () => {
    const ir: SlideIR = {
      body: [{ type: 'two_column', left: [HERO('L')], right: [HERO('R')] }],
    };
    const next = insertNodeAtPath(ir, ['body', 0, 'left'], 1, PROSE('inserted'));
    const tc = next.body[0];
    if (tc.type !== 'two_column') throw new Error('expected two_column');
    expect(tc.left).toHaveLength(2);
    expect(tc.left[1]).toMatchObject({ type: 'prose' });
  });

  it('inserts into a grid row', () => {
    const ir: SlideIR = {
      body: [{ type: 'grid', columns: 2, cells: [[HERO('A')], [HERO('B')]] }],
    };
    const next = insertNodeAtPath(ir, ['body', 0, 'cells', 0], 0, PROSE('row0'));
    const grid = next.body[0];
    if (grid.type !== 'grid') throw new Error('expected grid');
    expect(grid.cells[0]).toHaveLength(2);
    expect(grid.cells[0][0]).toMatchObject({ type: 'prose' });
  });

  it('rejects nested layout container in a leaf-only slot', () => {
    const ir: SlideIR = {
      body: [{ type: 'two_column', left: [], right: [] }],
    };
    expect(() =>
      insertNodeAtPath(ir, ['body', 0, 'left'], 0, {
        type: 'two_column',
        left: [],
        right: [],
      } as SlideNode),
    ).toThrow(/must be a leaf node/);
  });

  it('rejects negative position', () => {
    const ir: SlideIR = { body: [] };
    expect(() => insertNodeAtPath(ir, ['body'], -1, HERO('x'))).toThrow();
  });

  it('rejects position past end+1', () => {
    const ir: SlideIR = { body: [HERO('A')] };
    expect(() => insertNodeAtPath(ir, ['body'], 5, HERO('x'))).toThrow(/out of range/);
  });

  it('does not mutate the input', () => {
    const ir: SlideIR = { body: [HERO('A')] };
    insertNodeAtPath(ir, ['body'], 0, PROSE('Z'));
    expect(ir.body).toHaveLength(1);
  });
});

describe('removeNodeAtPath', () => {
  it('removes a top-level body node and shifts subsequent indices', () => {
    const ir: SlideIR = { body: [HERO('A'), HERO('B'), HERO('C')] };
    const next = removeNodeAtPath(ir, ['body', 1]);
    expect(next.body).toHaveLength(2);
    expect((next.body[1] as { title: { text: string }[] }).title[0].text).toBe('C');
  });

  it('removes from grid.cells[i]', () => {
    const ir: SlideIR = {
      body: [
        {
          type: 'grid',
          columns: 2,
          cells: [[HERO('A'), HERO('B')], [HERO('C'), HERO('D')]],
        },
      ],
    };
    const next = removeNodeAtPath(ir, ['body', 0, 'cells', 0, 0]);
    const grid = next.body[0];
    if (grid.type !== 'grid') throw new Error('expected grid');
    expect(grid.cells[0]).toHaveLength(1);
    expect((grid.cells[0][0] as { title: { text: string }[] }).title[0].text).toBe('B');
  });

  it('rejects path that addresses the body root itself', () => {
    const ir: SlideIR = { body: [HERO('A')] };
    expect(() => removeNodeAtPath(ir, ['body'])).toThrow(/length ≥ 2/);
  });
});

describe('duplicateNodeAtPath', () => {
  it('clones a body node right after the source by default', () => {
    const ir: SlideIR = { body: [HERO('A'), HERO('B')] };
    const next = duplicateNodeAtPath(ir, ['body', 0]);
    expect(next.body).toHaveLength(3);
    expect((next.body[1] as { title: { text: string }[] }).title[0].text).toBe('A');
    expect((next.body[2] as { title: { text: string }[] }).title[0].text).toBe('B');
  });

  it('clones into an explicit position', () => {
    const ir: SlideIR = { body: [HERO('A'), HERO('B'), HERO('C')] };
    const next = duplicateNodeAtPath(ir, ['body', 0], 3);
    expect(next.body).toHaveLength(4);
    expect((next.body[3] as { title: { text: string }[] }).title[0].text).toBe('A');
  });

  it('clone is structurally independent of the source', () => {
    const original: SlideNode = {
      type: 'two_column',
      left: [HERO('L')],
      right: [PROSE('R')],
    };
    const ir: SlideIR = { body: [original] };
    const next = duplicateNodeAtPath(ir, ['body', 0]);
    const a = next.body[0];
    const b = next.body[1];
    if (a.type !== 'two_column' || b.type !== 'two_column') throw new Error('expected two_columns');
    // Mutating the clone must not affect the source.
    b.left.length = 0;
    expect((next.body[0] as typeof a).left).toHaveLength(1);
  });
});

describe('moveNodeAtPath', () => {
  it('moves within the same body[] (forward)', () => {
    const ir: SlideIR = { body: [HERO('A'), HERO('B'), HERO('C'), HERO('D')] };
    const { root, newPath } = moveNodeAtPath(ir, ['body', 0], ['body'], 3);
    expect(newPath).toEqual(['body', 2]);
    expect((root.body[2] as { title: { text: string }[] }).title[0].text).toBe('A');
    expect((root.body[0] as { title: { text: string }[] }).title[0].text).toBe('B');
  });

  it('moves within the same body[] (backward)', () => {
    const ir: SlideIR = { body: [HERO('A'), HERO('B'), HERO('C'), HERO('D')] };
    const { root, newPath } = moveNodeAtPath(ir, ['body', 3], ['body'], 1);
    expect(newPath).toEqual(['body', 1]);
    expect((root.body[1] as { title: { text: string }[] }).title[0].text).toBe('D');
  });

  it('moves between two_column branches (left → right)', () => {
    const ir: SlideIR = {
      body: [
        {
          type: 'two_column',
          left: [HERO('L1'), HERO('L2')],
          right: [PROSE('R1')],
        },
      ],
    };
    const { root, newPath } = moveNodeAtPath(
      ir,
      ['body', 0, 'left', 0],
      ['body', 0, 'right'],
      1,
    );
    expect(newPath).toEqual(['body', 0, 'right', 1]);
    const tc = root.body[0];
    if (tc.type !== 'two_column') throw new Error('expected two_column');
    expect(tc.left).toHaveLength(1);
    expect(tc.right).toHaveLength(2);
    expect((tc.right[1] as { title: { text: string }[] }).title[0].text).toBe('L1');
  });

  it('rejects moving a node into its own subtree', () => {
    const ir: SlideIR = {
      body: [
        {
          type: 'two_column',
          left: [HERO('L')],
          right: [PROSE('R')],
        },
      ],
    };
    expect(() =>
      moveNodeAtPath(ir, ['body', 0], ['body', 0, 'left'], 0),
    ).toThrow(/own subtree/);
  });

  it('rejects moving a non-leaf into a leaf-only container', () => {
    const ir: SlideIR = {
      body: [
        { type: 'two_column', left: [HERO('L')], right: [PROSE('R')] },
        { type: 'two_column', left: [], right: [] },
      ],
    };
    // Try to move body[0] (two_column) into body[1].left[0] — disallowed.
    expect(() =>
      moveNodeAtPath(ir, ['body', 0], ['body', 1, 'left'], 0),
    ).toThrow(/leaf nodes only|leaf node/);
  });

  it('no-op move (same parent, same index) returns unchanged path', () => {
    const ir: SlideIR = { body: [HERO('A'), HERO('B')] };
    const { newPath } = moveNodeAtPath(ir, ['body', 0], ['body'], 0);
    expect(newPath).toEqual(['body', 0]);
  });
});
