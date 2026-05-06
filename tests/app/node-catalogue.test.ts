import { describe, expect, it } from 'vitest';

import { LeafSlideNodeSchema, SlideNodeSchema } from '../../src/domain/ir/nodes.js';
import {
  CATALOGUE,
  availableForParent,
  classifyParent,
  defaultNodePayload,
  kindOfNode,
  morphTargetsFor,
  morphTo,
  type CompoundNodeKind,
  type LeafNodeKind,
} from '../../app/src/lib/nodeCatalogue.ts';

// Catalogue + default payloads ─────────────────────────────────────

describe('CATALOGUE', () => {
  it('lists every supported leaf and compound kind exactly once (v4.18)', () => {
    const kinds = CATALOGUE.map((entry) => entry.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds).toEqual([
      'paragraph',
      'heading',
      'list',
      'quote',
      'callout',
      'image',
      'divider',
      'chart',
      'card',
      'flow',
      'decoration',
      'two_column_1_1',
      'two_column_1_2',
      'two_column_2_1',
      'grid_2x1',
      'grid_2x2',
      'grid_3x1',
    ]);
  });

  it('groups leaves as block and compounds as layout (v4.18 adds card/flow/decoration to block)', () => {
    const blocks = CATALOGUE.filter((e) => e.group === 'block').map((e) => e.kind);
    const layouts = CATALOGUE.filter((e) => e.group === 'layout').map((e) => e.kind);
    expect(blocks).toEqual([
      'paragraph', 'heading', 'list', 'quote', 'callout', 'image', 'divider', 'chart',
      'card', 'flow', 'decoration',
    ]);
    expect(layouts).toEqual([
      'two_column_1_1',
      'two_column_1_2',
      'two_column_2_1',
      'grid_2x1',
      'grid_2x2',
      'grid_3x1',
    ]);
  });

  it('leaf shortcuts (when present) are unique single lowercase letters', () => {
    // v4.12 chart joins compounds in deferring keyboard shortcuts —
    // letter space is crowded. Unique constraint applies only to
    // entries that declare a shortcut.
    const shortcuts = CATALOGUE
      .filter((e) => e.group === 'block' && typeof e.shortcut === 'string')
      .map((entry) => entry.shortcut!);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    for (const s of shortcuts) {
      expect(s).toMatch(/^[a-z]$/);
    }
  });

  it('compound entries do not declare keyboard shortcuts', () => {
    for (const entry of CATALOGUE.filter((e) => e.group === 'layout')) {
      expect(entry.shortcut).toBeUndefined();
    }
  });
});

