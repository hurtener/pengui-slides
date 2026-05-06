/**
 * SlideNode — the discriminated union over the v4.5 IR node types.
 *
 * v4.5 ships 5 types: hero, prose, image, two_column, callout. Each is
 * deliberately narrow; future releases extend the union.
 *
 * Recursion policy (v4.5): two_column.left/right hold LEAF nodes only —
 * no nested two_column. Relaxing this is a v4.6+ decision after we
 * see how agents compose at one level. Keeps the type non-recursive
 * (no z.lazy needed), keeps the editor surface predictable, and avoids
 * pathological deep nesting in narrow viewports.
 *
 * Token references are STRUCTURAL, not literal: a node says
 * `background: 'accent'` (one of the soul's semantic colors), and the
 * compiler emits `var(--color-accent-primary)`. Agents never write hex.
 */

import * as z from 'zod';
import { RichTextSchema, TextColorSchema } from './rich-text.js';

// ── Token reference enums ─────────────────────────────────────────
//
// IR nodes name colors / spacing / etc. by SEMANTIC role, not by token
// name. The compiler maps semantic role → soul token. This means the
// IR is portable across souls — change the soul, the same IR renders
// in the new visual language.

export const ColorRoleSchema = z.enum([
  'canvas',       // page background
  'surface',      // card / inset background
  'surface_alt',  // alternative inset
  'accent',       // primary accent
  'accent_alt',   // secondary accent
  'accent_warm',  // warm accent
  'success',
  'warning',
  'error',
  'info',
]);
export type ColorRole = z.infer<typeof ColorRoleSchema>;

export const TextColorRoleSchema = z.enum([
  'primary',
  'secondary',
  'tertiary',
  'inverse',
]);
export type TextColorRole = z.infer<typeof TextColorRoleSchema>;

// ── Leaf node schemas ────────────────────────────────────────────

export const HeroNodeSchema = z
  .object({
    type: z.literal('hero'),
    title: RichTextSchema,
    subtitle: RichTextSchema.optional(),
    eyebrow: RichTextSchema.optional(),
    align: z.enum(['left', 'center']).optional(),
  })
  .strict();
export type HeroNode = z.infer<typeof HeroNodeSchema>;

export const ProseNodeSchema = z
  .object({
    type: z.literal('prose'),
    body: RichTextSchema,
    align: z.enum(['left', 'center', 'right']).optional(),
  })
  .strict();
export type ProseNode = z.infer<typeof ProseNodeSchema>;

/** v4.16 — frame chrome variants for the image node. Each frame wraps
 *  the asset image in device chrome so screenshots feel "in context"
 *  (Galici slides 5 / 8 / 9 use these for UI prototype shots). The
 *  chrome itself is generated declaratively (CSS + minimal inline SVG
 *  for device shapes); no extra raster assets needed. */
export const ImageFrameSchema = z.enum([
  'none',     // bare image, no chrome (default behaviour)
  'browser',  // title bar + URL bar + traffic-light dots
  'phone',    // rounded-corner device frame + status bar + home indicator
  'desktop',  // monitor with stand
  'laptop',   // laptop bezel
]);
export type ImageFrame = z.infer<typeof ImageFrameSchema>;

export const ImageNodeSchema = z
  .object({
    type: z.literal('image'),
    asset_id: z.string().min(1),
    caption: RichTextSchema.optional(),
    /** Accessibility text. Empty string marks the image as decorative.
     *  Falls back to caption text when omitted. */
    alt: z.string().optional(),
    fit: z.enum(['contain', 'cover']).optional(),
    /** v4.16 device frame around the image. Defaults to 'none'. */
    frame: ImageFrameSchema.optional(),
  })
  .strict();
export type ImageNode = z.infer<typeof ImageNodeSchema>;

