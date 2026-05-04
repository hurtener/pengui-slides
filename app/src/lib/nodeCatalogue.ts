/**
 * nodeCatalogue — leaf-node primitives the App can offer the user.
 *
 * Used by `NodeTypePicker.svelte` (insert flow) and the `Change ▾`
 * morph button in `BlockActionBar.svelte`. The catalogue is purely
 * App-side metadata — the IR schema in `src/domain/ir/nodes.ts`
 * remains the source of truth, and the server's leaf-only validators
 * stay the gate on every insert / replace.
 *
 * Design rule: every payload composer here must produce a node that
 * round-trips through the discriminated union without a Zod failure.
 * Tests in `tests/app/node-catalogue.test.ts` lock that contract.
 */

import type { TextRun } from './parseRichText.js';

export type RichText = ReadonlyArray<TextRun>;

export type LeafNodeKind =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'quote'
  | 'callout'
  | 'image'
  | 'divider';

/**
 * v4.11: compound layout presets. Each one maps to a fixed
 * `two_column` or `grid` shape so the picker stays one click → commit.
 * Sub-flow ratio / dimension chooser is a v4.11.x polish.
 */
export type CompoundNodeKind =
  | 'two_column_1_1'
  | 'two_column_1_2'
  | 'two_column_2_1'
  | 'grid_2x1'
  | 'grid_2x2'
  | 'grid_3x1';

export type NodeKind = LeafNodeKind | CompoundNodeKind;

export type ListStyle = 'bullet' | 'numbered' | 'checklist';
export type CalloutKind = 'note' | 'warning' | 'tip' | 'important';
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface NodePayloadOptions {
  /** Heading default `2` (h1 is reserved for hero/cover titles). */
  level?: HeadingLevel;
  listStyle?: ListStyle;
  calloutKind?: CalloutKind;
  /** Image only — composers that need an asset_id MUST be passed one
   *  by the caller (the asset picker provides it). Composers without
   *  it return null. */
  asset_id?: string;
}
/**
 * @deprecated v4.11: kept as an alias for the renamed `NodePayloadOptions`
 * so existing call sites compile while the new compound presets land.
 */
export type LeafNodeOptions = NodePayloadOptions;

export type CatalogueGroup = 'block' | 'layout';

export interface CatalogueEntry {
  kind: NodeKind;
  /** Visual grouping in the picker. v4.11 splits 'block' (leaves) from
   *  'layout' (compound presets). */
  group: CatalogueGroup;
  /** Short label shown on the picker tile. */
  label: string;
  /** One-line description shown under the label. */
  hint: string;
  /** Single-glyph icon (rendered in the soul-themed tile). */
  glyph: string;
  /** Optional single-letter keyboard shortcut. Compound presets omit
   *  shortcuts because they're less frequent and the letter space is
   *  crowded; modifier-free uniqueness is enforced by the picker. */
  shortcut?: string;
}

export const CATALOGUE: ReadonlyArray<CatalogueEntry> = [
  // Leaf "block" tiles (v4.9e).
  { kind: 'paragraph', group: 'block',  label: 'Paragraph', hint: 'Body text',                          glyph: '¶', shortcut: 'p' },
  { kind: 'heading',   group: 'block',  label: 'Heading',   hint: 'Section title',                      glyph: 'H', shortcut: 'h' },
  { kind: 'list',      group: 'block',  label: 'List',      hint: 'Bulleted, numbered, or checklist',   glyph: '•', shortcut: 'l' },
  { kind: 'quote',     group: 'block',  label: 'Quote',     hint: 'Pull quote with attribution',        glyph: '“', shortcut: 'q' },
  { kind: 'callout',   group: 'block',  label: 'Callout',   hint: 'Highlighted note / warning / tip',   glyph: 'ℹ︎', shortcut: 'c' },
  { kind: 'image',     group: 'block',  label: 'Image',     hint: 'Insert from the asset library',      glyph: '▣', shortcut: 'i' },
  { kind: 'divider',   group: 'block',  label: 'Divider',   hint: 'Horizontal rule',                    glyph: '━', shortcut: 'd' },
  // v4.11: compound "layout" tiles. Body-only — never offered inside
  // two_column.{left,right} or grid.cells (leaf-only IR rule).
  { kind: 'two_column_1_1', group: 'layout', label: 'Two columns (1:1)', hint: 'Side-by-side, equal width',   glyph: '⫾'  },
  { kind: 'two_column_1_2', group: 'layout', label: 'Two columns (1:2)', hint: 'Narrow left, wide right',     glyph: '▏▎' },
  { kind: 'two_column_2_1', group: 'layout', label: 'Two columns (2:1)', hint: 'Wide left, narrow right',     glyph: '▎▏' },
  { kind: 'grid_2x1',       group: 'layout', label: 'Grid 2×1',          hint: 'Two cells in one row',         glyph: '▦'  },
  { kind: 'grid_2x2',       group: 'layout', label: 'Grid 2×2',          hint: 'Four cells, two rows',         glyph: '▦'  },
  { kind: 'grid_3x1',       group: 'layout', label: 'Grid 3×1',          hint: 'Three cells in one row',       glyph: '▦'  },
];

