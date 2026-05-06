import { describe, it, expect } from 'vitest';
import {
  HeroNodeSchema,
  ProseNodeSchema,
  ImageNodeSchema,
  CalloutNodeSchema,
  HeadingNodeSchema,
  ListNodeSchema,
  DividerNodeSchema,
  QuoteNodeSchema,
  TableNodeSchema,
  ChartNodeSchema,
  ChartTypeSchema,
  TwoColumnNodeSchema,
  GridNodeSchema,
  TocNodeSchema,
  SectionDividerNodeSchema,
  BibliographyNodeSchema,
  PageBreakNodeSchema,
  SlideNodeSchema,
  LeafSlideNodeSchema,
  SLIDE_NODE_TYPES,
} from '../../../../src/domain/ir/nodes.js';
import { rt } from '../../../../src/domain/ir/rich-text.js';

describe('HeroNodeSchema', () => {
  it('accepts the minimum (type + title)', () => {
    expect(() => HeroNodeSchema.parse({ type: 'hero', title: rt('Hi') })).not.toThrow();
  });

  it('accepts subtitle, eyebrow, align', () => {
    const node = {
      type: 'hero',
      title: rt('T'),
      subtitle: rt('S'),
      eyebrow: rt('E'),
      align: 'center',
    };
    expect(HeroNodeSchema.parse(node)).toMatchObject(node);
  });

  it('rejects when title is missing', () => {
    expect(() => HeroNodeSchema.parse({ type: 'hero' })).toThrow();
  });

  it('rejects unknown fields', () => {
    expect(() => HeroNodeSchema.parse({ type: 'hero', title: rt('T'), subtitleX: rt('?') })).toThrow();
  });

  it('rejects align values outside the enum', () => {
    expect(() => HeroNodeSchema.parse({ type: 'hero', title: rt('T'), align: 'right' })).toThrow();
  });
});

describe('ProseNodeSchema', () => {
  it('accepts body with rich-text runs', () => {
    expect(() => ProseNodeSchema.parse({ type: 'prose', body: rt('para', { text: 'X', bold: true }) })).not.toThrow();
  });

  it('accepts empty body', () => {
    expect(() => ProseNodeSchema.parse({ type: 'prose', body: [] })).not.toThrow();
  });

  it('rejects when body is a string instead of RichText array', () => {
    expect(() => ProseNodeSchema.parse({ type: 'prose', body: 'hello' })).toThrow();
  });
});

describe('ImageNodeSchema', () => {
  it('accepts asset_id + optional caption + fit', () => {
    const node = { type: 'image', asset_id: 'asset-123', caption: rt('Cap'), fit: 'cover' };
    expect(ImageNodeSchema.parse(node)).toMatchObject(node);
  });

  it('rejects empty asset_id', () => {
    expect(() => ImageNodeSchema.parse({ type: 'image', asset_id: '' })).toThrow();
  });

  it('rejects fit values outside contain/cover', () => {
    expect(() => ImageNodeSchema.parse({ type: 'image', asset_id: 'a', fit: 'fill' })).toThrow();
  });
});

describe('CalloutNodeSchema', () => {
  it('accepts each kind variant', () => {
    for (const kind of ['note', 'warning', 'tip', 'important'] as const) {
      expect(() => CalloutNodeSchema.parse({ type: 'callout', kind, body: rt('x') })).not.toThrow();
    }
  });

  it('accepts an optional title as RichText', () => {
    const node = { type: 'callout', kind: 'note' as const, title: rt('Heads up'), body: rt('Body text.') };
    expect(CalloutNodeSchema.parse(node)).toMatchObject(node);
  });

  it('normalises a string title into RichText (back-compat with v4.5–v4.6 callouts)', () => {
    const parsed = CalloutNodeSchema.parse({
      type: 'callout', kind: 'note', title: 'Heads up', body: rt('Body text.'),
    });
    expect(parsed.title).toEqual([{ text: 'Heads up' }]);
  });

  it('rejects unknown kind', () => {
    expect(() => CalloutNodeSchema.parse({ type: 'callout', kind: 'urgent', body: rt('x') })).toThrow();
  });
});

