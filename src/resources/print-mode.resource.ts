/**
 * MCP Resource: pengui://docs/print-mode
 *
 * Concise print-mode authoring guide covering geometry rules, the recipe
 * index, page-chrome directive schema, and pointers to related resources.
 *
 * URI: pengui://docs/print-mode
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const RESOURCE_URI = 'pengui://docs/print-mode';

const CONTENT = `# Print Mode — Authoring Guide

Pengui Slides v2.0 adds a second output medium: **printable PDF documents** (A4 or US Letter portrait). Print mode shares Design Souls, the asset pipeline, and the validation engine with slide mode. Nothing about existing slide behavior changes.

---

## When to Use Print Mode

| Use case | Format |
|---|---|
| Exam study summaries, handouts, whitepapers | \`print_a4_portrait\` |
| US-standard reports and handouts | \`print_letter_portrait\` |
| Slide decks, presentations | \`slides_16_9\` (default) |

Print decks are **PDF-only**. \`export_pptx\` and \`export_google_slides\` return a typed error for print-format decks.

---

## A4 Geometry Rules

| Property | Value |
|---|---|
| Canvas size | 1240 × 1754 px |
| Safe-area inset | 96 px (all four sides) |
| \`.slide\` must declare | \`width: 1240px; height: 1754px; padding: var(--space-safe-area);\` |
| \`data-pengui-medium\` | \`"print"\` on the \`<html>\` element |
| Content area (usable) | 1048 × 1562 px (after safe area) |

US Letter: 1275 × 1650 px, same 96 px safe area.

All visual values must reference CSS custom properties — no literal hex, no literal px for padding/margin/gap. Exception: the \`.slide\` width/height declaration (geometry), \`viewBox\` coordinates, and SVG transform matrices.

---

## Recipe Index

| Recipe type | File | Description |
|---|---|---|
| \`cover\` | cover.html | Title page: deck title, subtitle, author, date, decorative stripe |
| \`toc\` | toc.html | Table of contents with dotted leaders |
| \`chapter_intro\` | chapter-intro.html | Chapter opener with number, title, overview, objectives |
| \`content\` | content.html | Generic text: heading, paragraphs, bullets, optional callout |
| \`content_chart\` | content-chart.html | Heading + body + inline SVG bar chart |
| \`content_diagram\` | content-diagram.html | Heading + body + inline SVG tree/mind-map |
| \`compare\` | compare.html | Two-column A vs B comparison |
| \`glossary\` | glossary.html | Term-definition list with alphabetical breaks |
| \`timeline\` | timeline.html | Horizontal timeline, alternating labels |
| \`summary\` | summary.html | Closing: numbered key takeaways + pull quote |
| \`bibliography\` | bibliography.html | Numbered reference list |

Retrieve all recipes for a soul: \`get_design_soul\` with \`include_recipes: true\`. Each recipe carries a \`medium\` field: \`"slides"\` or \`"print"\`. Filter by medium to get only print recipes.

---

## Typography Scale (Print Override)

The soul's typography is overridden for print via the \`[data-pengui-medium="print"]\` CSS selector. You do not need to change tokens or re-approve the soul — the override activates automatically when \`<html data-pengui-medium="print">\` is present.

| Token | Slide default | Print value |
|---|---|---|
| \`--text-display\` | 96 px | 56 px |
| \`--text-h1\` | 72 px | 36 px |
| \`--text-h2\` | 48 px | 24 px |
| \`--text-h3\` | 36 px | 18 px |
| \`--text-body\` | 28 px | 12 px |
| \`--text-caption\` | 20 px | 9 px |
| \`--leading-body\` | 1.4 | 1.55 |
| \`--space-safe-area\` | 48 px | 96 px |

---

## Page-Chrome Directive Schema

Print pages can opt into running headers and page numbers via the \`@page-chrome\` directive, placed alongside \`@slide-meta\` in the page HTML:

\`\`\`html
<!-- @page-chrome {"runningTitle": "Chapter 3 — Minerals", "pageNumber": true, "footerAlign": "right"} -->
\`\`\`

| Field | Type | Default | Meaning |
|---|---|---|---|
| \`runningTitle\` | string | deck.title | Text in the header strip |
| \`pageNumber\` | bool | \`true\` | Render "Page X of Y" in the footer |
| \`footerAlign\` | enum | \`"right"\` | \`"left"\` \\| \`"center"\` \\| \`"right"\` |
| \`hide\` | bool | \`false\` | Suppress chrome on this page (use for cover / TOC) |

Chrome resolution happens at PDF export time — the page HTML itself does not know its own page number. Validation ignores the directive beyond a syntactic JSON check.

---

## Workflow: Create a Print Document

\`\`\`
1. register_design_soul   → draft soul (same as slides)
2. approve_design_soul    → generates tokens + 6 slide recipes + 11 print recipes
3. create_deck            → { soul_id, format: "print_a4_portrait" }
4. get_design_soul        → include_recipes: true, filter by medium: "print"
5. add_slide (×N)         → each slide is a complete 1240×1754 HTML document
                            Start from a print recipe as a template.
6. export_pdf             → PDF-only; produces a multi-page PDF
\`\`\`

---

## Diagram & Chart Authoring

See \`pengui://docs/charts-and-diagrams\` for complete copy-paste SVG templates covering:

- Tree / mind-map (flagship)
- Flow diagram
- Vertical bar chart
- Horizontal bar chart
- Line chart
- Pie chart
- Comparison matrix (HTML table)
- Horizontal timeline

All templates use soul tokens (\`var(--color-*)\`, \`var(--text-*)\`) exclusively.

---

## Validation: Diagram Legibility Check

When a slide's \`@slide-meta\` type is \`content_diagram\` or \`content_chart\`, Stage 1 runs an additional \`diagram-legibility\` check. All findings are **warnings** (non-fatal):

- SVG must declare a \`viewBox\` attribute.
- All \`<text>\` elements must use \`font-size: var(--text-*)\` — no literal px/pt.
- Shape fills (\`<rect>\`, \`<circle>\`, \`<path>\`, \`<polygon>\`) must be \`var(--color-*)\`, \`none\`, \`transparent\`, or \`currentColor\`.
- Charts with more than 2 data-series elements must include a \`<g class="legend">\` group.
- Legend swatches must use the same \`var(--color-*)\` token as their corresponding chart element.
`;

export function registerPrintModeResource(server: McpServer): void {
  server.registerResource(
    'print-mode',
    RESOURCE_URI,
    {
      description:
        'Print-mode authoring guide: when to use print, A4/Letter geometry rules, ' +
        'the 11-recipe index, print typography scale, page-chrome directive schema, ' +
        'diagram-legibility validator rules, and the print document workflow.',
      mimeType: 'text/markdown',
    },
    () => ({
      contents: [
        {
          uri: RESOURCE_URI,
          mimeType: 'text/markdown',
          text: CONTENT,
        },
      ],
    }),
  );
}