const PLACEHOLDER_PARAGRAPH: RichText = [{ text: 'New paragraph — click to edit.' }];
const PLACEHOLDER_HEADING: RichText = [{ text: 'New heading' }];
const PLACEHOLDER_LIST_ITEM: RichText = [{ text: 'First item' }];
const PLACEHOLDER_QUOTE: RichText = [{ text: 'Quoted text.' }];
const PLACEHOLDER_QUOTE_ATTRIBUTION: RichText = [{ text: '— Attribution' }];
const PLACEHOLDER_CALLOUT_TITLE: RichText = [{ text: 'Heads up' }];
const PLACEHOLDER_CALLOUT_BODY: RichText = [{ text: 'Add the body of the callout.' }];

/**
 * Build the IR `new_node` payload for a fresh insert. Returns null
 * for kinds that need extra input the caller hasn't provided yet
 * (e.g. `image` without an `asset_id` — caller is expected to open
 * the asset picker, then call again with the asset id).
 */
export function defaultNodePayload(
  kind: NodeKind,
  options: NodePayloadOptions = {},
): Record<string, unknown> | null {
  switch (kind) {
    case 'paragraph':
      return { type: 'prose', body: cloneRichText(PLACEHOLDER_PARAGRAPH) };
    case 'heading':
      return {
        type: 'heading',
        level: options.level ?? 2,
        text: cloneRichText(PLACEHOLDER_HEADING),
      };
    case 'list':
      return {
        type: 'list',
        style: options.listStyle ?? 'bullet',
        items: [cloneRichText(PLACEHOLDER_LIST_ITEM)],
      };
    case 'quote':
      return {
        type: 'quote',
        body: cloneRichText(PLACEHOLDER_QUOTE),
        attribution: cloneRichText(PLACEHOLDER_QUOTE_ATTRIBUTION),
      };
    case 'callout':
      return {
        type: 'callout',
        kind: options.calloutKind ?? 'note',
        title: cloneRichText(PLACEHOLDER_CALLOUT_TITLE),
        body: cloneRichText(PLACEHOLDER_CALLOUT_BODY),
      };
    case 'divider':
      return { type: 'divider' };
    case 'image':
      if (!options.asset_id) return null;
      return { type: 'image', asset_id: options.asset_id };

    // v4.11 compound presets. Each cell is a single placeholder
    // paragraph so the user has something selectable + editable on
    // the very first click. An empty container would render as bare
    // flex divs with no anchor for the bridge to highlight.
    case 'two_column_1_1':
      return twoColumnPayload('1:1');
    case 'two_column_1_2':
      return twoColumnPayload('1:2');
    case 'two_column_2_1':
      return twoColumnPayload('2:1');
    case 'grid_2x1':
      return gridPayload(2, 1);
    case 'grid_2x2':
      return gridPayload(2, 2);
    case 'grid_3x1':
      return gridPayload(3, 1);
  }
}

function twoColumnPayload(ratio: '1:1' | '1:2' | '2:1'): Record<string, unknown> {
  return {
    type: 'two_column',
    ratio,
    left: [{ type: 'prose', body: cloneRichText(PLACEHOLDER_PARAGRAPH) }],
    right: [{ type: 'prose', body: cloneRichText(PLACEHOLDER_PARAGRAPH) }],
  };
}

function gridPayload(columns: 2 | 3 | 4, rows: number): Record<string, unknown> {
  const cells: Array<Array<Record<string, unknown>>> = [];
  for (let i = 0; i < columns * rows; i += 1) {
    cells.push([{ type: 'prose', body: cloneRichText(PLACEHOLDER_PARAGRAPH) }]);
  }
  return { type: 'grid', columns, cells };
}

/**
 * Detect the catalogue kind of an existing IR node, or null when the
 * node type is unknown (hero / table / toc / bibliography etc. — none
 * of which are exposed in the picker).
 *
 * v4.11: returns compound kinds for two_column / grid sources too.
 * The compound mapping defaults to the 1:1 ratio / 2×1 dimension —
 * existing two_column / grid nodes carry their own ratio + dimensions
 * in the payload, and morphTargetsFor returns [] for compounds, so
 * the picker never tries to morph between compound presets.
 */