describe('TwoColumnNodeSchema', () => {
  it('accepts left/right with leaf nodes', () => {
    const node = {
      type: 'two_column',
      ratio: '1:2',
      left: [{ type: 'hero', title: rt('L') }],
      right: [
        { type: 'prose', body: rt('R') },
        { type: 'image', asset_id: 'a' },
      ],
    };
    expect(() => TwoColumnNodeSchema.parse(node)).not.toThrow();
  });

  it('rejects nested two_column inside left or right (LEAF restriction)', () => {
    const nested = {
      type: 'two_column',
      left: [{ type: 'two_column', left: [], right: [] }],
      right: [],
    };
    expect(() => TwoColumnNodeSchema.parse(nested)).toThrow();
  });

  it('rejects ratio outside the enum', () => {
    expect(() =>
      TwoColumnNodeSchema.parse({ type: 'two_column', ratio: '3:1', left: [], right: [] }),
    ).toThrow();
  });

  it('accepts empty columns (renders as empty halves)', () => {
    expect(() =>
      TwoColumnNodeSchema.parse({ type: 'two_column', left: [], right: [] }),
    ).not.toThrow();
  });
});

describe('SlideNodeSchema (top-level union)', () => {
  it('accepts each registered node type', () => {
    const samples = {
      hero: { type: 'hero', title: rt('T') },
      prose: { type: 'prose', body: rt('B') },
      image: { type: 'image', asset_id: 'a' },
      callout: { type: 'callout', kind: 'note', body: rt('C') },
      two_column: { type: 'two_column', left: [], right: [] },
    };
    for (const sample of Object.values(samples)) {
      expect(() => SlideNodeSchema.parse(sample)).not.toThrow();
    }
  });

  it('rejects an unknown node type', () => {
    expect(() => SlideNodeSchema.parse({ type: 'metric_grid', items: [] })).toThrow();
  });

  it('SLIDE_NODE_TYPES enumerates the v4.16 catalog (decoration added)', () => {
    expect([...SLIDE_NODE_TYPES].sort()).toEqual(
      [
        'bibliography',
        'callout',
        'card',
        'chart',
        'decoration',
        'divider',
        'grid',
        'heading',
        'hero',
        'image',
        'list',
        'page_break',
        'prose',
        'quote',
        'section_divider',
        'table',
        'toc',
        'two_column',
      ].sort(),
    );
  });
});

describe('LeafSlideNodeSchema', () => {
  it('accepts leaf nodes', () => {
    expect(() => LeafSlideNodeSchema.parse({ type: 'hero', title: rt('T') })).not.toThrow();
  });

  it('rejects two_column at the leaf level', () => {
    expect(() => LeafSlideNodeSchema.parse({ type: 'two_column', left: [], right: [] })).toThrow();
  });

  it('accepts the new v4.7 leaves (heading, list, divider, quote, table)', () => {
    const samples = [
      { type: 'heading', level: 2, text: rt('H') },
      { type: 'list', style: 'bullet', items: [rt('a')] },
      { type: 'divider' },
      { type: 'quote', body: rt('q') },
      { type: 'table', rows: [[rt('a'), rt('b')]] },
    ];
    for (const s of samples) {
      expect(() => LeafSlideNodeSchema.parse(s)).not.toThrow();
    }
  });

  it('accepts the v4.12 chart leaf', () => {
    expect(() =>
      LeafSlideNodeSchema.parse({
        type: 'chart',
        chart_type: 'bar',
        data: [[1, 2, 3]],
      }),
    ).not.toThrow();
  });
});

