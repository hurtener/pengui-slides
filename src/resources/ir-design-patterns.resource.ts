/**
 * MCP Resource: pengui://docs/ir-design-patterns
 *
 * The design cookbook. The IR schema (pengui://schema/slide-ir) tells you
 * what fields exist; this resource tells you HOW to compose them into
 * slides that look designed, not slapped together.
 *
 * Style note: every recipe ships as a complete, copy-pastable IR snippet
 * with semantic token roles only — no hex, no px outside structural cases.
 * Pair recipes; don't rewrite from scratch.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerResourceEntry } from './registry.js';

export const IR_DESIGN_PATTERNS_URI = 'pengui://docs/ir-design-patterns';

const BODY = `# IR Design Patterns — Composition Cookbook

You are authoring **SlideIR** — a tree of nodes the server compiles to soul-themed HTML.
You never write CSS or HTML. This guide teaches the composition patterns that turn the
raw node grammar into slides that read as designed work, with the v4.20 catalog.

> Pair this with \`pengui://schema/slide-ir\` (the JSON Schema, source of truth for fields)
> and \`pengui://docs/design-souls\` (the soul layers behind every \`var(--token)\`).

## Mental model — three layers, top to bottom

\`\`\`
┌─ SlideIR ──────────────────────────────────────────────┐
│  background_color? · canvas? · chrome_override?         │ ← slide-level chrome
│  body: SlideNode[]                                      │
│   ├─ Containers: card_section · card · grid · two_column│ ← composition
│   ├─ Visual leaves: hero · heading · prose · list ·     │
│   │                  callout · quote · table · chart ·  │ ← content
│   │                  image · divider                     │
│   ├─ Inline: chip · arrow                               │ ← marks
│   └─ Visual structure: flow · decoration                │ ← chrome
└─────────────────────────────────────────────────────────┘
\`\`\`

When a slide feels off, the fix is usually one layer up: not "tune this card" but
"wrap these three things in a card_section with a header_pill," or "the slide needs
\`canvas\`."

## Choosing a top-level shape

Match the slide's intent to one of these base shapes. Don't fight the catalog.

| Intent | Shape |
|---|---|
| Cover / opening / closing | \`hero\` (centered) ± a \`decoration\` for atmosphere |
| Section divider inside a deck | \`section_divider\` (full-bleed chapter break) |
| One headline + supporting bullets | \`hero\` + \`list\` OR \`heading\` + \`prose\` |
| Headline + visual on the right | \`two_column\` (ratio "1:1" or "2:3") |
| 2–4 parallel ideas (problems, modules, steps) | \`grid\` of \`card\` cells |
| Process / pipeline | \`flow\` (≤7 steps, label+icon+badge each) |
| Architecture / system diagram | \`canvas\` + \`grid\` + \`card_section\` + \`arrow\` |
| Data point | \`chart\` (use \`compile_chart\` to assemble) |
| Tabular data | \`table\` |
| Quote / testimonial | \`quote\` (centered) ± \`hero\` eyebrow above |

## Pattern 1 — Cover slide (hero + decoration)

\`\`\`json
{
  "background": "accent",
  "chrome_override": "hide",
  "body": [
    {
      "type": "decoration",
      "source": { "kind": "preset", "name": "glow_ring" },
      "anchor": "center_right",
      "accent": "accent_alt",
      "size": "lg",
      "layer": "background"
    },
    {
      "type": "hero",
      "align": "left",
      "eyebrow": [{ "text": "Q1 2026 — INVESTOR UPDATE" }],
      "title": [{ "text": "We built the trust layer for fund administration." }],
      "subtitle": [{ "text": "Pengui Slides · Engineering Update" }]
    }
  ]
}
\`\`\`

Why this works: \`background: "accent"\` (a SEMANTIC role) flips the cover to brand
color; the cascade-aware text default switches to inverse automatically.
\`chrome_override: "hide"\` suppresses page numbers / running header on the cover.

> **Hex escape hatch (\`background_color\`)**: when you need a tint outside the soul
> palette (e.g. a lavender wash for an architecture diagram backdrop), use
> \`SlideIR.background_color: "#F4F2FF"\` instead. It's the only field where a hex
> literal is allowed — same goes for \`canvas.background\`. Use sparingly; prefer
> roles whenever the soul palette has one that fits.

## Pattern 2 — Three problem cards (Galici "Cinco desafíos críticos")

\`\`\`json
{
  "body": [
    {
      "type": "hero",
      "eyebrow": [{ "text": "01 · DESAFÍOS" }],
      "title": [{ "text": "Tres puntos de fricción que nadie está resolviendo." }]
    },
    {
      "type": "grid",
      "columns": 3,
      "gap": "lg",
      "cells": [
        [{
          "type": "card",
          "accent": "warning",
          "icon": "alert-triangle",
          "eyebrow": [{ "text": "TRAZABILIDAD" }],
          "body": [
            { "type": "heading", "level": 3, "text": [{ "text": "El depósito no se ata al expediente." }] },
            { "type": "prose", "body": [{ "text": "Cada movimiento requiere reconciliación manual." }] }
          ]
        }],
        [{
          "type": "card",
          "accent": "error",
          "icon": "lock",
          "eyebrow": [{ "text": "AUDITORÍA" }],
          "body": [
            { "type": "heading", "level": 3, "text": [{ "text": "Sin pista clara para reguladores." }] },
            { "type": "prose", "body": [{ "text": "Las exportaciones se arman a mano cada vez." }] }
          ]
        }],
        [{
          "type": "card",
          "accent": "info",
          "icon": "users",
          "eyebrow": [{ "text": "OPERACIÓN" }],
          "body": [
            { "type": "heading", "level": 3, "text": [{ "text": "El equipo trabaja en tres herramientas." }] },
            { "type": "prose", "body": [{ "text": "Sin una vista única el tiempo se va en buscar datos." }] }
          ]
        }]
      ]
    }
  ]
}
\`\`\`

Why this works: each card carries a SEMANTIC accent (\`warning\` for caution, \`error\`
for risk, \`info\` for context) — the accent color tints the top border AND the icon in
one shot. Eyebrows act as compact labels that read as numbered steps without you
typing the numbers.

## Pattern 3 — Solution → Outcome (two_column)

\`\`\`json
{
  "body": [
    {
      "type": "two_column",
      "ratio": "1:1",
      "gap": "xl",
      "left": [
        {
          "type": "chip",
          "label": [{ "text": "SOLUCIÓN" }],
          "tone": "tint",
          "accent": "accent",
          "size": "lg"
        },
        { "type": "heading", "level": 1, "text": [{ "text": "Una plataforma única para gestionar fondos judiciales de forma ", "bold": false }, { "text": "integral", "color": "success", "bold": true }, { "text": "." }] },
        { "type": "prose", "body": [{ "text": "Conectamos depósitos, expedientes y reportes en un único sistema auditable." }] }
      ],
      "right": [
        { "type": "image", "asset_id": "PLACEHOLDER_UUID", "fit": "contain", "alt": "Pengui dashboard" }
      ]
    }
  ]
}
\`\`\`

Why this works: a single colored chip (\`tone: "tint"\`, \`size: "lg"\`) acts as a category
label without any heavy chrome. **One** word in the headline gets a color flag — the eye
locks onto it. Don't color whole sentences; pick one keyword per heading at most.

## Pattern 4 — Process pipeline (flow)

\`\`\`json
{
  "body": [
    {
      "type": "hero",
      "eyebrow": [{ "text": "CÓMO TRABAJAMOS" }],
      "title": [{ "text": "Cuatro pasos por sprint, sin sorpresas." }]
    },
    {
      "type": "flow",
      "direction": "horizontal",
      "connector": "arrow",
      "steps": [
        { "label": [{ "text": "Backlog Grooming" }], "accent": "info",        "icon": "layers", "badge": [{ "text": "01" }] },
        { "label": [{ "text": "Sprint Planning" }],  "accent": "accent",      "icon": "target", "badge": [{ "text": "02" }] },
        { "label": [{ "text": "Development" }],       "accent": "success",     "icon": "rocket", "badge": [{ "text": "03" }] },
        { "label": [{ "text": "Demo + Retro" }],      "accent": "accent_warm", "icon": "users",  "badge": [{ "text": "04" }] }
      ]
    }
  ]
}
\`\`\`

When to reach for \`flow\` vs a 4-cell \`grid\` of cards: flow is meant to read as a
sequence — connector glyphs reinforce direction. Grid is for parallel ideas without a
running order. Flow caps comfortably at 7 steps; beyond that, switch to a different
shape (a table, or a vertical card stack).

## Pattern 5 — Architecture diagram (canvas + card_section + arrow)

The v4.20 flagship pattern. Multiple cards inside an outer container, with arrows
indicating data flow. Use \`canvas\` for the white wrapper on a colored slide, and
\`card_section\` for any container that needs to hold cards-in-cards.

\`\`\`json
{
  "background_color": "#F4F2FF",
  "canvas": {
    "background": "#FFFFFF",
    "padding":    "var(--space-xl)",
    "radius":     "var(--radius-lg)",
    "shadow":     "soft"
  },
  "body": [
    {
      "type": "two_column",
      "ratio": "2:3",
      "left":  [{ "type": "chip", "label": [{ "text": "SOLUTION" }], "accent": "accent", "tone": "tint", "size": "md" }],
      "right": [{ "type": "hero", "title": [{ "text": "Consolidated semantic layer for trusted reporting." }] }]
    },
    {
      "type": "grid",
      "columns": 3,
      "ratio": "1:2:1",
      "gap": "lg",
      "align_items": "stretch",
      "cells": [
        [{ "type": "card", "accent": "info", "icon": "database", "eyebrow": [{ "text": "TPE SOURCES" }], "body": [
          { "type": "prose", "body": [{ "text": "Operational systems publish CDC events." }] }
        ]}],

        [{
          "type": "card_section",
          "border_style": "dashed",
          "header_pill": { "label": [{ "text": "DATABRICKS · UNITY CATALOG" }], "accent": "accent", "tone": "solid" },
          "body": [
            { "type": "heading", "level": 5, "text": [{ "text": "catalog: lakehouse" }] },
            { "type": "grid", "columns": 3, "gap": "sm", "cells": [
              [{ "type": "card", "size": "compact", "fill": "tint", "accent": "accent_warm", "eyebrow": [{ "text": "BRONZE" }], "body": [
                { "type": "prose", "body": [{ "text": "Raw events." }] }
              ]}],
              [{ "type": "card", "size": "compact", "fill": "tint", "accent": "muted",       "eyebrow": [{ "text": "SILVER" }], "body": [
                { "type": "prose", "body": [{ "text": "Cleansed + joined." }] }
              ]}],
              [{ "type": "card", "size": "compact", "fill": "tint", "accent": "warning",     "eyebrow": [{ "text": "GOLD" }],   "body": [
                { "type": "prose", "body": [{ "text": "Business-ready." }] }
              ]}]
            ]},
            { "type": "arrow", "direction": "right", "label": [{ "text": "PROMOTES" }] },
            { "type": "card", "fill": "tint", "accent": "info", "eyebrow": [{ "text": "SEMANTIC LAYER" }], "body": [
              { "type": "prose", "body": [{ "text": "Metrics, dimensions, governed joins." }] }
            ]}
          ]
        }],

        [
          { "type": "card", "fill": "solid", "accent": "accent", "icon": "rocket", "eyebrow": [{ "text": "AI PLATFORM" }], "body": [
            { "type": "prose", "body": [{ "text": "Agents query the semantic layer." }] }
          ]},
          { "type": "arrow", "direction": "right", "label": [{ "text": "READS" }] },
          { "type": "card_section", "accent": "success", "header_pill": { "label": [{ "text": "TRUSTED REPORTING" }], "accent": "success", "tone": "solid" }, "body": [
            { "type": "grid", "columns": 3, "gap": "xs", "cells": [
              [{ "type": "card", "size": "compact", "eyebrow": [{ "text": "DASHBOARDS" }], "body": [{ "type": "prose", "body": [{ "text": "Live KPIs." }] }] }],
              [{ "type": "card", "size": "compact", "eyebrow": [{ "text": "REPORTS" }],     "body": [{ "type": "prose", "body": [{ "text": "Daily PDFs." }] }] }],
              [{ "type": "card", "size": "compact", "eyebrow": [{ "text": "SELF-SERVE" }],  "body": [{ "type": "prose", "body": [{ "text": "Ad-hoc queries." }] }] }]
            ]}
          ]}
        ]
      ]
    }
  ]
}
\`\`\`

Why this works:
- \`canvas\` lifts the body onto a white card on top of the lavender slide.
- The dashed \`card_section\` hosts BRONZE/SILVER/GOLD as a nested 3-cell grid plus the
  arrow + SEMANTIC card — all things you cannot put inside a plain \`card\`.
- \`header_pill\` overlaps the \`card_section\` top border so the section reads as named.
- \`fill: "solid"\` on the AI Platform card flips text to inverse automatically.
- \`size: "compact"\` on inner cards halves the padding so they don't feel like
  adult-sized cards squeezed into a child grid.
- \`arrow\` between the AI Platform and Trusted Reporting cards anchors the data flow
  with a \`READS\` caption.

## Inline marks: chip and arrow

Chips are inline-flex pills meant for category labels, taxonomy tags, or compact
bullet rows. They do NOT stretch in flex columns — they stay content-fit.

| Use | size | tone | accent |
|---|---|---|---|
| Workspace dot in a strip | xs | tint | muted/info |
| Tag in a body row | sm (default) | tint | accent / role |
| Section label in a header | md | tint | accent |
| Brand pill on a hero / canvas header | lg | solid | accent |

Arrows are inline directional glyphs sized to flow text. Use \`label\` to caption the
edge (READS / WRITES / PROMOTES). Default \`direction: "right"\`. Style:
- \`solid\` (default) — primary data flow
- \`dashed\` — derived / asynchronous flow

For cyclic process visuals or "+ additive" connectors, reach for \`flow\` instead
(\`flow.connector\` accepts \`cycle\` and \`plus\` natively); the standalone \`arrow\`
leaf is meant for inline data-flow callouts, not full process diagrams.

## Accent vocabulary (semantic, not decorative)

Every accent role carries meaning. Pair the role with the content's intent:

| Role | Meaning | Iconography that pairs naturally |
|---|---|---|
| \`accent\` | Primary value prop, focal point | rocket · zap · target |
| \`accent_alt\` | Secondary value prop | layers · eye |
| \`accent_warm\` | Energy / momentum | trending-up · zap |
| \`success\` | Positive outcome / confirmation | check · trending-up |
| \`warning\` | Caution / friction (not yet broken) | alert-triangle |
| \`error\` | Risk / broken / blocked | x-octagon · lock |
| \`info\` | Context / informational | info · eye |
| \`muted\` | Neutral / supporting | (no icon) |
| \`inverse\` | Force inverse text on dark fills | (rare; cascade handles this) |

Never use color decoratively. Three cards of three different colors with no semantic
link is a smell — pick one role per card and let the icon reinforce it.

## Anti-patterns

1. **Stacking cards manually with prose between them** — the gap math drifts. Use a
   \`grid\` with \`gap\` instead, or \`card_section.body\` with explicit children.
2. **Using \`heading\` level 1 inside a card** — h1 is reserved for hero/cover. Use
   level 3–5 inside cards; \`eyebrow\` is the right slot for a card label.
3. **Coloring whole headlines or multiple words with different colors** — picks no
   single keyword. Limit to one accent word per heading.
4. **Reaching for \`flow\` for parallel ideas** — flow implies a running order. Use
   \`grid\` for parallel ideas, \`flow\` for sequential ones.
5. **Trying to nest a \`card\` inside a \`card.body\`** — \`card.body\` accepts leaves
   only. For card-in-card, use \`card_section\` as the outer container, or wrap inner
   cards in a \`grid\` cell.
6. **Hand-rolling spacing with empty \`divider\` nodes** — the IR's gap tokens already
   space siblings. Use \`grid.gap\` / \`card.size\` / \`SlideIR.canvas.padding\`.
7. **Adding \`canvas\` to a content slide with no obvious diagrammatic structure** —
   canvas is for compositions where multiple elements need to read as one card on
   top of a colored backdrop. A plain heading + bullets slide is worse with a canvas
   wrapping.

## Iteration tips for getting to "designed" quality

1. **Start from a pattern above.** Don't draft from scratch; copy the closest
   recipe and edit content.
2. **Pick the accent palette first.** Decide which of \`accent | accent_alt | warning
   | error | info | success\` each card carries before writing labels.
3. **One eye-catch per slide.** A colored hero word, OR a fill:solid card, OR a
   chip with tone:solid — not all three. The compiler is happy to render all three
   at once; the slide reads worse for it.
4. **Inner hierarchy via size + accent, not borders.** Nested cards use
   \`size: "compact"\` and \`fill: "tint"\` to recede behind the outer container.
5. **Use \`apply_slide_node_edit\` for tweaks.** Once a slide is on the deck, edit
   one node by path instead of resubmitting the whole IR — less drift, less
   recompile churn, faster iteration.
6. **Validate with \`validation_depth: "full"\` once the slide reads right.** Catches
   contrast failures (e.g. \`accent\` icon on \`accent\` fill) and overflow before
   export.
`;

export function registerIRDesignPatternsResource(server: McpServer): void {
  registerResourceEntry(server, {
    uri: IR_DESIGN_PATTERNS_URI,
    name: 'ir-design-patterns',
    mimeType: 'text/markdown',
    description:
      'IR composition cookbook — concrete patterns for designing high-quality slides ' +
      'with the v4.20 IR catalog (canvas, card_section, header_pill, chip, arrow, ' +
      'card.size/elevation/fill/border_style). Use it as the "how to design" companion ' +
      'to the JSON Schema at pengui://schema/slide-ir. Recipes: cover slide, three problem ' +
      'cards, solution + visual two-column, process pipeline (flow), architecture diagram ' +
      '(canvas + card_section + arrow), accent vocabulary, anti-patterns.',
    getText: () => BODY,
  });
}
