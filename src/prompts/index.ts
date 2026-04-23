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
      'Start here. Teaches you the two authoring models (slides vs. document), the key rules for each, and points you at the right docs and workflows.',
  }, () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `You are about to use Pengui Slides, an MCP server for creating branded decks and print documents.

IMPORTANT: Pengui Slides has TWO authoring models. Pick the right one first.

  authoringModel "slides"   — default for slides_16_9 decks (1920×1080 presentations).
                              Also the legacy mode for per-page print, opt-in only.
                              You author full HTML documents per slide.
                              Verbs: add_slide, update_slide, render_preview.
                              Exports: pptx, pdf, html, google_slides.

  authoringModel "document" — DEFAULT for print_a4_portrait / print_letter_portrait (v3).
                              You author HTML FRAGMENTS per Section; the composer
                              paginates on export. NO DOCTYPE, NO :root tokens,
                              NO <style> blocks inside a section — the composer
                              injects soul tokens once.
                              Verbs: add_section, update_section, list_sections,
                                     update_document_meta.
                              Exports: pdf only.

Before you begin, read these documentation resources:

1. pengui://docs/overview — core concepts, the two models, workflow maps
2. pengui://docs/design-souls — the 7-layer visual identity schema
3. pengui://docs/validation — checks and scoring for BOTH pipelines

Then read EITHER (not both):
   - pengui://docs/slide-format — canonical slide HTML (slide-model)
   - pengui://docs/document-mode — section fragments & composer (document-model)

KEY RULES (apply to both models):
- Never use literal colors (#hex, rgb()) — always var(--color-*).
- Never use literal spacing (24px) for padding/margin/gap — always var(--space-*).
- Never reference external URLs (no Google Fonts, no CDN links).
- Use asset://UUID refs for images, never raw base64.
- Call get_deck_summary first on an existing deck — it returns authoringModel.

KEY RULES specific to slide-model:
- Every slide is a STANDALONE HTML document with its own <style> block containing ALL soul CSS tokens.
- The slide frame dimensions come from the deck format
  (slides_16_9 = 1920×1080, print_a4_portrait = 1240×1754, print_letter_portrait = 1275×1650).
- .slide must have position: relative AND padding: var(--space-safe-area).
- Declare html, body { margin: 0; padding: 0 } EXPLICITLY.

KEY RULES specific to document-model:
- Sections are FRAGMENTS: a single <section class="pengui-section pengui-{kind}"> root.
  No DOCTYPE, no <html>/<head>/<body>, no <style>, no :root, no fixed page dimensions.
- Wrap keep-together content (figure/chart/diagram/callout/quote/image) in its
  canonical .pengui-{kind} class so universal break rules apply.
- Do NOT copy soul tokens into each section — the composer injects them once.

Confirm you understand by stating which model the user's task needs and why.`,
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

This prompt is for the SLIDE model (authoringModel="slides", deck format slides_16_9).
For printable PDFs (handouts / whitepapers / study summaries), abort and invoke the
\`create-document\` prompt instead — the v3 continuous-document flow produces much
better print output than stacking page-sized slides.

Follow this exact workflow:

STEP 1 — Design Soul
Read resource pengui://docs/design-souls to understand the 7 layers.
Register a Design Soul that matches the requested style. Be thorough with all 7 layers.
Then approve it to generate CSS tokens and recipes.

STEP 2 — Review Generated Assets
Use get_design_soul with include_recipes: true and include_style_guide: true.
Study the CSS tokens, utility classes, and recipe templates.

STEP 3 — Create the Deck
Use create_deck with the soul ID and presentation title.

STEP 4 — Build Each Slide
Read resource pengui://docs/slide-format for the exact HTML structure.
Read resource pengui://docs/css-utilities for available utility classes.
Read resource pengui://docs/recipes for layout inspiration.

For each slide:
- Use the FULL canonical HTML structure (DOCTYPE, <style> with ALL tokens, <div class="slide">)
- Use only var(--token) references — no literal colors or spacing
- Include the @slide-meta comment with layout type and title
- Do not introduce new blocking validation issues while iterating
- Fix pre-existing issues when explicitly requested or before export

STEP 5 — Export
Export to the desired format(s): export_pptx, export_pdf, or export_html.

IMPORTANT: Collaborative editing does not require every intermediate slide revision to reach score 1.0 immediately.
Final exported decks still require slides to pass full validation.
Read resource pengui://docs/validation for scoring details.`,
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

After registering, approve the soul to generate tokens and recipes.`,
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
`,
        },
      },
    ],
  }));

  /* ---------------------------------------------------------------- */
  /*  slide-html-quickref — copy-paste ready template                 */
  /* ---------------------------------------------------------------- */
  server.registerPrompt('slide-html-quickref', {
    title: 'Slide HTML Quick Reference',
    description:
      'Shows the exact HTML template to use when creating slides. Copy, fill in tokens, and customize.',
  }, () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `Read resource pengui://docs/slide-format for the complete slide HTML reference.

Quick template — every slide must follow this structure:

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    :root {
      /* PASTE ALL ~73 CSS TOKENS FROM THE SOUL HERE */
    }
    /* html/body reset must be explicit — the universal "*" selector has
       specificity 0 and does NOT override the UA stylesheet's 8px body
       margin. Declaring html and body explicitly wins. */
    html, body { margin: 0; padding: 0; }
    * { box-sizing: border-box; }
    .slide {
      width: 1920px;
      height: 1080px;
      padding: var(--space-safe-area);
      background: var(--color-canvas);
      color: var(--color-text-primary);
      font-family: var(--font-body);
      font-size: var(--text-body);
      overflow: hidden;
      position: relative;
    }
    /* Add utility classes and custom styles using var() only */
  </style>
</head>
<body>
  <!-- @slide-meta {"layout":"title-slide","title":"Your Title"} -->
  <div class="slide">
    <!-- Your content here -->
  </div>
</body>
</html>
\`\`\`

CHECKLIST before submitting:
[ ] DOCTYPE is the very first thing
[ ] :root block has ALL soul tokens (get them from get_design_soul)
[ ] html, body { margin: 0; padding: 0 } — declared EXPLICITLY (the * selector won't override UA body margin)
[ ] .slide has width/height matching the deck's format (1920×1080 for slides_16_9, 1240×1754 for print_a4_portrait, 1275×1650 for print_letter_portrait)
[ ] .slide has padding: var(--space-safe-area)
[ ] .slide has position: relative — REQUIRED so any absolutely-positioned descendants resolve against the slide's box (without it they escape up to <html> and your layout silently breaks)
[ ] All colors use var(--color-*) — no #hex, no rgb()
[ ] All padding/margin/gap use var(--space-*) — no literal px
[ ] All fonts are from the soul's allowedFonts list
[ ] No external URLs (no <link>, no http://)
[ ] Images use asset://UUID refs
[ ] @slide-meta comment has valid JSON`,
        },
      },
    ],
  }));
}
