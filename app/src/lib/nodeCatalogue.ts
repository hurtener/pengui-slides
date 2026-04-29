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

export type ListStyle = 'bullet' | 'numbered' | 'checklist';
export type CalloutKind = 'note' | 'warning' | 'tip' | 'important';
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface LeafNodeOptions {
  /** Heading default `2` (h1 is reserved for hero/cover titles). */
  level?: HeadingLevel;
  listStyle?: ListStyle;
  calloutKind?: CalloutKind;
  /** Image only — composers that need an asset_id MUST be passed one
   *  by the caller (the asset picker provides it). Composers without
   *  it return null. */
  asset_id?: string;
}

export interface CatalogueEntry {
  kind: LeafNodeKind;
  /** Short label shown on the picker tile. */
  label: string;
  /** One-line description shown under the label. */
  hint: string;
  /** Single-glyph icon (rendered in the soul-themed tile). */
  glyph: string;
  /** Single-letter keyboard shortcut for the picker. Lowercase. */
  shortcut: string;
}

export const CATALOGUE: ReadonlyArray<CatalogueEntry> = [
  { kind: 'paragraph', label: 'Paragraph', hint: 'Body text',                glyph: '¶', shortcut: 'p' },
  { kind: 'heading',   label: 'Heading',   hint: 'Section title',            glyph: 'H', shortcut: 'h' },
  { kind: 'list',      label: 'List',      hint: 'Bulleted, numbered, or checklist', glyph: '•', shortcut: 'l' },
  { kind: 'quote',     label: 'Quote',     hint: 'Pull quote with attribution', glyph: '“', shortcut: 'q' },
  { kind: 'callout',   label: 'Callout',   hint: 'Highlighted note / warning / tip', glyph: 'ℹ︎', shortcut: 'c' },
  { kind: 'image',     label: 'Image',     hint: 'Insert from the asset library', glyph: '▣', shortcut: 'i' },
  { kind: 'divider',   label: 'Divider',   hint: 'Horizontal rule',          glyph: '━', shortcut: 'd' },
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
  kind: LeafNodeKind,
  options: LeafNodeOptions = {},
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
  }
}

/**
 * Detect the catalogue kind of an existing IR node, or null when the
 * node isn't morphable through this catalogue (hero / two_column /
 * grid / table / toc / bibliography etc.).
 */
export function kindOfNode(node: Record<string, unknown> | null | undefined): LeafNodeKind | null {
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
const MORPH_TARGETS: Record<LeafNodeKind, ReadonlyArray<LeafNodeKind>> = {
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
};

export function morphTargetsFor(kind: LeafNodeKind): ReadonlyArray<LeafNodeKind> {
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
  options: LeafNodeOptions = {},
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
 *   ['body', 4, 'cells']           → 'grid'
 *   ['body', 5, 'rows']            → 'unsupported' (table — not insertable here)
 */
export function classifyParent(parentPath: ReadonlyArray<string | number>): ParentContainer {
  if (parentPath.length === 1 && parentPath[0] === 'body') return 'body';
  const tail = parentPath[parentPath.length - 1];
  if (tail === 'left' || tail === 'right') return 'two_column';
  if (tail === 'cells') return 'grid';
  return 'unsupported';
}

/**
 * Filter the catalogue to the kinds allowed inside `parentPath`. The
 * server's leaf-only enforcement is the actual gate; this is just a
 * pre-filter so the user doesn't see options that would 400 on insert.
 */
export function availableForParent(
  parentPath: ReadonlyArray<string | number>,
): ReadonlyArray<CatalogueEntry> {
  const container = classifyParent(parentPath);
  if (container === 'unsupported') return [];
  // body / two_column / grid all accept the full leaf catalogue at
  // present. The hero block is intentionally absent (it's a cover-
  // slide primitive, not user-insertable inline). When the IR adds
  // container-specific restrictions later this is the one place to
  // tighten the allow-list.
  return CATALOGUE;
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
function primaryRichTextOf(node: Record<string, unknown>, kind: LeafNodeKind): RichText {
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