export const CalloutNodeSchema = z
  .object({
    type: z.literal('callout'),
    kind: z.enum(['note', 'warning', 'tip', 'important']),
    // Accept either RichText (preferred — symmetric with HeroNode.title) or
    // a plain string for ergonomic authoring. Strings are normalised to a
    // single-run RichText so downstream code only ever sees the array form.
    title: z
      .preprocess(
        (val) => (typeof val === 'string' ? [{ text: val }] : val),
        RichTextSchema.optional(),
      )
      .optional(),
    body: RichTextSchema,
  })
  .strict();
export type CalloutNode = z.infer<typeof CalloutNodeSchema>;

// ── v4.7 leaf nodes ──────────────────────────────────────────────

export const HeadingNodeSchema = z
  .object({
    type: z.literal('heading'),
    /** Semantic level. h1 is reserved for hero/cover titles in practice;
     *  agents typically use h2–h4 for content slide section headers. */
    level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
    text: RichTextSchema,
    align: z.enum(['left', 'center', 'right']).optional(),
  })
  .strict();
export type HeadingNode = z.infer<typeof HeadingNodeSchema>;

export const ListNodeSchema = z
  .object({
    type: z.literal('list'),
    style: z.enum(['bullet', 'numbered', 'checklist']),
    items: z.array(RichTextSchema).min(1),
  })
  .strict();
export type ListNode = z.infer<typeof ListNodeSchema>;

export const DividerNodeSchema = z
  .object({
    type: z.literal('divider'),
    spacing: z.enum(['sm', 'md', 'lg']).optional(),
  })
  .strict();
export type DividerNode = z.infer<typeof DividerNodeSchema>;

export const QuoteNodeSchema = z
  .object({
    type: z.literal('quote'),
    body: RichTextSchema,
    attribution: RichTextSchema.optional(),
  })
  .strict();
export type QuoteNode = z.infer<typeof QuoteNodeSchema>;

export const TableNodeSchema = z
  .object({
    type: z.literal('table'),
    headers: z.array(RichTextSchema).optional(),
    rows: z.array(z.array(RichTextSchema)).min(1),
    /** Optional caption rendered above the table for context / a11y. */
    caption: RichTextSchema.optional(),
  })
  .strict();
export type TableNode = z.infer<typeof TableNodeSchema>;
// Note: row-length-vs-headers consistency is enforced at render time
// (renderTable throws via PenguiError) rather than in the Zod schema —
// .refine() returns ZodEffects which discriminatedUnion does not accept.

// ── v4.12 chart node ─────────────────────────────────────────────
//
// Data-driven chart rendered to inline SVG by ECharts at compile time.
// Same pattern as TableNode: structured payload, leaf, no recursion.
// The renderer reads soul tokens through the chart-theme-bridge so
// the SVG output uses var(--color-*) references — the diagram-legibility
// validator already covers token-clean SVG; chart-shape adds chart-specific
// rules (slice limits, axis titles, color reuse) on top.
//
// Native PPTX `c:chart` parts are out of scope for v4.12 — the editable
// PPTX path emits a single `image` shape with PNG bytes.

export const ChartTypeSchema = z.enum([
  'bar', 'stacked_bar', 'line', 'area',
  'scatter', 'pie', 'donut', 'histogram', 'heatmap', 'radar',
]);
export type ChartType = z.infer<typeof ChartTypeSchema>;

export const ChartNodeSchema = z
  .object({
    type: z.literal('chart'),
    chart_type: ChartTypeSchema,
    /** Per-series rows. Shape varies by chart_type — validated at render
     *  time the same way TableNode validates row-vs-headers length
     *  (Zod refine doesn't compose with discriminatedUnion). */
    data: z.array(z.array(z.union([z.number(), z.string()]))).min(1),
    /** Series names (one per row in `data`). */
    series_labels: z.array(z.string()).optional(),
    /** Category names — x-axis labels for cartesian, slice names for pie. */
    category_labels: z.array(z.string()).optional(),
    /** Plain-string axis titles. RichText is overkill for axes. */
    x_axis_title: z.string().optional(),
    y_axis_title: z.string().optional(),
    caption: RichTextSchema.optional(),
    show_legend: z.boolean().optional(),
    show_grid: z.boolean().optional(),
    value_format: z.enum(['number', 'percent', 'currency', 'compact']).optional(),
  })
  .strict();
