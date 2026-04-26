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
  TwoColumnNodeSchema,
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

  it('SLIDE_NODE_TYPES enumerates the v4.7 catalog', () => {
    expect([...SLIDE_NODE_TYPES].sort()).toEqual(
      ['callout', 'divider', 'heading', 'hero', 'image', 'list', 'prose', 'quote', 'table', 'two_column'].sort(),
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