describe('ChartNodeSchema', () => {
  it('accepts a minimal bar chart', () => {
    const node = { type: 'chart', chart_type: 'bar', data: [[1, 2, 3]] };
    expect(ChartNodeSchema.parse(node)).toMatchObject(node);
  });

  it('accepts every chart_type listed in ChartTypeSchema', () => {
    const expected = [
      'bar', 'stacked_bar', 'line', 'area',
      'scatter', 'pie', 'donut', 'histogram', 'heatmap', 'radar',
    ] as const;
    expect([...ChartTypeSchema.options].sort()).toEqual([...expected].sort());
    for (const chart_type of expected) {
      expect(() =>
        ChartNodeSchema.parse({ type: 'chart', chart_type, data: [[1]] }),
      ).not.toThrow();
    }
  });

  it('accepts series_labels, category_labels, axis titles, caption, knobs, value_format', () => {
    const node = {
      type: 'chart',
      chart_type: 'line',
      data: [[1, 2, 3], [4, 5, 6]],
      series_labels: ['Revenue', 'Cost'],
      category_labels: ['Q1', 'Q2', 'Q3'],
      x_axis_title: 'Quarter',
      y_axis_title: 'USD',
      caption: rt('Source: 2026 quarterly report'),
      show_legend: true,
      show_grid: false,
      value_format: 'currency' as const,
    };
    expect(ChartNodeSchema.parse(node)).toMatchObject(node);
  });

  it('rejects an unknown chart_type', () => {
    expect(() =>
      ChartNodeSchema.parse({ type: 'chart', chart_type: 'sunburst', data: [[1]] }),
    ).toThrow();
  });

  it('rejects empty data array', () => {
    expect(() =>
      ChartNodeSchema.parse({ type: 'chart', chart_type: 'bar', data: [] }),
    ).toThrow();
  });

  it('rejects unknown fields', () => {
    expect(() =>
      ChartNodeSchema.parse({
        type: 'chart', chart_type: 'bar', data: [[1]], extra: 'nope',
      }),
    ).toThrow();
  });

  it('rejects value_format outside the enum', () => {
    expect(() =>
      ChartNodeSchema.parse({
        type: 'chart', chart_type: 'bar', data: [[1]], value_format: 'kelvin',
      }),
    ).toThrow();
  });
});

describe('HeadingNodeSchema', () => {
  it('accepts levels 1–6', () => {
    for (const level of [1, 2, 3, 4, 5, 6] as const) {
      expect(() => HeadingNodeSchema.parse({ type: 'heading', level, text: rt('H') })).not.toThrow();
    }
  });
  it('rejects level 0 and 7', () => {
    expect(() => HeadingNodeSchema.parse({ type: 'heading', level: 0, text: rt('x') })).toThrow();
    expect(() => HeadingNodeSchema.parse({ type: 'heading', level: 7, text: rt('x') })).toThrow();
  });
});

describe('ListNodeSchema', () => {
  it('accepts each style', () => {
    for (const style of ['bullet', 'numbered', 'checklist'] as const) {
      expect(() => ListNodeSchema.parse({ type: 'list', style, items: [rt('a')] })).not.toThrow();
    }
  });
  it('rejects empty items', () => {
    expect(() => ListNodeSchema.parse({ type: 'list', style: 'bullet', items: [] })).toThrow();
  });
});

describe('DividerNodeSchema', () => {
  it('accepts with and without spacing', () => {
    expect(() => DividerNodeSchema.parse({ type: 'divider' })).not.toThrow();
    expect(() => DividerNodeSchema.parse({ type: 'divider', spacing: 'lg' })).not.toThrow();
  });
});

describe('QuoteNodeSchema', () => {
  it('accepts body alone or body + attribution', () => {
    expect(() => QuoteNodeSchema.parse({ type: 'quote', body: rt('q') })).not.toThrow();
    expect(() =>
      QuoteNodeSchema.parse({ type: 'quote', body: rt('q'), attribution: rt('— author') }),
    ).not.toThrow();
  });
});

describe('TableNodeSchema', () => {
  it('accepts headers + matching rows', () => {
    expect(() =>
      TableNodeSchema.parse({
        type: 'table',
        headers: [rt('A'), rt('B')],
        rows: [[rt('1'), rt('2')], [rt('3'), rt('4')]],
      }),
    ).not.toThrow();
  });
  it('accepts rows without headers', () => {
    expect(() => TableNodeSchema.parse({ type: 'table', rows: [[rt('a')]] })).not.toThrow();
  });
  it('rejects empty rows', () => {
    expect(() => TableNodeSchema.parse({ type: 'table', rows: [] })).toThrow();
  });
  // Row-vs-headers length mismatch is enforced at render time (renderTable
  // pads short rows), not in the Zod schema — see nodes.ts comment.
});