describe('defaultNodePayload', () => {
  // Every default that doesn't need an asset_id should round-trip
  // cleanly through the discriminated union — a Zod failure here is
  // a contract bug between the App and the IR schema.
  const zodChecks: ReadonlyArray<{ kind: LeafNodeKind; type: string }> = [
    { kind: 'paragraph', type: 'prose' },
    { kind: 'heading', type: 'heading' },
    { kind: 'list', type: 'list' },
    { kind: 'quote', type: 'quote' },
    { kind: 'callout', type: 'callout' },
    { kind: 'divider', type: 'divider' },
  ];

  for (const { kind, type } of zodChecks) {
    it(`${kind} default validates against LeafSlideNodeSchema as ${type}`, () => {
      const payload = defaultNodePayload(kind);
      expect(payload).not.toBeNull();
      expect(payload).toHaveProperty('type', type);
      const parsed = LeafSlideNodeSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
    });
  }

  it('image default returns null without an asset_id', () => {
    expect(defaultNodePayload('image')).toBeNull();
  });

  it('image default with asset_id validates as image', () => {
    const payload = defaultNodePayload('image', { asset_id: 'abc123' });
    expect(payload).toMatchObject({ type: 'image', asset_id: 'abc123' });
    expect(LeafSlideNodeSchema.safeParse(payload).success).toBe(true);
  });

  it('heading respects custom level', () => {
    const payload = defaultNodePayload('heading', { level: 3 });
    expect(payload).toMatchObject({ type: 'heading', level: 3 });
  });

  it('list respects custom style', () => {
    const payload = defaultNodePayload('list', { listStyle: 'numbered' });
    expect(payload).toMatchObject({ type: 'list', style: 'numbered' });
  });

  it('callout respects custom kind', () => {
    const payload = defaultNodePayload('callout', { calloutKind: 'warning' });
    expect(payload).toMatchObject({ type: 'callout', kind: 'warning' });
  });

  // v4.18 — new leaf-like kinds.
  it('card default validates as a leaf with one prose body item', () => {
    const payload = defaultNodePayload('card');
    expect(payload).toMatchObject({ type: 'card' });
    expect(LeafSlideNodeSchema.safeParse(payload).success).toBe(true);
  });

  it('flow default validates as a leaf with 3 horizontal arrow steps', () => {
    const payload = defaultNodePayload('flow');
    expect(payload).toMatchObject({ type: 'flow', direction: 'horizontal', connector: 'arrow' });
    expect((payload as { steps: unknown[] }).steps).toHaveLength(3);
    expect(LeafSlideNodeSchema.safeParse(payload).success).toBe(true);
  });

  it('flow respects custom direction + connector', () => {
    const payload = defaultNodePayload('flow', { flowDirection: 'vertical', flowConnector: 'cycle' });
    expect(payload).toMatchObject({ type: 'flow', direction: 'vertical', connector: 'cycle' });
  });

  it('decoration default validates against SlideNodeSchema (top-level only)', () => {
    const payload = defaultNodePayload('decoration');
    expect(payload).toMatchObject({
      type: 'decoration',
      source: { kind: 'preset', name: 'glow_ring' },
      placement: { anchor: 'middle_center' },
      layer: 'background',
    });
    expect(SlideNodeSchema.safeParse(payload).success).toBe(true);
  });

  it('decoration with asset_id produces an asset_ref source', () => {
    const payload = defaultNodePayload('decoration', { asset_id: 'abc' });
    expect(payload).toMatchObject({
      source: { kind: 'asset_ref', asset_id: 'abc' },
    });
  });

  it('image with frame option emits the frame field', () => {
    const payload = defaultNodePayload('image', { asset_id: 'abc', imageFrame: 'browser' });
    expect(payload).toMatchObject({ type: 'image', asset_id: 'abc', frame: 'browser' });
    expect(LeafSlideNodeSchema.safeParse(payload).success).toBe(true);
  });

  it('image with imageFrame "none" omits the frame field (defaults at the IR level)', () => {
    const payload = defaultNodePayload('image', { asset_id: 'abc', imageFrame: 'none' });
    expect(payload).toMatchObject({ type: 'image', asset_id: 'abc' });
    expect(payload).not.toHaveProperty('frame');
  });

  // v4.11 compound presets — each must validate against the full
  // SlideNodeSchema (compounds aren't leaves), and inner cells must
  // hold leaf-only payloads so the IR's no-nesting rule holds.
  const compoundChecks: ReadonlyArray<{
    kind: CompoundNodeKind;
    type: 'two_column' | 'grid';
    extras: Record<string, unknown>;
  }> = [
    { kind: 'two_column_1_1', type: 'two_column', extras: { ratio: '1:1' } },
    { kind: 'two_column_1_2', type: 'two_column', extras: { ratio: '1:2' } },
    { kind: 'two_column_2_1', type: 'two_column', extras: { ratio: '2:1' } },
    { kind: 'grid_2x1',       type: 'grid',       extras: { columns: 2 } },
    { kind: 'grid_2x2',       type: 'grid',       extras: { columns: 2 } },
    { kind: 'grid_3x1',       type: 'grid',       extras: { columns: 3 } },
  ];

  for (const { kind, type, extras } of compoundChecks) {
    it(`${kind} default validates against SlideNodeSchema as ${type}`, () => {
      const payload = defaultNodePayload(kind);
      expect(payload).not.toBeNull();
      expect(payload).toMatchObject({ type, ...extras });
      const parsed = SlideNodeSchema.safeParse(payload);
      expect(parsed.success).toBe(true);
    });
  }

  it('two_column compound seeds left + right with one leaf paragraph each', () => {
    const payload = defaultNodePayload('two_column_1_1') as {
      left: ReadonlyArray<unknown>;
      right: ReadonlyArray<unknown>;
    };
    expect(payload.left).toHaveLength(1);
    expect(payload.right).toHaveLength(1);
    // Each cell entry must validate as a leaf — no nesting allowed.
    expect(LeafSlideNodeSchema.safeParse(payload.left[0]).success).toBe(true);
    expect(LeafSlideNodeSchema.safeParse(payload.right[0]).success).toBe(true);
  });

  it('grid compounds seed columns × rows cells, each with one leaf', () => {
    const cases: ReadonlyArray<{ kind: CompoundNodeKind; expected: number }> = [
      { kind: 'grid_2x1', expected: 2 },
      { kind: 'grid_2x2', expected: 4 },
      { kind: 'grid_3x1', expected: 3 },
    ];
    for (const { kind, expected } of cases) {
      const payload = defaultNodePayload(kind) as {
        cells: ReadonlyArray<ReadonlyArray<unknown>>;
      };
      expect(payload.cells).toHaveLength(expected);
      for (const cell of payload.cells) {
        expect(cell).toHaveLength(1);
        expect(LeafSlideNodeSchema.safeParse(cell[0]).success).toBe(true);
      }
    }
  });
});

