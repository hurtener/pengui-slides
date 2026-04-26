import { describe, it, expect } from 'vitest';
import { replaceNodeAtPath } from '../../../../../src/domain/ir/operations/replace-node.js';
import { rt } from '../../../../../src/domain/ir/rich-text.js';
import type { SlideIR, SlideNode } from '../../../../../src/domain/ir/index.js';

const HERO: SlideNode = { type: 'hero', title: rt('Old') };
const NEW_HERO: SlideNode = { type: 'hero', title: rt('New') };
const PROSE: SlideNode = { type: 'prose', body: rt('paragraph') };

describe('replaceNodeAtPath', () => {
  it('replaces a top-level body[i] node and returns a new tree', () => {
    const ir: SlideIR = { body: [HERO, PROSE] };
    const next = replaceNodeAtPath(ir, ['body', 0], NEW_HERO);

    expect(next.body[0]).toEqual(NEW_HERO);
    expect(next.body[1]).toEqual(PROSE);
    // input is not mutated
    expect(ir.body[0]).toEqual(HERO);
    expect(next).not.toBe(ir);
  });

  it('descends into two_column.left[i]', () => {
    const ir: SlideIR = {
      body: [
        {
          type: 'two_column',
          left: [HERO],
          right: [PROSE],
        },
      ],
    };
    const next = replaceNodeAtPath(ir, ['body', 0, 'left', 0], NEW_HERO);
    const tc = next.body[0];
    if (tc.type !== 'two_column') throw new Error('expected two_column');
    expect(tc.left[0]).toEqual(NEW_HERO);
    expect(tc.right[0]).toEqual(PROSE);
  });

  it('descends into two_column.right[i]', () => {
    const ir: SlideIR = {
      body: [
        {
          type: 'two_column',
          left: [HERO],
          right: [PROSE],
        },
      ],
    };
    const next = replaceNodeAtPath(ir, ['body', 0, 'right', 0], NEW_HERO);
    const tc = next.body[0];
    if (tc.type !== 'two_column') throw new Error('expected two_column');
    expect(tc.right[0]).toEqual(NEW_HERO);
  });

  it('rejects nested two_column inside a two_column branch (leaf-only)', () => {
    const ir: SlideIR = {
      body: [
        {
          type: 'two_column',
          left: [HERO],
          right: [PROSE],
        },
      ],
    };
    const nestedTwoColumn: SlideNode = {
      type: 'two_column',
      left: [HERO],
      right: [PROSE],
    };
    expect(() => replaceNodeAtPath(ir, ['body', 0, 'left', 0], nestedTwoColumn)).toThrow(
      /must be a leaf node/,
    );
  });

  it('rejects out-of-range index', () => {
    const ir: SlideIR = { body: [HERO] };
    expect(() => replaceNodeAtPath(ir, ['body', 5], NEW_HERO)).toThrow(/out of range/);
  });

  it('rejects path that does not start with "body"', () => {
    const ir: SlideIR = { body: [HERO] };
    expect(() => replaceNodeAtPath(ir, ['head', 0], NEW_HERO)).toThrow(/must start with "body"/);
  });

  it('rejects step that descends into a non-container leaf node', () => {
    const ir: SlideIR = { body: [HERO] };
    expect(() => replaceNodeAtPath(ir, ['body', 0, 'left', 0], NEW_HERO)).toThrow(
      /cannot descend into a hero node/,
    );
  });

  it('rejects wrong key on two_column (not "left"/"right")', () => {
    const ir: SlideIR = {
      body: [{ type: 'two_column', left: [HERO], right: [PROSE] }],
    };
    expect(() => replaceNodeAtPath(ir, ['body', 0, 'middle', 0], NEW_HERO)).toThrow(
      /must be "left" or "right"/,
    );
  });

  it('rejects path that addresses the body root itself', () => {
    const ir: SlideIR = { body: [HERO] };
    expect(() => replaceNodeAtPath(ir, ['body'], NEW_HERO)).toThrow(/at least one body child/);
  });
});