describe('GridNodeSchema', () => {
  it('accepts a 2-column grid with even ratio', () => {
    expect(() =>
      GridNodeSchema.parse({
        type: 'grid',
        columns: 2,
        cells: [[{ type: 'prose', body: rt('a') }], [{ type: 'prose', body: rt('b') }]],
      }),
    ).not.toThrow();
  });
  it('accepts a 3-column grid with weighted ratio + gap + align_items', () => {
    const node = {
      type: 'grid',
      columns: 3 as const,
      ratio: '2:1:1',
      gap: 'lg' as const,
      align_items: 'center' as const,
      cells: [
        [{ type: 'heading', level: 2 as const, text: rt('A') }],
        [{ type: 'heading', level: 2 as const, text: rt('B') }],
        [{ type: 'heading', level: 2 as const, text: rt('C') }],
      ],
    };
    expect(GridNodeSchema.parse(node)).toMatchObject(node);
  });
  it('rejects columns outside 2/3/4', () => {
    expect(() =>
      GridNodeSchema.parse({ type: 'grid', columns: 5, cells: [[]] }),
    ).toThrow();
  });
  it('rejects ratio that is not colon-delimited integers', () => {
    expect(() =>
      GridNodeSchema.parse({ type: 'grid', columns: 2, ratio: '2', cells: [[], []] }),
    ).toThrow();
  });
  it('rejects nested grid inside a cell', () => {
    expect(() =>
      GridNodeSchema.parse({
        type: 'grid',
        columns: 2,
        cells: [[{ type: 'grid', columns: 2, cells: [[], []] }], []],
      }),
    ).toThrow();
  });
  it('rejects empty cells array', () => {
    expect(() => GridNodeSchema.parse({ type: 'grid', columns: 2, cells: [] })).toThrow();
  });
});

describe('TocNodeSchema', () => {
  it('accepts the minimum (just type)', () => {
    expect(() => TocNodeSchema.parse({ type: 'toc' })).not.toThrow();
  });
  it('accepts title + include_kinds + max_depth', () => {
    expect(() =>
      TocNodeSchema.parse({
        type: 'toc',
        title: rt('On these pages'),
        include_kinds: ['chapter_header', 'prose'],
        max_depth: 2,
      }),
    ).not.toThrow();
  });
  it('rejects max_depth outside 1..3', () => {
    expect(() => TocNodeSchema.parse({ type: 'toc', max_depth: 5 })).toThrow();
  });
});

describe('SectionDividerNodeSchema', () => {
  it('accepts the minimum (just type)', () => {
    expect(() => SectionDividerNodeSchema.parse({ type: 'section_divider' })).not.toThrow();
  });
  it('accepts label + ornament', () => {
    expect(() =>
      SectionDividerNodeSchema.parse({
        type: 'section_divider',
        label: rt('Part II'),
        ornament: 'dot',
      }),
    ).not.toThrow();
  });
  it('rejects unknown ornament', () => {
    expect(() =>
      SectionDividerNodeSchema.parse({ type: 'section_divider', ornament: 'star' }),
    ).toThrow();
  });
});

describe('BibliographyNodeSchema', () => {
  it('accepts entries[]', () => {
    expect(() =>
      BibliographyNodeSchema.parse({
        type: 'bibliography',
        entries: [{ text: rt('Smith, J. 2024.') }],
      }),
    ).not.toThrow();
  });
  it('accepts optional entry id + title', () => {
    expect(() =>
      BibliographyNodeSchema.parse({
        type: 'bibliography',
        title: rt('Sources'),
        entries: [{ id: 'smith-2024', text: rt('Smith, J. 2024.') }],
      }),
    ).not.toThrow();
  });
  it('rejects empty entries array', () => {
    expect(() =>
      BibliographyNodeSchema.parse({ type: 'bibliography', entries: [] }),
    ).toThrow();
  });
});

describe('PageBreakNodeSchema', () => {
  it('accepts the minimum (just type)', () => {
    expect(() => PageBreakNodeSchema.parse({ type: 'page_break' })).not.toThrow();
  });
  it('rejects unknown fields', () => {
    expect(() =>
      PageBreakNodeSchema.parse({ type: 'page_break', force: true }),
    ).toThrow();
  });
});
