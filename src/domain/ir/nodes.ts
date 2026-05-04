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
import { RichTextSchema } from './rich-text.js';

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

export const ImageNodeSchema = z
  .object({
    type: z.literal('image'),
    asset_id: z.string().min(1),
    caption: RichTextSchema.optional(),
    /** Accessibility text. Empty string marks the image as decorative.
     *  Falls back to caption text when omitted. */
    alt: z.string().optional(),
    fit: z.enum(['contain', 'cover']).optional(),
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

// Leaf-only union — used inside two_column to prevent recursion.
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
  TwoColumnNodeSchema,
  GridNodeSchema,
  TocNodeSchema,
  SectionDividerNodeSchema,
  BibliographyNodeSchema,
  PageBreakNodeSchema,
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
  'two_column',
  'grid',
  'toc',
  'section_divider',
  'bibliography',
  'page_break',
] as const;
export type SlideNodeType = (typeof SLIDE_NODE_TYPES)[number];

/** Mode constraint for top-level IR nodes. Bimodal nodes work in both
 *  authoring models; mode-specific nodes are rejected at Stage 1 lint
 *  when used in the wrong mode. */
export const SLIDE_ONLY_NODE_TYPES = ['section_divider'] as const;
export const DOC_ONLY_NODE_TYPES = ['toc', 'bibliography', 'page_break'] as const;