export type ChartNode = z.infer<typeof ChartNodeSchema>;

// ── Curated icon + flow declarations ─────────────────────────────
//
// IconNameSchema and the v4.17 flow declarations live here (before
// LeafBlockNodeSchema) so both can be referenced by the leaf unions
// without forward-reference gymnastics. Flow nests inside cards / grid
// cells / two_column children — agents commonly compose a "feature
// pipeline" by putting a flow inside a content area, so it has to be
// allowed in both leaf unions.

/** Curated lucide-style icon allowlist. Inline SVGs ship with the
 *  compiler (`compile/icons.ts`); fonts are not required. Used by
 *  CardNode.icon and FlowStep.icon. Expand on demand — keep the set
 *  small enough to reason about visually. */
export const IconNameSchema = z.enum([
  // status
  'shield', 'lock', 'check', 'x', 'alert-triangle', 'info-circle',
  // motion / process
  'arrow-right', 'refresh', 'rocket', 'zap', 'play', 'workflow',
  // data / measure
  'bar-chart', 'trending-up', 'trending-down', 'target', 'gauge',
  'eye', 'search',
  // structure
  'layers', 'grid', 'box', 'puzzle', 'network',
  // people / business
  'users', 'user', 'briefcase', 'building',
  // misc
  'star', 'heart', 'sparkles', 'lightbulb',
]);
export type IconName = z.infer<typeof IconNameSchema>;

// ── v4.17 flow node ──────────────────────────────────────────────
//
// Sequential pipeline / process visualization (Galici slide 11
// "Backlog Grooming → Sprint Planning → Development → Demo + retro").
// Steps are arranged horizontally or vertically with a connector glyph
// between them. Bimodal — works in slide AND document modes.
//
// Schema is a thin wrapper over `FlowStep[]`: each step carries a
// label (RichText), optional accent token, optional curated icon,
// optional short badge ("01", "Q1", "Done"). The connector is a single
// kind that applies between every adjacent pair of steps; mixing
// connectors mid-flow is intentionally not supported (would obscure the
// visual rhythm that makes flows readable).
//
// `cycle` connector: emits a closing return-arrow after the last step
// to communicate "this loops back to the start" without drawing a
// physical curved wrap (deferred to v4.18+).

export const FlowConnectorSchema = z.enum([
  'arrow',          // solid arrow (→) — sequential default
  'arrow_dashed',   // dashed arrow — soft / proposed step
  'cycle',          // return arrow — recurring / iterative process
  'plus',           // plus glyph — additive composition
]);
export type FlowConnector = z.infer<typeof FlowConnectorSchema>;

export const FlowStepSchema = z
  .object({
    /** Primary step label. RichText so authors can color/bold individual
     *  words via the existing TextRun color enum. */
    label: RichTextSchema,
    /** Soul accent — drives the step pill's top-border tint and the
     *  icon color. Mirrors the v4.13 card pattern. */
    accent: TextColorSchema.optional(),
    /** Curated lucide icon glyph rendered above the label. Same
     *  allowlist as CardNode.icon. */
    icon: IconNameSchema.optional(),
    /** Short corner badge — "01", "Done", "Q1". Plain string; no
     *  rich-text formatting. Capped at 16 chars to keep the badge
     *  visually compact. */
    badge: z.string().max(16).optional(),
  })
  .strict();
export type FlowStep = z.infer<typeof FlowStepSchema>;

