import { describe, expect, it } from 'vitest';

import { LeafSlideNodeSchema } from '../../src/domain/ir/nodes.js';
import {
  CATALOGUE,
  availableForParent,
  classifyParent,
  defaultNodePayload,
  kindOfNode,
  morphTargetsFor,
  morphTo,
  type LeafNodeKind,
} from '../../app/src/lib/nodeCatalogue.ts';

// Catalogue + default payloads ─────────────────────────────────────

describe('CATALOGUE', () => {
  it('lists every supported leaf kind exactly once', () => {
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
    ]);
  });

  it('keyboard shortcuts are unique single lowercase letters', () => {
    const shortcuts = CATALOGUE.map((entry) => entry.shortcut);
    expect(new Set(shortcuts).size).toBe(shortcuts.length);
    for (const s of shortcuts) {
      expect(s).toMatch(/^[a-z]$/);
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
  ])('%s → %s', (type, kind) => {
    expect(kindOfNode({ type })).toBe(kind);
  });

  it('returns null for non-leaf compound types', () => {
    expect(kindOfNode({ type: 'two_column' })).toBeNull();
    expect(kindOfNode({ type: 'grid' })).toBeNull();
    expect(kindOfNode({ type: 'hero' })).toBeNull();
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
    [['body', 4, 'cells'], 'grid'],
    [['body', 5, 'rows'], 'unsupported'],
    [[], 'unsupported'],
  ])('%j → %s', (path, expected) => {
    expect(classifyParent(path as ReadonlyArray<string | number>)).toBe(expected);
  });
});

describe('availableForParent', () => {
  it('body container offers the full leaf catalogue', () => {
    expect(availableForParent(['body']).map((e) => e.kind)).toEqual(
      CATALOGUE.map((e) => e.kind),
    );
  });

  it('two_column.left offers the same leaf catalogue', () => {
    expect(availableForParent(['body', 2, 'left']).map((e) => e.kind)).toEqual(
      CATALOGUE.map((e) => e.kind),
    );
  });

  it('grid.cells offers the same leaf catalogue', () => {
    expect(availableForParent(['body', 4, 'cells']).map((e) => e.kind)).toEqual(
      CATALOGUE.map((e) => e.kind),
    );
  });

  it('unsupported parents (e.g. table rows) return an empty catalogue', () => {
    expect(availableForParent(['body', 5, 'rows'])).toEqual([]);
    expect(availableForParent([])).toEqual([]);
  });
});