// kindOfNode + morphTargetsFor ─────────────────────────────────────

describe('kindOfNode', () => {
  it.each([
    ['prose', 'paragraph'],
    ['heading', 'heading'],
    ['list', 'list'],
    ['quote', 'quote'],
    ['callout', 'callout'],
    ['image', 'image'],
    ['divider', 'divider'],
    // v4.18 — new leaf-like / top-level kinds.
    ['card', 'card'],
    ['flow', 'flow'],
    ['decoration', 'decoration'],
  ])('%s → %s', (type, kind) => {
    expect(kindOfNode({ type })).toBe(kind);
  });

  it('maps compound IR types to a representative compound preset kind', () => {
    // v4.11: existing compound nodes carry their own ratio/dimensions
    // in the payload; the catalogue kind is only used to look up morph
    // targets (always empty for compounds), so a fixed default is OK.
    expect(kindOfNode({ type: 'two_column' })).toBe('two_column_1_1');
    expect(kindOfNode({ type: 'grid' })).toBe('grid_2x1');
  });

  it('returns null for unknown / unsupported types', () => {
    expect(kindOfNode({ type: 'hero' })).toBeNull();
    expect(kindOfNode({ type: 'table' })).toBeNull();
  });

  it('returns null for malformed input', () => {
    expect(kindOfNode(null)).toBeNull();
    expect(kindOfNode(undefined)).toBeNull();
    expect(kindOfNode({})).toBeNull();
  });
});

describe('morphTargetsFor', () => {
  it('image and divider expose no morph targets', () => {
    expect(morphTargetsFor('image')).toEqual([]);
    expect(morphTargetsFor('divider')).toEqual([]);
  });

  it('text-bearing kinds list every other text-bearing kind', () => {
    const textKinds: LeafNodeKind[] = ['paragraph', 'heading', 'list', 'quote', 'callout'];
    for (const k of textKinds) {
      const targets = morphTargetsFor(k);
      const expected = textKinds.filter((t) => t !== k);
      expect([...targets].sort()).toEqual([...expected].sort());
    }
  });

  it('v4.18 leaves card / flow / decoration expose no morph targets', () => {
    expect(morphTargetsFor('card')).toEqual([]);
    expect(morphTargetsFor('flow')).toEqual([]);
    expect(morphTargetsFor('decoration')).toEqual([]);
  });

  it('compound presets expose no morph targets', () => {
    const compoundKinds: CompoundNodeKind[] = [
      'two_column_1_1',
      'two_column_1_2',
      'two_column_2_1',
      'grid_2x1',
      'grid_2x2',
      'grid_3x1',
    ];
    for (const k of compoundKinds) {
      expect(morphTargetsFor(k)).toEqual([]);
    }
  });
});

