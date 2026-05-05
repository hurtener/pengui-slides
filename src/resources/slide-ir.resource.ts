/**
 * MCP Resource: pengui://schema/slide-ir
 *
 * Exposes the SlideIR / SectionIR JSON Schema so agents can fetch the
 * authoritative node grammar (hero, prose, image, callout, heading,
 * list, divider, quote, table, two_column, grid) with field types and
 * enums, instead of inferring shape from tool descriptions alone. Both
 * slides (slide-model decks) and sections (document-model decks)
 * consume the same node union.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import {
  SlideIRSchema,
  SectionIRSchema,
  SLIDE_NODE_TYPES,
} from '../domain/ir/index.js';
import { registerResourceEntry } from './registry.js';

export const SLIDE_IR_SCHEMA_URI = 'pengui://schema/slide-ir';

export function registerSlideIRSchemaResource(server: McpServer): void {
  registerResourceEntry(server, {
    uri: SLIDE_IR_SCHEMA_URI,
    name: 'slide-ir-schema',
    mimeType: 'application/json',
    description:
      'JSON Schema for the Slide / Section IR node tree. Lists every node type ' +
      '(hero, prose, image, callout, heading, list, divider, quote, table, chart, card, two_column, grid), ' +
      'their fields, the rich-text run shape, and the semantic token enums (background ' +
      'roles, color roles). Fetch this once per session and use it to compose `slide_ir` / ' +
      '`section_ir` arguments for add_slide, update_slide, add_section, update_section, ' +
      'validate_slide_ir, and validate_section_ir.',
    getText: () => {
      const payload = {
        version: '4.14',
        node_types: SLIDE_NODE_TYPES,
        slide_ir: z.toJSONSchema(SlideIRSchema),
        section_ir: z.toJSONSchema(SectionIRSchema),
        notes: [
          'Token references are SEMANTIC, not literal. A node says `background: "accent"`; ' +
            'the compiler emits `var(--color-accent-primary)`. Agents never write hex.',
          'Image nodes reference uploaded assets by id (`asset_id: "uuid"`). Upload binaries ' +
            'with `upload_asset` first. Provide `alt` for accessibility (empty string marks decorative).',
          'two_column.left and two_column.right hold LEAF nodes only (no nested two_column).',
          'grid generalises two_column to N columns (2 / 3 / 4). Each entry in `cells` is its ' +
            'own array of LEAF nodes (no nested grid / two_column). cells.length must be a ' +
            'multiple of `columns` — extra rows wrap automatically. Optional `ratio` is a ' +
            'colon-separated weight list with exactly `columns` parts (e.g. "2:1:1" for 3 ' +
            'columns); omit it for even columns (1fr each). `align_items` controls vertical ' +
            'alignment within each row.',
          'Rich text runs (v4.7+): bold / italic / code / strike STACK freely on a single ' +
            'run (no longer mutually exclusive). sup / sub are mutually exclusive at render ' +
            'time — sup wins when both are set. link is independent. `color` is independent ' +
            '(SEMANTIC role: accent | accent_alt | accent_warm | success | warning | error | ' +
            'info | muted | inverse). Omit `color` to inherit the cascade-aware default text ' +
            'color (which auto-swaps to inverse on dark backgrounds). Runs concatenate ' +
            'verbatim — INCLUDE spaces inside text rather than relying on inter-run whitespace.',
          'Table rows must have the same column count as `headers` when headers are provided. ' +
            'Short rows are padded with empty cells at render time and may surface as a ' +
            'validation warning.',
          'Heading levels: h1 is reserved for hero/cover titles in practice; h2–h4 cover most ' +
            'content slide section headers; h5–h6 are uppercase eyebrow-style.',
          'Chart nodes (v4.12): structured payload — `chart_type` (one of bar | stacked_bar | ' +
            'line | area | scatter | pie | donut | histogram | heatmap | radar) + `data` (array ' +
            'of numeric rows; one row per series for cartesian charts, one row of slice values ' +
            'for pie/donut, paired [x, y, x, y, …] for scatter, rectangular grid for heatmap). ' +
            'Optional `series_labels`, `category_labels`, `x_axis_title`, `y_axis_title`, ' +
            '`caption`, `show_legend`, `show_grid`, `value_format` (number | percent | currency | ' +
            'compact). The server renders chart_type via Apache ECharts (SVG, soul-themed). ' +
            'Native PPTX chart parts are NOT supported in v4.12 — charts export as flattened ' +
            'images in PPTX. Prefer the `compile_chart` tool to assemble chart payloads in one ' +
            'round-trip; agents iterate on chart_type / value_format with preview mode.',
          'Card nodes (v4.13): presentational wrapper around a small group of leaves. Use INSIDE ' +
            'grid cells (`grid.cells[i] = [{ type: "card", ... }]`) or two_column children to get ' +
            'the "feature card with colored top-border + icon" pattern that proposal/pitch decks ' +
            'rely on (Galici "Cinco desafíos críticos", "Cuatro módulos"). Optional `accent` ' +
            '(same TextColor enum as inline color: accent | accent_alt | accent_warm | success | ' +
            'warning | error | info | muted | inverse) drives the top-border tint AND the icon ' +
            'color in one go. Optional `icon` is one of the curated lucide names (shield, lock, ' +
            'check, alert-triangle, trending-up, target, eye, layers, rocket, zap, users, …). ' +
            'Optional `eyebrow` is a small uppercase label rendered above the body (great for ' +
            '"01 · TRAZABILIDAD" style numbering — color the leading number with the accent). ' +
            '`body` is leaves only — no nested cards. Pair semantic accents with semantic ' +
            'meaning: success/check for positive, warning for caution, error for risk, ' +
            'accent/zap for primary value props, info for context. Don\'t use color for ' +
            'decoration — every accent should mean something.',
          'Inline color emphasis (RichText `color` field) — use it sparingly to draw the eye to ' +
            'ONE keyword per heading (e.g. `[{text: "Una plataforma única para gestionar fondos ' +
            'judiciales de forma "}, {text: "integral", color: "success", bold: true}, {text: "."}]`). ' +
            'Anti-patterns: coloring whole headlines, coloring multiple words with different ' +
            'colors in the same heading, coloring body prose paragraphs.',
          'Slide chrome (v4.14): persistent header/footer regions configured at the DECK level ' +
            '(Deck.chrome — set via the chrome editor in the App, or programmatically). Each ' +
            'region has up to three slots (left / center / right). Slot kinds: `logo` ' +
            '(asset-backed brand mark, height sm | md | lg), `text` (RichText, rendered in mono ' +
            'caps), `page_number` (format "1" | "01" | "1/N"). Default cover behavior: chrome is ' +
            'HIDDEN on the cover slide unless the deck sets `showOnCover: true`. ' +
            'Per-slide opt-out: SlideIR.chrome_override = "hide" suppresses chrome on a single ' +
            'slide regardless of deck setting (useful for full-bleed visuals or section dividers). ' +
            'Authoring guidance: the agent does NOT set chrome on each slide — set it once on ' +
            'the deck. The agent CAN set `chrome_override: "hide"` on a specific slide when the ' +
            'deck-level chrome would clash with the content.',
        ],
      };
      return JSON.stringify(payload, null, 2);
    },
  });
}
