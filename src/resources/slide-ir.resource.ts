/**
 * MCP Resource: pengui://schema/slide-ir
 *
 * Exposes the SlideIR / SectionIR JSON Schema so agents can fetch the
 * authoritative node grammar with field types and enums, instead of
 * inferring shape from tool descriptions alone. Both slides (slide-model
 * decks) and sections (document-model decks) consume the same node union.
 *
 * v4.20 catalog (last revised 2026-05-08):
 *   Containers          : card (v4.13) · card_section (v4.20) · two_column · grid
 *   Text leaves         : hero · heading · prose · list · quote
 *   Visual leaves       : image · callout · table · chart · divider
 *   Inline marks        : chip (v4.19) · arrow (v4.20)
 *   Structure / chrome  : decoration (v4.16) · flow (v4.17)
 *   Doc-only            : toc · bibliography · page_break
 *   Slide-only          : section_divider
 *   SlideIR canvas      : optional outer wrapper (v4.20) — { background,
 *                         padding, radius, shadow }
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
      'JSON Schema for the Slide / Section IR node tree. v4.20 catalog: ' +
      'hero · heading · prose · list · quote · image · callout · table · chart · divider · ' +
      'card (v4.13) · card_section (v4.20) · chip (v4.19) · arrow (v4.20) · two_column · grid · ' +
      'decoration (v4.16) · flow (v4.17) plus the doc-only set (toc · bibliography · page_break) ' +
      'and slide-only section_divider. SlideIR also accepts an optional `canvas` wrapper ' +
      '(v4.20). Fields, rich-text run shape, and semantic token enums (background roles, color ' +
      'roles) are in the JSON Schema payload. Fetch this once per session and pair with ' +
      'pengui://docs/ir-design-patterns for composition recipes (the "how to design" cookbook).',
    getText: () => {
      const payload = {
        version: '4.20',
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
          'Card nodes (v4.13, extended through v4.20): presentational wrapper around a small ' +
            'group of leaves. Use INSIDE grid cells (`grid.cells[i] = [{ type: "card", ... }]`) ' +
            'or two_column children to get the "feature card with colored top-border + icon" ' +
            'pattern that proposal/pitch decks rely on (Galici "Cinco desafíos críticos", ' +
            '"Cuatro módulos"). Optional `accent` (TextColor enum: accent | accent_alt | ' +
            'accent_warm | success | warning | error | info | muted | inverse) drives the ' +
            'top-border tint AND the icon color in one go. Optional `icon` is one of the ' +
            'curated lucide names (shield, lock, check, alert-triangle, trending-up, target, ' +
            'eye, layers, rocket, zap, users, …). Optional `eyebrow` is a small uppercase ' +
            'label rendered above the body. v4.19+: `fill` (none | tint | solid) tints the ' +
            'card body with the accent role; `border_style` (solid | dashed | none) tunes the ' +
            'card border; `body_layout: "row"` lays children horizontally (chip strips, ' +
            'workspace dot rows). v4.20+: `size` (compact | default | large) controls inner ' +
            'padding; `elevation` (flat | raised) toggles a soft drop shadow; `header_pill` ' +
            '({ label, accent?, tone?, icon?, align? }) renders a chip-shaped pill anchored ' +
            'to the card top edge (Databricks · Unity Catalog header). `body` accepts LEAF ' +
            'nodes only — for nesting Cards inside Cards, use a `grid` cell whose contents ' +
            'are Cards, OR use the `card_section` container (next note). Pair semantic ' +
            'accents with semantic meaning: success/check for positive, warning for caution, ' +
            'error for risk, accent/zap for primary value props, info for context.',
          'card_section nodes (v4.20): top-level container that ACCEPTS arbitrary children ' +
            '(LeafSlideNode | grid | two_column) — this is the "card around a composition" ' +
            'pattern that lets you put 3 mini-cards inside an outer card, or an arrow row ' +
            'between two cards inside one outer container. Same chrome fields as card ' +
            '(accent, fill, border_style, size, elevation, header_pill). Use card_section ' +
            'when you need the "outer container with internal layout" — e.g. the dashed ' +
            'Databricks lakehouse box that wraps BRONZE/SILVER/GOLD + SEMANTIC + WORKSPACES ' +
            'in the architecture diagram.',
          'chip nodes (v4.19, sized v4.20): inline pill — `{ type: "chip", label: RichText, ' +
            'accent?, tone?: solid | tint | outline, icon?, size?: xs | sm | md | lg }`. ' +
            'tone:solid fills with the accent color (white text); tone:tint uses ~18% accent ' +
            'tint with currentColor text; tone:outline is bordered. size:xs is for compact ' +
            'workspace dots; size:lg is for prominent brand pills (SOLUTION, Databricks · ' +
            'Unity Catalog header). Chips are inline-flex and content-fit; inside a flex ' +
            'column they stay narrow (do not stretch).',
          'arrow nodes (v4.20): inline directional glyph — `{ type: "arrow", direction?: ' +
            'right | left | up | down, style?: solid | dashed | cycle | plus, label?: RichText, ' +
            'accent? }`. Reuses the existing connector glyph catalog (the same one Flow uses). ' +
            'Place inline between cards / inside grid cells to indicate flow ' +
            '(TPE → lakehouse → READS). Optional `label` renders below the glyph in mono caps ' +
            '("READS", "WRITES").',
          'SlideIR.canvas (v4.20): optional outer wrapper — `{ background?, padding?, radius?, ' +
            'shadow?: soft | medium | elevated }`. When set, the body is wrapped in a rounded ' +
            'container card on top of the slide background. Use for architecture diagrams ' +
            'where all body content sits inside a single rounded white card on a colored slide ' +
            'background. background accepts a hex string or a soul role; padding/radius accept ' +
            'soul space/radius tokens or a px literal; shadow uses a token-driven border tint ' +
            '(does not break editable PPTX export).',
          'Inline color emphasis (RichText `color` field) — use it sparingly to draw the eye to ' +
            'ONE keyword per heading (e.g. `[{text: "Una plataforma única para gestionar fondos ' +
            'judiciales de forma "}, {text: "integral", color: "success", bold: true}, {text: "."}]`). ' +
            'Anti-patterns: coloring whole headlines, coloring multiple words with different ' +
            'colors in the same heading, coloring body prose paragraphs.',
          'Slide chrome (v4.14, edited via `set_deck_chrome` tool in v4.18): persistent ' +
            'header/footer regions configured at the DECK level (Deck.chrome — set via the chrome ' +
            'editor in the App, or programmatically with `set_deck_chrome { deck_id, chrome }`). ' +
            'Each region has up to three slots (left / center / right). Slot kinds: `logo` ' +
            '(asset-backed brand mark, height sm | md | lg), `text` (RichText, rendered in mono ' +
            'caps), `page_number` (format "1" | "01" | "1/N"). Default cover behavior: chrome is ' +
            'HIDDEN on the cover slide unless the deck sets `showOnCover: true`. ' +
            'Per-slide opt-out: SlideIR.chrome_override = "hide" suppresses chrome on a single ' +
            'slide regardless of deck setting (useful for full-bleed visuals or section dividers). ' +
            'Authoring guidance: the agent does NOT set chrome on each slide — set it once on ' +
            'the deck via `set_deck_chrome`. The agent CAN set `chrome_override: "hide"` on a ' +
            'specific slide when the deck-level chrome would clash with the content.',
          'Decoration nodes (v4.16): TOP-LEVEL purely visual elements with no text content. ' +
            'Use them sparingly to add ornament / atmosphere — bleed marks, glow rings around a ' +
            'focal point, dotted grid texture in negative space. Two source kinds: `asset_ref` ' +
            '(uploaded asset by id, typically role: "illustration") OR `preset` (one of 6 inline ' +
            'SVG primitives: glow_ring · radial_glow · grid_dots · corner_bracket · ' +
            'chevron_arrow · noise_overlay). Placement uses `anchor` (9 in-canvas anchors plus ' +
            '8 bleed_* anchors that push past the canvas edge) + optional offset / size / ' +
            'rotation / opacity. `layer: "background"` paints behind body content; ' +
            '`layer: "foreground"` paints on top. `accent` tints preset ornaments via ' +
            'currentColor. Decorations CANNOT nest inside cards / grid cells — they always ' +
            'anchor against the slide / section root.',
          'Image frame chrome (v4.16): set `image.frame: "browser" | "phone" | "desktop" | ' +
            '"laptop"` to wrap the asset in a device-style chrome (browser titlebar + URL bar, ' +
            'phone bezel + status bar, monitor bezel + stand, laptop lid + keyboard). Pair with ' +
            'asset role "screenshot" for UI prototype visuals. Frame chrome ships as native ' +
            'PPTX shapes, not raster — every chrome element survives editable export.',
          'Flow nodes (v4.17): sequential pipeline visualisation (Galici slide 11 ' +
            '"Backlog Grooming → Sprint Planning → Development → Demo + retro"). Schema: ' +
            '`{ type: "flow", direction: "horizontal" | "vertical", connector: "arrow" | ' +
            '"arrow_dashed" | "cycle" | "plus", steps: [{ label: RichText, accent?, icon?, ' +
            'badge? }] }`. Min 2 steps; the validate_slide_ir tool emits a `flow-density-high` ' +
            'warning at >7 steps (visual readability). Each step pill mirrors the v4.13 card ' +
            'pattern (top-border accent + optional lucide icon + optional badge "01" / "Q1" / ' +
            '"Done"). Connector glyphs render between adjacent steps; `cycle` adds a closing ' +
            'return-arrow after the last step (visual loop cue, not a literal curved wrap). ' +
            'Flow can NEST inside cards / grid cells / two_column children, so use it to ' +
            'compose "process inside a card" patterns. v4.20 alternative: when steps need more ' +
            'than a label+icon (e.g. embedded chip rows or sub-cards), reach for grid + arrow ' +
            'leaves instead of flow.',
          'Asset roles (v4.16 widened): when uploading via upload_asset, pick the role that ' +
            'matches the use: `logo` (brand marks for chrome.header.left/right slots), ' +
            '`illustration` (decorations + hero accents), `screenshot` (pair with image.frame ' +
            'for UI prototype slides), `photo` (photographic content), `icon` (small inline ' +
            'marks distinct from the curated lucide set). `content` is a v4.15-and-earlier ' +
            'alias — agents on v4.16+ should pick a more specific role.',
          'Doc-only nodes: toc (auto table-of-contents resolved at print time from ' +
            'chapter_header / heading sections), bibliography (numbered reference list), ' +
            'page_break (forces flow onto a new page). All three are rejected at Stage 1 in ' +
            'slide IR — slides are page-bound, no pagination flow exists.',
          'Slide-only node: section_divider (full-bleed chapter break with optional label + ' +
            'ornament). Document mode uses chapter_header sections instead — section_divider is ' +
            'rejected at Stage 1 in section IR.',
        ],
      };
      return JSON.stringify(payload, null, 2);
    },
  });
}