export const FlowNodeSchema = z
  .object({
    type: z.literal('flow'),
    direction: z.enum(['horizontal', 'vertical']),
    connector: FlowConnectorSchema,
    /** Hard minimum 2 (a single step isn't a flow, it's just a card).
     *  Soft maximum 7 enforced by the density warning lint — agents
     *  can ship more, but the lint surfaces the visual-density risk. */
    steps: z.array(FlowStepSchema).min(2),
  })
  .strict();
export type FlowNode = z.infer<typeof FlowNodeSchema>;

// LeafBlockNode — leaves usable inside `card.body`. `card` itself is
// excluded so cards can't nest inside cards (single level of wrapping).
// Flow is included so a card can host a step pipeline (Galici "process
// in a card" pattern).
export const LeafBlockNodeSchema = z.discriminatedUnion('type', [
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
  FlowNodeSchema,
]);
export type LeafBlockNode = z.infer<typeof LeafBlockNodeSchema>;

// ── v4.13 card node ──────────────────────────────────────────────
//
// Presentational wrapper around a small group of leaves with optional
// semantic accent (top-border tint + icon color) and a curated lucide
// icon glyph. Used inside grid cells / two_column children to deliver
// the "feature card with colored accent" pattern that the design-team
// reference decks lean on heavily (Galici "Cinco desafíos críticos",
// "Cuatro módulos", "Acerca de Clear Tech" — all the same primitive).
//
// Why a leaf rather than a grid-cell extension: card is reusable
// anywhere a leaf is allowed (top-level body, two_column children,
// grid cells), and additive — no breaking change to existing IR.

export const CardNodeSchema = z
  .object({
    type: z.literal('card'),
    /** Semantic accent — drives the top-border tint and the icon color.
     *  Reuses the rich-text TextColor enum so the cascade rules match
     *  what agents already know from inline run colors. */
    accent: TextColorSchema.optional(),
    /** Optional icon glyph rendered above the body. From the curated
     *  lucide allowlist. */
    icon: IconNameSchema.optional(),
    /** Small label rendered above the body (Galici cards use these for
     *  "01 · TRAZABILIDAD" style numbering). Plain RichText so agents
     *  can color a leading number with the accent if they want to. */
    eyebrow: RichTextSchema.optional(),
    /** Inner content — leaves only, no nested cards. */
    body: z.array(LeafBlockNodeSchema),
  })
  .strict();
export type CardNode = z.infer<typeof CardNodeSchema>;

// Leaf-only union — used inside two_column / grid to prevent recursion.
// Includes Card (v4.13) so cards can sit inside grid cells / two_column.
// Includes Flow (v4.17) so a step pipeline can sit inside any container.
// Decoration is deliberately NOT included — it's an absolutely-positioned
// overlay that anchors against the slide root, so nesting it inside a
// grid cell wouldn't move its bbox; agents place it at body level.
export const LeafSlideNodeSchema = z.discriminatedUnion('type', [
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
  CardNodeSchema,
  FlowNodeSchema,
]);
export type LeafSlideNode = z.infer<typeof LeafSlideNodeSchema>;

// ── Container nodes ──────────────────────────────────────────────

export const TwoColumnNodeSchema = z
  .object({
    type: z.literal('two_column'),
    ratio: z.enum(['1:1', '1:2', '2:1']).optional(),
    gap: z.enum(['sm', 'md', 'lg']).optional(),
    left: z.array(LeafSlideNodeSchema),
    right: z.array(LeafSlideNodeSchema),
  })
  .strict();
export type TwoColumnNode = z.infer<typeof TwoColumnNodeSchema>;

/**
 * Bimodal N-column grid. Generalizes two_column to 2/3/4 columns with
 * optional weighted ratios. Each cell is its own array of leaf nodes —
 * mirrors two_column's no-recursion stance.
 *
 * `cells.length` must equal `columns * rowsImplied`. We enforce
 * `length % columns === 0` at render time (refine breaks discriminatedUnion).
 *
 * `ratio` is a colon-separated weight list; its parts must equal `columns`
 * (validated at render time). Defaults to even (1fr each).
 */
