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
    * { margin: 0; padding: 0; box-sizing: border-box; }
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
[ ] .slide has width:1920px and height:1080px
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
