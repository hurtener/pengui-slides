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
      'Start here. Teaches you the core concepts, slide format rules, and the standard workflow for creating presentations.',
  }, () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: `You are about to use Pengui Slides, an MCP server for creating branded slide decks.

Before you begin, read these documentation resources to understand the system:

1. Read resource pengui://docs/overview — core concepts and key rules
2. Read resource pengui://docs/slide-format — the exact HTML structure every slide must follow
3. Read resource pengui://docs/validation — how slides are scored and what to avoid

KEY RULES (never forget these):
- Every slide is a STANDALONE HTML document with its own <style> block containing ALL soul CSS tokens.
- Never use literal colors (#hex, rgb()) — always var(--color-*).
- Never use literal spacing (24px) for padding/margin/gap — always var(--space-*).
- Never reference external URLs (no Google Fonts, no CDN links).
- The slide frame is exactly 1920×1080 px.
- Use asset://UUID refs for images, never raw base64.

After reading the resources, confirm you understand by summarizing the workflow:
register_design_soul → approve_design_soul → upload_asset → create_deck → add_slide → export`,
        },
      },
    ],
  }));

  /* ---------------------------------------------------------------- */
  /*  create-presentation — full workflow guide                       */
  /* ---------------------------------------------------------------- */
  server.registerPrompt('create-presentation', {
    title: 'Create a Presentation',
    description:
      'Guided workflow for creating a complete presentation: soul → deck → slides → export.',
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
          text: `Create a presentation about: "${args.topic}"
${args.slide_count ? `Number of slides: ${args.slide_count}` : 'Number of slides: 5'}
${args.style_description ? `Visual style: ${args.style_description}` : ''}

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
    title: 'Create a Print Document (Study Summary, Handout, Whitepaper)',
    description:
      'Guided workflow for creating a printable PDF document (A4 / Letter portrait). Use this for exam summaries, study handouts, whitepapers, and any content meant to be read on paper rather than projected.',
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
          text: `Create a printable PDF document about: "${args.topic}"
${args.page_count ? `Page count: ${args.page_count}` : 'Page count: 8'}
${args.style_description ? `Visual style: ${args.style_description}` : ''}
Page format: ${args.page_format?.toLowerCase() === 'letter' ? 'print_letter_portrait (US Letter)' : 'print_a4_portrait (A4)'}

PRINT MODE is a second medium of Pengui Slides. Pages are A4/Letter portrait, validation and rendering are geometry-aware, and the only supported export is PDF (PPTX / Google Slides will refuse print decks).

Follow this workflow:

STEP 1 — Read the print authoring guide
- Read resource pengui://docs/print-mode for the recipe index and authoring rules.
- Read resource pengui://docs/charts-and-diagrams for tree/mind-map, flow, bar/line/pie chart, and timeline SVG templates.
- Read resource pengui://docs/design-souls for the 7-layer soul schema.

STEP 2 — Design Soul
Register a Design Soul tuned for print reading (smaller body type, more generous leading). Typography defaults differ for print — the soul token generator emits a print-scoped block automatically, so the same soul can serve both slides and print. Approve the soul.

STEP 3 — Create the deck with a print format
Use create_deck with format: "${args.page_format?.toLowerCase() === 'letter' ? 'print_letter_portrait' : 'print_a4_portrait'}".

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