export const GridNodeSchema = z
  .object({
    type: z.literal('grid'),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]),
    ratio: z.string().regex(/^\d+(?::\d+)+$/).optional(),
    gap: z.enum(['sm', 'md', 'lg']).optional(),
    align_items: z.enum(['start', 'center', 'stretch']).optional(),
    cells: z.array(z.array(LeafSlideNodeSchema)).min(1),
  })
  .strict();
export type GridNode = z.infer<typeof GridNodeSchema>;

// ── v4.8 mode-specific top-level nodes ───────────────────────────

/**
 * Table-of-contents (doc-only). Resolves at compose time by walking the
 * containing deck's chapter_header / heading sections. Slide-mode IR
 * rejects this node at Stage 1.
 */
export const TocNodeSchema = z
  .object({
    type: z.literal('toc'),
    title: RichTextSchema.optional(),
    include_kinds: z.array(z.string()).optional(),
    max_depth: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  })
  .strict();
export type TocNode = z.infer<typeof TocNodeSchema>;

/**
 * Section divider (slide-only). Full-bleed chapter break with optional
 * label + ornament. Document mode uses chapter_header sections instead;
 * Stage 1 rejects this node in document IR.
 */
export const SectionDividerNodeSchema = z
  .object({
    type: z.literal('section_divider'),
    label: RichTextSchema.optional(),
    ornament: z.enum(['rule', 'dot', 'none']).optional(),
  })
  .strict();
export type SectionDividerNode = z.infer<typeof SectionDividerNodeSchema>;

/**
 * Bibliography (doc-only). Numbered list of references with optional
 * citation ids for future inline-cite support. Stage 1 rejects this in
 * slide IR.
 */
export const BibliographyEntrySchema = z
  .object({
    id: z.string().min(1).optional(),
    text: RichTextSchema,
  })
  .strict();
export type BibliographyEntry = z.infer<typeof BibliographyEntrySchema>;

export const BibliographyNodeSchema = z
  .object({
    type: z.literal('bibliography'),
    title: RichTextSchema.optional(),
    entries: z.array(BibliographyEntrySchema).min(1),
  })
  .strict();
export type BibliographyNode = z.infer<typeof BibliographyNodeSchema>;

/**
 * Page break (doc-only). Forces the next sibling onto a new page when
 * the print pipeline flows the section. Renders as a zero-height
 * element with `break-after: page`. Stage 1 rejects in slide IR.
 */
export const PageBreakNodeSchema = z
  .object({
    type: z.literal('page_break'),
  })
  .strict();
export type PageBreakNode = z.infer<typeof PageBreakNodeSchema>;

// ── v4.16 decoration node ────────────────────────────────────────
//
// Purely visual element — has no data content, no text, no semantic
// role. Drives the "ornament" / "bleed mark" / "glow ring" affordances
// the design-team reference decks rely on heavily. Two source kinds:
//
//   - `asset_ref`: resolves to an uploaded image/SVG. Asset library
//     categorises decorations as `illustration` per v4.16's role enum
//     widening, but the IR doesn't care about the role tag.
//
//   - `preset`: bundled inline SVG primitive (glow_ring, radial_glow,
//     grid_dots, corner_bracket, chevron_arrow, noise_overlay). Uses
//     `currentColor` so the resolved `accent` token cascades through
//     soul changes for free.
//
// Placement uses anchor + offset semantics rather than absolute x/y:
// keeps the IR portable across formats (16:9 vs A4 vs square) and
// preserves the IR-first contract (no per-pixel positioning).
//
// `bleed_*` anchors push the decoration past the slide canvas edge —
// the slide root gets `overflow: visible` so the partial shape isn't
// clipped, and the editable PPTX exporter writes negative `<a:off>`
// coords (PowerPoint accepts these for partial shape placement).