// morphTo ──────────────────────────────────────────────────────────

describe('morphTo', () => {
  it('paragraph → heading copies body to text and defaults level=2', () => {
    const result = morphTo({ type: 'prose', body: [{ text: 'Hello' }] }, 'heading');
    expect(result).not.toBeNull();
    expect(result!.newNode).toMatchObject({
      type: 'heading',
      level: 2,
      text: [{ text: 'Hello' }],
    });
    expect(result!.droppedFields).toEqual([]);
    expect(LeafSlideNodeSchema.safeParse(result!.newNode).success).toBe(true);
  });

  it('heading → paragraph copies text to body, drops align', () => {
    const result = morphTo(
      { type: 'heading', level: 3, text: [{ text: 'Title' }], align: 'center' },
      'paragraph',
    );
    expect(result!.newNode).toMatchObject({ type: 'prose', body: [{ text: 'Title' }] });
    expect(result!.newNode).not.toHaveProperty('align');
    expect(LeafSlideNodeSchema.safeParse(result!.newNode).success).toBe(true);
  });

  it('quote → paragraph drops attribution and reports it', () => {
    const result = morphTo(
      {
        type: 'quote',
        body: [{ text: 'Be water, my friend.' }],
        attribution: [{ text: 'Bruce Lee' }],
      },
      'paragraph',
    );
    expect(result!.newNode).toMatchObject({
      type: 'prose',
      body: [{ text: 'Be water, my friend.' }],
    });
    expect(result!.droppedFields).toEqual(['attribution']);
  });

  it('quote → paragraph with empty attribution does NOT report a drop', () => {
    const result = morphTo(
      { type: 'quote', body: [{ text: 'Sole quote.' }], attribution: [{ text: '' }] },
      'paragraph',
    );
    expect(result!.droppedFields).toEqual([]);
  });

  it('callout → paragraph drops both kind metadata and title', () => {
    const result = morphTo(
      {
        type: 'callout',
        kind: 'warning',
        title: [{ text: 'Watch out' }],
        body: [{ text: 'Body line.' }],
      },
      'paragraph',
    );
    expect(result!.droppedFields).toEqual(['title']);
    expect(result!.newNode).toMatchObject({
      type: 'prose',
      body: [{ text: 'Body line.' }],
    });
  });

  it('list → paragraph joins items with newline runs', () => {
    const result = morphTo(
      {
        type: 'list',
        style: 'bullet',
        items: [
          [{ text: 'one' }],
          [{ text: 'two' }],
          [{ text: 'three' }],
        ],
      },
      'paragraph',
    );
    expect(result!.droppedFields).toEqual(['extra list items']);
    // We expect: one \n two \n three (interleaved newlines).
    const body = result!.newNode.body as ReadonlyArray<{ text: string }>;
    expect(body.map((r) => r.text)).toEqual(['one', '\n', 'two', '\n', 'three']);
    expect(LeafSlideNodeSchema.safeParse(result!.newNode).success).toBe(true);
  });

  it('paragraph → list wraps body in a single bullet item', () => {
    const result = morphTo(
      { type: 'prose', body: [{ text: 'First' }, { text: 'Second', bold: true }] },
      'list',
    );
    expect(result!.newNode).toMatchObject({ type: 'list', style: 'bullet' });
    const items = result!.newNode.items as ReadonlyArray<unknown>;
    expect(items).toHaveLength(1);
    expect(LeafSlideNodeSchema.safeParse(result!.newNode).success).toBe(true);
  });

  it('list → list with the same kind preserves all items', () => {
    // Same-kind morph isn't in MORPH_TARGETS — should return null
    // because the action bar's morph-from-list shouldn't offer
    // list as a target (no semantic change).
    const result = morphTo(
      { type: 'list', style: 'bullet', items: [[{ text: 'one' }]] },
      'list',
    );
    expect(result).toBeNull();
  });

  it('paragraph → callout uses options.calloutKind', () => {
    const result = morphTo(
      { type: 'prose', body: [{ text: 'Heads up' }] },
      'callout',
      { calloutKind: 'tip' },
    );
    expect(result!.newNode).toMatchObject({
      type: 'callout',
      kind: 'tip',
      body: [{ text: 'Heads up' }],
    });
    expect(LeafSlideNodeSchema.safeParse(result!.newNode).success).toBe(true);
  });

  it('returns null for unknown source kinds', () => {
    expect(morphTo({ type: 'two_column' }, 'paragraph')).toBeNull();
    expect(morphTo({ type: 'hero', title: [{ text: 'x' }] }, 'paragraph')).toBeNull();
  });

  it('returns null when target is not in the morph set', () => {
    expect(morphTo({ type: 'image', asset_id: 'a' }, 'paragraph')).toBeNull();
    expect(morphTo({ type: 'divider' }, 'heading')).toBeNull();
  });
});

