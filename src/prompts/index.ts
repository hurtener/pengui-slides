/**
 * MCP Prompts for Pengui Slides.
 *
 * Pre-built prompt templates that teach LLM agents how to use the system.
 * Each prompt assembles documentation + instructions into ready-to-use messages.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerAllPrompts(server: McpServer): void {
  /* ---------------------------------------------------------------- */
  /*  onboarding — first-time orientation                             */
  /* ---------------------------------------------------------------- */
  server.registerPrompt('onboarding', {
    title: 'Pengui Slides Onboarding',
    description:
      'Start here. Teaches you IR-first authoring, the two authoring models (slides vs. document), and points you at the design-patterns cookbook and JSON Schema.',
  }, () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `You are about to use Pengui Slides, an MCP server for creating branded decks and print documents.

CORE PRINCIPLE — Pengui is **IR-first**. You author **SlideIR / SectionIR** (typed
node trees), and the server compiles to soul-themed HTML deterministically. You
NEVER write HTML, CSS, or hex colors. The IR uses semantic token roles
("background: \\"accent\\"") and a curated node catalog (hero, card, grid, chip,
arrow, card_section, …).

TWO AUTHORING MODELS — pick the right one first:

  authoringModel "slides"   — default for slides_16_9 (1920×1080 presentations).
                              Verbs: add_slide, update_slide, apply_slide_node_edit,
                                     render_preview.
                              Exports: pptx, pdf, html, google_slides.

  authoringModel "document" — default for print_a4_portrait / print_letter_portrait.
                              You author **sections** (content blocks); the composer
                              paginates on export.
                              Verbs: add_section, update_section, list_sections,
                                     update_document_meta.
                              Exports: pdf only.

\`get_deck_summary\` returns \`authoringModel\` for any existing deck — call it first
on a deck you haven't touched.

REQUIRED READING (in order, before authoring):

  1. pengui://docs/overview          — concepts, the two models, the v4.20 catalog
  2. pengui://schema/slide-ir         — JSON Schema (the contract for every node)
  3. pengui://docs/ir-design-patterns — the composition cookbook (cover · 3 cards ·
                                         two-column · process flow · architecture
                                         diagram). **Read this before authoring slides
                                         — it teaches design quality with concrete
                                         IR snippets.**
  4. pengui://docs/design-souls       — the 7 soul layers + tokens they emit
  5. pengui://docs/validation         — lints, scoring, tips for score 1.0

Then EITHER:
  - pengui://docs/document-mode       — section fragments & composer (document-model)
  - pengui://docs/workflows           — slide-model step-by-step

KEY RULES — apply to both models:

  - Author IR, never HTML. \`add_slide\` / \`update_slide\` take \`slide_ir\`; section
    verbs mirror.
  - Token references are SEMANTIC roles, not literals. Use \`accent\`, \`success\`,
    \`warning\`, \`info\`, etc. — never hex.
    Hex escape hatch: only \`SlideIR.background_color\` and \`canvas.background\` accept
    hex strings (typed for tints outside the soul palette).
  - Images flow by id. \`upload_asset\` returns an id; reference it from
    \`{ type: "image", asset_id: "..." }\`. The LLM never handles base64.
  - Pre-flight with \`validate_slide_ir\` / \`validate_section_ir\` — Zod-level shape
    check, no storage side effects.
  - For surgical edits, use \`apply_slide_node_edit\` / \`apply_section_node_edit\`
    (replace one node by structural path).

DESIGN QUALITY — three habits to keep:

  1. Start from a pattern in pengui://docs/ir-design-patterns; don't draft from
     scratch.
  2. One eye-catch per slide (a colored hero word OR a fill:solid card OR a chip
     with tone:solid — not all three).
  3. Every accent role carries meaning. Use \`success\` for positive, \`warning\` for
     caution, \`error\` for risk, \`info\` for context. Don't pick colors decoratively.

COLLABORATIVE EDITING — comment workflow:

  - Start each turn on a deck you haven't touched this turn with \`list_comments\` to
    pick up feedback left since your last turn.
  - When you address a comment, call \`resolve_comment\` with a brief resolution note.
  - When you need a decision the user can answer at leisure, call \`add_comment\`
    (kind: "question") to pin the question on the slide rather than interrupting
    with prose. The user sees pins in the app.
  - Call \`get_session\` early — it returns the user's currently active deck + soul so
    you don't need to ask.

Confirm you understand by stating which authoring model the user's task needs and
why, and naming the first design pattern you'd reach for.`,
        },
      },
    ],
  }));

  /* ---------------------------------------------------------------- */
  /*  create-presentation — full workflow guide                       */
  /* ---------------------------------------------------------------- */
  server.registerPrompt('create-presentation', {
    title: 'Create a Slide Presentation (16:9)',
    description:
      'Guided workflow for creating a 16:9 slide presentation (authoringModel="slides", 1920×1080). For printable PDF documents, use the create-document prompt instead (v3 continuous-document flow).',
    argsSchema: {
      topic: z.string().describe('The topic or title of the presentation'),
      slide_count: z.string().optional().describe('Number of slides to create (default: 5)'),
      style_description: z.string().optional().describe('Visual style description (e.g., "dark tech, bold red accents")'),
    },
  }, (args) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Create a 16:9 slide presentation about: "${args.topic}"
${args.slide_count ? `Number of slides: ${args.slide_count}` : 'Number of slides: 5'}
${args.style_description ? `Visual style: ${args.style_description}` : ''}

This prompt is for the SLIDE model (authoringModel="slides", format slides_16_9).
For printable PDFs (handouts / whitepapers / study summaries), abort and invoke the
\`create-document\` prompt instead — the continuous-document flow produces much
better print output than stacking page-sized slides.

You will author **SlideIR** — typed node trees. The server compiles IR to
soul-themed HTML; you NEVER write HTML, CSS, or hex colors.

Follow this exact workflow:

STEP 1 — Design Soul
Read pengui://docs/design-souls. Register a Design Soul matching the requested style
(thorough across all 7 layers). Approve it to generate ~73 CSS tokens.

STEP 2 — Review the soul
Call get_design_soul { include_style_guide: true } and skim the token catalogue —
especially the color roles (canvas/surface/textPrimary/accentPrimary/success/warning/
error/info), font scale (hero/h1–h6/body/label/caption), and spacing scale (xs–xxxl).

STEP 3 — Create the deck
\`create_deck { soul_id, title, format: "slides_16_9" }\`. Confirm authoringModel="slides"
on the response.

STEP 4 — Read the IR contract + cookbook
Read in this order:
  1. pengui://schema/slide-ir         — JSON Schema (every field, every enum)
  2. pengui://docs/ir-design-patterns — composition cookbook (cover · 3 cards ·
                                         two-column · flow · architecture diagram)

The cookbook has copy-pastable IR snippets for every common slide shape. **Start
from a pattern; don't draft IR from scratch.** It also defines the accent vocabulary
(which role means "positive", "caution", "risk", "context", etc.) so accent choices
read as designed, not decorative.

STEP 5 — Build each slide
For each slide, pick the closest pattern from the cookbook and edit content. Then:
- Submit via \`add_slide { deck_id, slide_ir, metadata }\`.
- For tweaks to an existing slide, prefer \`apply_slide_node_edit\` (single-node patch
  by structural path) over re-submitting a full \`update_slide\`.
- Pre-flight with \`validate_slide_ir\` for a fast Zod-level shape check.
- Don't introduce new blocking validation issues while iterating. Fix pre-existing
  issues when requested or before export.

Design quality habits:
- One eye-catch per slide (colored hero word OR fill:solid card OR chip with
  tone:solid — not all three).
- Every accent carries meaning: success/check for positive, warning for caution,
  error for risk, accent/zap for primary value props, info for context.
- For architecture / system diagrams, reach for SlideIR.canvas + grid + card_section
  + arrow leaves (the Pattern 5 recipe).
- For sequential processes (≤7 steps), use \`flow\`. For parallel ideas, use \`grid\`
  of \`card\` cells.

STEP 6 — Export
\`export_pptx\` (editable PowerPoint) is the default for design-quality output.
\`export_pdf\` for print-ready PDFs. \`export_html\` for a self-contained web preview.
\`export_google_slides\` for Google.

Collaborative editing does not require every intermediate revision to reach score
1.0 immediately. Final exported decks still require slides to pass full validation.
Read pengui://docs/validation for scoring.

Check \`list_comments\` between turns for user feedback on this deck.`,
        },
      },
    ],
  }));

  /* ---------------------------------------------------------------- */
  /*  design-soul-guide — how to craft a good soul                    */
  /* ---------------------------------------------------------------- */
  server.registerPrompt('design-soul-guide', {
    title: 'Design Soul Guide',
    description:
      'Teaches how to define a thorough, high-quality Design Soul with all 7 layers.',
    argsSchema: {
      brand_name: z.string().optional().describe('The brand name to design for'),
    },
  }, (args) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `${args.brand_name ? `Design a soul for: ${args.brand_name}` : 'Design a new soul.'}

Read resource pengui://docs/design-souls for the complete layer reference.

Guidelines for each layer:

COLOR — Define a cohesive palette. Canvas and surface should have enough contrast.
  textPrimary should be highly readable on canvas. Accent colors should stand out.
  Don't forget semantic colors (success, warning, error, info).

TYPOGRAPHY — Choose complementary font families. Set a clear size hierarchy from
  hero (72px) down to caption (12px). Weights should create visual hierarchy
  (normal ~400, medium ~500, bold ~700). Line heights ~1.1 for headings, ~1.5 for body.

SPACING — Use a consistent scale. Base unit typically 8px. Scale up: xs(4), sm(8),
  md(16), lg(24), xl(32), xxl(48), xxxl(64). Safe area inset typically 60-80px.

SHAPE — Define border radii from none(0) to full(9999px). Component-specific
  radii (button, card, input, badge) should feel consistent.

DEPTH — Define shadow levels from none to elevated. Inner shadow for inset effects.
  Border width and opacity for subtle borders.

COMPONENTS — Card padding/shadow/border, button padding, input styling, badge sizing.
  These should feel consistent with the shape and depth layers.

MOTION — Fast (~100ms), normal (~200ms), slow (~400ms) durations. Easing curves
  for default and emphasized transitions. Include a northStar design philosophy
  statement, do-rules, and don't-rules.

After registering, approve the soul to generate tokens and recipes. After approving a soul, you can create a first draft deck (via \`create_deck\`) so the user can see tokens in context.`,
        },
      },
    ],
  }));

  /* ---------------------------------------------------------------- */
  /*  create-print-document — print-mode workflow                     */
  /* ---------------------------------------------------------------- */
  server.registerPrompt('create-print-document', {
    title: '[LEGACY v2] Create a Print Document via Slide-per-Page',
    description:
      '⚠️ LEGACY v2 FLOW. Prefer `create-document` (v3 continuous-document) for any new print work. This prompt drives the per-page print model (authoring_model: "slides" on a print format) which is only kept for backward compatibility and requires manual page-box wrestling. Only use when the user explicitly asks for the legacy flow or is editing an existing v2 print deck.',
    argsSchema: {
      topic: z.string().describe('The topic of the document'),
      page_count: z.string().optional().describe('Approximate page count (default: 8)'),
      style_description: z.string().optional().describe('Visual style description (e.g., "academic, warm paper feel, mint accents")'),
      page_format: z.string().optional().describe('"a4" (default) or "letter"'),
    },
  }, (args) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `⚠️ LEGACY v2 PRINT FLOW — only proceed if the user explicitly asked for the per-page slide model or is editing an existing v2 print deck. For new print documents prefer the \`create-document\` prompt (continuous-document v3).

Create a printable PDF document about: "${args.topic}"
${args.page_count ? `Page count: ${args.page_count}` : 'Page count: 8'}
${args.style_description ? `Visual style: ${args.style_description}` : ''}
Page format: ${args.page_format?.toLowerCase() === 'letter' ? 'print_letter_portrait (US Letter)' : 'print_a4_portrait (A4)'}

To use this legacy flow you MUST explicitly pass \`authoring_model: "slides"\` to \`create_deck\`. Without it, print decks default to authoringModel="document" (v3) and the section verbs, which this prompt does not cover.

PRINT MODE is a second medium of Pengui Slides. Pages are A4/Letter portrait, validation and rendering are geometry-aware, and the only supported export is PDF (PPTX / Google Slides will refuse print decks).

Follow this workflow:

STEP 1 — Read the print authoring guide
- Read resource pengui://docs/print-mode for the recipe index and authoring rules.
- Read resource pengui://docs/charts-and-diagrams for tree/mind-map, flow, bar/line/pie chart, and timeline SVG templates.
- Read resource pengui://docs/design-souls for the 7-layer soul schema.

STEP 2 — Design Soul
Register a Design Soul tuned for print reading (smaller body type, more generous leading). Typography defaults differ for print — the soul token generator emits a print-scoped block automatically, so the same soul can serve both slides and print. Approve the soul.

STEP 3 — Create the deck with a print format
Use create_deck with format: "${args.page_format?.toLowerCase() === 'letter' ? 'print_letter_portrait' : 'print_a4_portrait'}" AND authoring_model: "slides". Without authoring_model the deck would default to document mode and add_slide would refuse it.

STEP 4 — Build the document pages
Use the print recipe family (one HTML document per page). Typical structure for a study summary:
  1. cover          — title, subtitle, author, date
  2. toc            — table of contents
  3. chapter_intro  — chapter 1 opener
  4. content        — chapter 1 body (can span multiple content pages)
  5. content_diagram — a tree / mind-map for the key taxonomy
  6. content_chart  — a bar or line chart if there's quantitative data
  7. compare        — A vs B for any dichotomies
  8. glossary       — key terms
  9. summary        — key takeaways
 10. bibliography   — sources

Every page is a self-contained HTML document sized 1240×1754 (A4) or 1275×1650 (Letter), padded by var(--space-safe-area). The HTML includes \`<html data-pengui-medium="print">\` so the soul's print typography tokens activate.

For pages you want the running title + page number on, include a directive:
    <!-- @page-chrome {"runningTitle":"${args.topic}","pageNumber":true,"footerAlign":"right"} -->

For the cover and TOC, add \`"hide": true\` to suppress chrome on those pages.

STEP 5 — Charts and diagrams
All charts and diagrams are inline SVG with soul-token styling (colors, type, spacing from var(--*)). The diagram-legibility validator gently warns on missing legends, literal hex fills, and unreferenced font sizes. Use the templates in pengui://docs/charts-and-diagrams — especially the tree/mind-map for hierarchical taxonomies, which is ideal for study material.

STEP 6 — Validate and export
Validate each page as you add it. When the document reads end-to-end, call export_pdf. For print decks, the default PDF mode is "direct" (vector text, crisp charts, smaller files).

KEY RULES for print:
- Every page is a standalone HTML document at the deck's format geometry.
- Token-only CSS — no literal hex, no literal px (except width/height on the root .slide container).
- Use \`<html data-pengui-medium="print">\` to activate the print typography scope.
- Diagrams and charts are inline SVG using soul tokens — no external chart libraries.
- export_pptx and export_google_slides will refuse print decks — use export_pdf.
`,
        },
      },
    ],
  }));

  /* ---------------------------------------------------------------- */
  /*  create-document — continuous-document (v3) print workflow        */
  /* ---------------------------------------------------------------- */
  server.registerPrompt('create-document', {
    title: 'Create a Continuous Print Document (v3 flow)',
    description:
      'Guided workflow for authoring a PDF as a continuous flowing document — not a stack of page-sized slides. Use this for new print decks; the v3 authoringModel "document" is the default for print formats.',
    argsSchema: {
      topic: z.string().describe('The topic of the document'),
      section_count: z.string().optional().describe('Rough number of sections (default: 15)'),
      style_description: z.string().optional().describe('Visual style description'),
      page_format: z.string().optional().describe('"a4" (default) or "letter"'),
    },
  }, (args) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Create a continuous-document PDF about: "${args.topic}"
${args.section_count ? `Section count: ${args.section_count}` : 'Section count: ~15'}
${args.style_description ? `Visual style: ${args.style_description}` : ''}
Page format: ${args.page_format?.toLowerCase() === 'letter' ? 'print_letter_portrait (US Letter)' : 'print_a4_portrait (A4)'}

Document mode is the v3 authoring model for print decks. A deck is a linear list of **sections** (content blocks), not page-sized slides. The exporter composes sections into one HTML document and lets Chromium paginate. Universal CSS break rules keep figures/charts/diagrams whole; tables split with a repeating header row.

Follow this workflow:

STEP 1 — Read the document-mode authoring guide
- Read resource pengui://docs/document-mode — fragment contract, kinds, wrapper classes, break hints, validation.
- Read resource pengui://docs/charts-and-diagrams — inline SVG diagrams (tree/mind-map, flow, bar/line/pie, timeline) with soul-token styling.
- Read resource pengui://docs/design-souls — the 7-layer soul schema.

STEP 2 — Design Soul
Register a Design Soul tuned for print reading (smaller body type, generous leading). Approve the soul.

STEP 3 — Create the deck
Call create_deck with format: "${args.page_format?.toLowerCase() === 'letter' ? 'print_letter_portrait' : 'print_a4_portrait'}". Do NOT pass authoringModel — the default for print formats is "document" in v3, which is what you want. The deck exposes authoring_model in get_deck_summary so you can confirm.

STEP 4 — Configure document meta (optional)
Call update_document_meta with:
- chrome: running title + page numbers + footerAlign
- toc: { includeKinds: ["chapter_header"] } if you want auto-generated TOC

STEP 5 — Build the document, section by section
Call add_section N times. Each section is an HTML FRAGMENT — not a full HTML document. Rules (enforced by Section Stage 1 lints):
  - Root: <section class="pengui-section pengui-{kind}">
  - Preceded by <!-- @section-meta {...} --> comment
  - NO <!DOCTYPE>, <html>, <head>, <body>, <script>, <link>
  - NO standalone <style> blocks — soul tokens are injected once by the composer
  - NO :root { ... } blocks — same reason
  - NO fixed page-shaped dimensions (no width: 1240px, height: 1754px, overflow: hidden on the wrapper)
  - Wrap keep-together content in canonical classes (.pengui-figure, .pengui-chart, .pengui-diagram, .pengui-callout, .pengui-quote, .pengui-image)

Typical study-summary structure:
  1. cover           — title, subtitle, author, date (break_hints: { full_page: true })
  2. toc             — empty sentinel (auto-filled from chapter_header sections)
  3. chapter_header  — chapter opener (break_hints: { full_page: true })
  4. prose           — chapter 1 body, possibly multiple prose sections
  5. figure or diagram — key taxonomy or concept map (keep_together applies automatically)
  6. chart           — quantitative data (break-inside: avoid baked in)
  7. table           — comparison data (splits cleanly, header repeats)
  8. callout         — sidebars / warnings
  9. glossary        — key terms
 10. bibliography    — sources

For per-section chrome overrides (e.g., chapter running title), pass metadata.chromeOverrides.runningTitle.

STEP 6 — Validate and export
Each add_section runs fast Section Stage 1 (<100ms). At export time the composer runs Document Stage 2 which measures every keep-together block against page boundaries and flags splits. Call export_pdf when the document reads end-to-end.

KEY RULES for document mode:
- Sections are fragments, not full HTML documents. Let the composer do the wrapping.
- Do NOT copy soul tokens into each section — they live once at document scope.
- Wrap figures/charts/diagrams/callouts/quotes/images in .pengui-* classes so the universal break-inside: avoid rule catches them.
- Use semantic <table> with <thead> for tabular data so the header repeats across pages.
- export_pptx / export_google_slides refuse document-mode decks — use export_pdf.

Check \`list_comments\` between turns for user feedback on this deck.
`,
        },
      },
    ],
  }));

  /* ---------------------------------------------------------------- */
  /*  slide-ir-quickref — copy-paste-ready IR snippet                 */
  /* ---------------------------------------------------------------- */
  server.registerPrompt('slide-ir-quickref', {
    title: 'Slide IR Quick Reference',
    description:
      'A minimal SlideIR skeleton plus pointers to the JSON Schema and the design-patterns cookbook.',
  }, () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Read these two resources before authoring:
  1. pengui://schema/slide-ir         — JSON Schema (every field, every enum)
  2. pengui://docs/ir-design-patterns — composition cookbook with copy-pastable IR

Minimal SlideIR skeleton — pass as \`slide_ir\` to \`add_slide\`:

\\\`\\\`\\\`json
{
  "body": [
    {
      "type": "hero",
      "eyebrow": [{ "text": "SECTION LABEL" }],
      "title":   [{ "text": "Your headline goes here." }],
      "subtitle":[{ "text": "Optional supporting subtitle." }]
    },
    {
      "type": "grid",
      "columns": 3,
      "gap": "lg",
      "cells": [
        [{
          "type": "card",
          "accent": "info",
          "icon": "layers",
          "eyebrow": [{ "text": "ONE" }],
          "body": [
            { "type": "heading", "level": 3, "text": [{ "text": "Card title." }] },
            { "type": "prose", "body": [{ "text": "Supporting body text." }] }
          ]
        }],
        [{
          "type": "card",
          "accent": "success",
          "icon": "check",
          "eyebrow": [{ "text": "TWO" }],
          "body": [
            { "type": "heading", "level": 3, "text": [{ "text": "Card title." }] },
            { "type": "prose", "body": [{ "text": "Supporting body text." }] }
          ]
        }],
        [{
          "type": "card",
          "accent": "warning",
          "icon": "alert-triangle",
          "eyebrow": [{ "text": "THREE" }],
          "body": [
            { "type": "heading", "level": 3, "text": [{ "text": "Card title." }] },
            { "type": "prose", "body": [{ "text": "Supporting body text." }] }
          ]
        }]
      ]
    }
  ]
}
\\\`\\\`\\\`

CHECKLIST before submitting:
[ ] You're authoring IR (a node tree), NOT HTML.
[ ] Every \`accent\` is a semantic role (accent · accent_alt · accent_warm · success ·
    warning · error · info · muted · inverse) — no hex.
[ ] RichText runs are arrays of \`{ text, bold?, italic?, code?, strike?, sup?, sub?,
    link?, color? }\` objects. INCLUDE spaces inside text rather than relying on
    inter-run whitespace.
[ ] Containers nest correctly: \`card.body\` accepts LEAVES only; for nested cards
    use \`card_section\` (v4.20) which accepts grids/two_columns/inner cards.
[ ] \`grid.cells.length\` is a multiple of \`columns\`; cells are arrays of leaf nodes
    (no nested grid/two_column).
[ ] Images reference uploaded assets by id (\`asset_id: "..."\`); don't pass base64.
[ ] For architecture diagrams: SlideIR.canvas wraps the body in a rounded outer
    card; \`card_section\` containers hold cards-in-cards; \`arrow\` leaves anchor data
    flow. See pengui://docs/ir-design-patterns Pattern 5.
[ ] Doc-only nodes (\`toc\`, \`bibliography\`, \`page_break\`) are rejected in slide IR.
    Use heading + list instead.

For a tweak to an existing slide, prefer \`apply_slide_node_edit\` (single-node patch
by structural path) over a full \`update_slide\`.`,
        },
      },
    ],
  }));
}