export function kindOfNode(node: Record<string, unknown> | null | undefined): NodeKind | null {
  if (!node || typeof node !== 'object') return null;
  switch (node.type) {
    case 'prose':
      return 'paragraph';
    case 'heading':
      return 'heading';
    case 'list':
      return 'list';
    case 'quote':
      return 'quote';
    case 'callout':
      return 'callout';
    case 'image':
      return 'image';
    case 'divider':
      return 'divider';
    case 'two_column':
      return 'two_column_1_1';
    case 'grid':
      return 'grid_2x1';
    default:
      return null;
  }
}

/**
 * Set of target kinds the user can morph the source kind into without
 * losing or fabricating content beyond what `morphTo` handles. Image /
 * divider are deliberately excluded as morph targets — converting text
 * to an image needs an asset picker (use Insert + Delete instead) and
 * dividers carry no content (also Insert + Delete).
 */
const MORPH_TARGETS: Record<NodeKind, ReadonlyArray<LeafNodeKind>> = {
  paragraph: ['heading', 'list', 'quote', 'callout'],
  heading: ['paragraph', 'list', 'quote', 'callout'],
  list: ['paragraph', 'heading', 'quote', 'callout'],
  quote: ['paragraph', 'heading', 'list', 'callout'],
  callout: ['paragraph', 'heading', 'list', 'quote'],
  // image / divider have no morph targets — the action bar hides
  // `Change ▾` for them. The user inserts a new block + deletes the
  // old one via the regular flow.
  image: [],
  divider: [],
  // v4.11: compounds aren't morphable. Replacing a two_column with a
  // leaf would discard every cell's content (irrecoverable from a
  // single-RichText perspective). The user opens Insert ▾ + deletes
  // the old compound when they want a different layout.
  two_column_1_1: [],
  two_column_1_2: [],
  two_column_2_1: [],
  grid_2x1: [],
  grid_2x2: [],
  grid_3x1: [],
};

export function morphTargetsFor(kind: NodeKind): ReadonlyArray<LeafNodeKind> {
  return MORPH_TARGETS[kind];
}

export interface MorphResult {
  /** The new IR node payload, ready for `apply_*_node_edit`. */
  newNode: Record<string, unknown>;
  /** Field names dropped during the morph — surfaced as a status
   *  toast so the user notices when (e.g.) a quote's attribution
   *  vanishes. Empty array when nothing was lost. */
  droppedFields: ReadonlyArray<string>;
}

/**
 * Compose the new-node payload that morphs `source` into `target`,
 * preserving the primary RichText content. Returns null if the source
 * kind is unknown or the target isn't in `MORPH_TARGETS[source]`.
 */
export function morphTo(
  source: Record<string, unknown>,
  target: LeafNodeKind,
  options: NodePayloadOptions = {},
): MorphResult | null {
  const sourceKind = kindOfNode(source);
  if (!sourceKind) return null;
  if (!MORPH_TARGETS[sourceKind].includes(target)) return null;

  const text = primaryRichTextOf(source, sourceKind);
  const dropped: string[] = [];

  // Only emit a "dropped X" toast when the source actually had
  // content in that field. An empty attribution / title isn't a
  // surprise the user needs warning about.
  if (sourceKind === 'quote' && hasContent(source.attribution)) dropped.push('attribution');
  if (sourceKind === 'callout') {
    if (hasContent(source.title)) dropped.push('title');
    // `kind` is metadata, not content — never reported as dropped.
  }
  if (sourceKind === 'list' && Array.isArray(source.items) && source.items.length > 1) {
    dropped.push('extra list items');
  }

  let newNode: Record<string, unknown>;
  switch (target) {
    case 'paragraph':
      newNode = { type: 'prose', body: text };
      break;
    case 'heading':
      newNode = {
        type: 'heading',
        level: options.level ?? 2,
        text,
      };
      break;
    case 'list':
      newNode = {
        type: 'list',
        style: options.listStyle ?? 'bullet',
        // Preserve every list item when the source was already a list,
        // otherwise wrap the source's primary RichText as a single item.
        items: sourceKind === 'list' && Array.isArray(source.items)
          ? (source.items as ReadonlyArray<RichText>).map((it) => cloneRichText(it))
          : [text],
      };
      break;
    case 'quote':
      newNode = { type: 'quote', body: text };
      break;
    case 'callout':
      newNode = {
        type: 'callout',
        kind: options.calloutKind ?? 'note',
        body: text,
      };
      break;
    default:
      return null;
  }

  return { newNode, droppedFields: dropped };
}

/**
 * Shape of the parent path tail the picker uses for filtering. The
 * App keeps full IRPaths around (`['body', 2, 'left']`); the picker
 * only needs to know the immediate container's discriminator.
 */
