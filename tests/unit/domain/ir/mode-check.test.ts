import { describe, it, expect } from 'vitest';
import { lintNodesForMode } from '../../../../src/domain/ir/mode-check.js';
import { rt } from '../../../../src/domain/ir/rich-text.js';
import type { SlideNode } from '../../../../src/domain/ir/nodes.js';

describe('lintNodesForMode (v4.8 mode-aware lint)', () => {
  it('passes a slide-IR body of bimodal nodes (slide mode)', () => {
    const body: SlideNode[] = [
      { type: 'hero', title: rt('Hi') },
      { type: 'prose', body: rt('p') },
      {
        type: 'grid',
        columns: 2,
        cells: [[{ type: 'prose', body: rt('a') }], [{ type: 'prose', body: rt('b') }]],
      },
    ];
    expect(lintNodesForMode(body, 'slide')).toEqual([]);
  });

  it('rejects doc-only nodes in slide mode', () => {
    const body: SlideNode[] = [
      { type: 'hero', title: rt('H') },
      { type: 'page_break' },
      { type: 'toc' },
      { type: 'bibliography', entries: [{ text: rt('x') }] },
    ];
    const issues = lintNodesForMode(body, 'slide');
    expect(issues).toHaveLength(3);
    expect(issues.map((i) => i.nodeType).sort()).toEqual(['bibliography', 'page_break', 'toc']);
    expect(issues[0].path).toBe('body[1]');
  });

  it('rejects slide-only nodes in doc mode', () => {
    const body: SlideNode[] = [
      { type: 'heading', level: 2, text: rt('Chapter 1') },
      { type: 'section_divider', ornament: 'rule' },
    ];
    const issues = lintNodesForMode(body, 'doc');
    expect(issues).toHaveLength(1);
    expect(issues[0].nodeType).toBe('section_divider');
    expect(issues[0].path).toBe('body[1]');
  });

  it('passes a doc-IR body containing toc + bibliography + page_break', () => {
    const body: SlideNode[] = [
      { type: 'toc' },
      { type: 'page_break' },
      { type: 'prose', body: rt('Body text.') },
      { type: 'bibliography', entries: [{ text: rt('ref') }] },
    ];
    expect(lintNodesForMode(body, 'doc')).toEqual([]);
  });
});