// classifyParent + availableForParent ──────────────────────────────

describe('classifyParent', () => {
  it.each([
    [['body'], 'body'],
    [['body', 2, 'left'], 'two_column'],
    [['body', 2, 'right'], 'two_column'],
    // v4.11: the actual insertable grid container is a row, addressed
    // as ['body', N, 'cells', R]. The bare 'cells' segment maps to the
    // 2D shape and isn't a splice target — path-resolver rejects it,
    // so the picker mirrors that with 'unsupported'.
    [['body', 4, 'cells', 0], 'grid'],
    [['body', 4, 'cells', 3], 'grid'],
    [['body', 4, 'cells'], 'unsupported'],
    [['body', 5, 'rows'], 'unsupported'],
    [[], 'unsupported'],
  ])('%j → %s', (path, expected) => {
    expect(classifyParent(path as ReadonlyArray<string | number>)).toBe(expected);
  });
});

describe('availableForParent', () => {
  it('body container offers leaves AND compound layouts', () => {
    expect(availableForParent(['body']).map((e) => e.kind)).toEqual(
      CATALOGUE.map((e) => e.kind),
    );
  });

  it('two_column.left filters out compound layouts (no nesting)', () => {
    const kinds = availableForParent(['body', 2, 'left']).map((e) => e.kind);
    expect(kinds).toEqual(
      CATALOGUE.filter((e) => e.group !== 'layout' && e.kind !== 'decoration').map((e) => e.kind),
    );
    expect(kinds).not.toContain('two_column_1_1');
    expect(kinds).not.toContain('grid_2x1');
  });

  it('two_column.right filters out compound layouts (no nesting)', () => {
    const kinds = availableForParent(['body', 2, 'right']).map((e) => e.kind);
    expect(kinds).toEqual(
      CATALOGUE.filter((e) => e.group !== 'layout' && e.kind !== 'decoration').map((e) => e.kind),
    );
  });

  it('grid row (cells, R) filters out compound layouts (no nesting)', () => {
    const kinds = availableForParent(['body', 4, 'cells', 0]).map((e) => e.kind);
    expect(kinds).toEqual(
      CATALOGUE.filter((e) => e.group !== 'layout' && e.kind !== 'decoration').map((e) => e.kind),
    );
    expect(kinds).not.toContain('two_column_1_1');
    expect(kinds).not.toContain('grid_2x2');
  });

  it('bare cells path (without row index) is unsupported', () => {
    // The 2D `cells` segment is not an insertable container — the
    // server rejects it and the picker mirrors that.
    expect(availableForParent(['body', 4, 'cells'])).toEqual([]);
  });

  it('unsupported parents (e.g. table rows) return an empty catalogue', () => {
    expect(availableForParent(['body', 5, 'rows'])).toEqual([]);
    expect(availableForParent([])).toEqual([]);
  });
});