export type ParentContainer = 'body' | 'two_column' | 'grid' | 'unsupported';

/**
 * Classify a `parent_path` into one of the picker-relevant containers.
 * `parent_path` is the path of the *container*, NOT the block being
 * inserted next to. Examples:
 *   ['body']                       → 'body'
 *   ['body', 2, 'left']            → 'two_column'
 *   ['body', 2, 'right']           → 'two_column'
 *   ['body', 4, 'cells', 0]        → 'grid'   (the row at index 0)
 *   ['body', 4, 'cells']           → 'unsupported' (the 2D cells array
 *                                    isn't a splice target — server
 *                                    rejects this; mirror that here)
 *   ['body', 5, 'rows']            → 'unsupported' (table — no insert)
 */
export function classifyParent(parentPath: ReadonlyArray<string | number>): ParentContainer {
  if (parentPath.length === 1 && parentPath[0] === 'body') return 'body';
  const tail = parentPath[parentPath.length - 1];
  if (tail === 'left' || tail === 'right') return 'two_column';
  // A grid row is addressed as ['body', N, 'cells', R] where R is the
  // numeric row index — that's the actual insertable container. The
  // bare 'cells' segment maps to the 2D shape and isn't a splice target.
  if (
    typeof tail === 'number' &&
    parentPath.length >= 2 &&
    parentPath[parentPath.length - 2] === 'cells'
  ) {
    return 'grid';
  }
  return 'unsupported';
}

/**
 * Filter the catalogue to the kinds allowed inside `parentPath`. The
 * server's leaf-only enforcement is the actual gate; this is just a
 * pre-filter so the user doesn't see options that would 400 on insert.
 *
 * v4.11 split:
 *   - body[]                       → leaves + compound layout presets
 *   - two_column.{left,right}      → leaves only (IR rule: leaf-only
 *                                    inside compounds — no nesting)
 *   - grid.cells[i]                → leaves only (same rule)
 *   - unsupported (e.g. table.rows) → empty
 */
export function availableForParent(
  parentPath: ReadonlyArray<string | number>,
): ReadonlyArray<CatalogueEntry> {
  const container = classifyParent(parentPath);
  if (container === 'unsupported') return [];
  if (container === 'body') return CATALOGUE;
  // Inner compound container — drop layout presets so the user can't
  // try to nest a two_column inside another two_column.
  return CATALOGUE.filter((e) => e.group !== 'layout');
}

// ── helpers ────────────────────────────────────────────────────────

function cloneRichText(rt: RichText): RichText {
  return rt.map((run) => ({ ...run }));
}

function hasContent(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  for (const run of value) {
    if (run && typeof run === 'object' && 'text' in run) {
      const t = (run as { text?: unknown }).text;
      if (typeof t === 'string' && t.trim() !== '') return true;
    }
  }
  return false;
}

/**
 * Return the source node's primary RichText field — the one that
 * carries the user's words. Joining list items with newline runs
 * gives a paragraph the user can fix up after the morph instead of a
 * fabricated single-line collapse.
 */
function primaryRichTextOf(node: Record<string, unknown>, kind: NodeKind): RichText {
  switch (kind) {
    case 'paragraph':
      return cloneRichText(asRichText(node.body));
    case 'heading':
      return cloneRichText(asRichText(node.text));
    case 'quote':
      return cloneRichText(asRichText(node.body));
    case 'callout':
      return cloneRichText(asRichText(node.body));
    case 'list': {
      const items = Array.isArray(node.items) ? (node.items as ReadonlyArray<unknown>) : [];
      if (items.length === 0) return [{ text: '' }];
      const out: TextRun[] = [];
      items.forEach((item, idx) => {
        if (idx > 0) out.push({ text: '\n' });
        for (const run of asRichText(item)) out.push({ ...run });
      });
      return out;
    }
    case 'image':
    case 'divider':
    // v4.11 compounds: morphTargetsFor returns [] so morphTo never
    // reaches here for compound source kinds. Defensive default
    // keeps the exhaustiveness check satisfied.
    case 'two_column_1_1':
    case 'two_column_1_2':
    case 'two_column_2_1':
    case 'grid_2x1':
    case 'grid_2x2':
    case 'grid_3x1':
      return [{ text: '' }];
  }
}

function asRichText(value: unknown): RichText {
  if (!Array.isArray(value)) return [{ text: '' }];
  const out: TextRun[] = [];
  for (const run of value) {
    if (!run || typeof run !== 'object' || !('text' in run)) continue;
    const t = (run as { text?: unknown }).text;
    if (typeof t !== 'string') continue;
    out.push({ ...(run as TextRun), text: t });
  }
  return out.length > 0 ? out : [{ text: '' }];
}