export const PresetOrnamentNameSchema = z.enum([
  'glow_ring',       // halo around a focal point
  'radial_glow',     // soft gradient backdrop
  'grid_dots',       // dotted texture
  'corner_bracket',  // L-shaped bracket frame
  'chevron_arrow',   // directional accent
  'noise_overlay',   // subtle grain overlay
]);
export type PresetOrnamentName = z.infer<typeof PresetOrnamentNameSchema>;

const DecorationSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('asset_ref'), asset_id: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('preset'), name: PresetOrnamentNameSchema }).strict(),
]);
export type DecorationSource = z.infer<typeof DecorationSourceSchema>;

export const DecorationAnchorSchema = z.enum([
  // in-canvas anchors (decoration sits inside the safe area)
  'top_left', 'top_center', 'top_right',
  'middle_left', 'middle_center', 'middle_right',
  'bottom_left', 'bottom_center', 'bottom_right',
  // bleed anchors (decoration extends past the canvas edge)
  'bleed_left', 'bleed_right', 'bleed_top', 'bleed_bottom',
  'bleed_top_left', 'bleed_top_right',
  'bleed_bottom_left', 'bleed_bottom_right',
]);
export type DecorationAnchor = z.infer<typeof DecorationAnchorSchema>;

const DecorationPlacementSchema = z
  .object({
    anchor: DecorationAnchorSchema,
    /** Pixel offset from the anchor. Positive values move toward the
     *  slide centre. Defaults to {x:0, y:0}. */
    offset: z.object({ x: z.number(), y: z.number() }).optional(),
    /** Override decoration size. Defaults to natural size for assets,
     *  preset-defined size for ornaments (e.g. glow_ring → 480×480). */
    size: z
      .object({
        width: z.number().positive(),
        height: z.number().positive(),
      })
      .optional(),
    rotation: z.number().min(-360).max(360).optional(),
    opacity: z.number().min(0).max(1).optional(),
  })
  .strict();
export type DecorationPlacement = z.infer<typeof DecorationPlacementSchema>;

export const DecorationNodeSchema = z
  .object({
    type: z.literal('decoration'),
    source: DecorationSourceSchema,
    placement: DecorationPlacementSchema,
    /** background = renders behind body content (full-bleed marks);
     *  foreground = renders on top of body (glow rings around focal). */
    layer: z.enum(['background', 'foreground']),
    /** Soul accent token for tinted preset ornaments. Ignored for
     *  asset_ref. Defaults to `accent` (primary). */
    accent: TextColorSchema.optional(),
  })
  .strict();
export type DecorationNode = z.infer<typeof DecorationNodeSchema>;

// ── Top-level union ──────────────────────────────────────────────

export const SlideNodeSchema = z.discriminatedUnion('type', [
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
  CardNodeSchema,
  TwoColumnNodeSchema,
  GridNodeSchema,
  TocNodeSchema,
  SectionDividerNodeSchema,
  BibliographyNodeSchema,
  PageBreakNodeSchema,
  DecorationNodeSchema,
  FlowNodeSchema,
]);
export type SlideNode = z.infer<typeof SlideNodeSchema>;

/** All node type names registered in the IR catalog. Useful for tests,
 *  docs, and resource enumeration (pengui://schema/slide-ir). */
export const SLIDE_NODE_TYPES = [
  'hero',
  'prose',
  'image',
  'callout',
  'heading',
  'list',
  'divider',
  'quote',
  'table',
  'chart',
  'card',
  'two_column',
  'grid',
  'toc',
  'section_divider',
  'bibliography',
  'page_break',
  'decoration',
  'flow',
] as const;
export type SlideNodeType = (typeof SLIDE_NODE_TYPES)[number];

/** Mode constraint for top-level IR nodes. Bimodal nodes work in both
 *  authoring models; mode-specific nodes are rejected at Stage 1 lint
 *  when used in the wrong mode. */
export const SLIDE_ONLY_NODE_TYPES = ['section_divider'] as const;
export const DOC_ONLY_NODE_TYPES = ['toc', 'bibliography', 'page_break'] as const;
