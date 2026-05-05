# v4.13 — implementation plan

This is the build plan for "Polish primitives," the first phase of the
gap-closing roadmap (`PLAN_v4.13_design_quality.md`). Three deliverables;
one new IR primitive (the rest is surfacing + verification).

## Deliverable 1 — `card` IR node (per-cell accent + icon)

**Why a new node, not a cell extension.** The original gap doc proposed
extending grid cells / two-column columns with `accent` + `icon` fields.
That works but couples styling to layout containers. A `card` leaf node
is cleaner:
- Additive (no breaking change to existing IR / stored documents)
- Reusable beyond grids (top-level `body`, two_column children, anywhere
  a leaf is allowed)
- Mirrors the existing `callout` pattern (a presentational wrapper around
  inner content)
- The schema cycle (card contains leaves, card is itself a leaf) is
  resolved by introducing `LeafBlockNode` = leaves *minus* card, and
  using that as `card.body`'s element type. Single level of nesting.

**Schema (`src/domain/ir/nodes.ts`)**

```ts
export const IconNameSchema = z.enum([
  // status
  'shield', 'lock', 'check', 'x', 'alert-triangle', 'info',
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
]); // ~32 icons — keep curated, expand on demand

export const CardNodeSchema = z.object({
  type: z.literal('card'),
  accent: TextColorSchema.optional(),  // top border + heading tint
  icon: IconNameSchema.optional(),     // glyph rendered above first heading
  eyebrow: RichTextSchema.optional(),  // small label above the body (Galici uses these)
  body: z.array(LeafBlockNodeSchema),
}).strict();
```

**Discriminated unions:**
- New `LeafBlockNodeSchema` = current LeafSlideNode union (10 leaves)
- Updated `LeafSlideNodeSchema` = LeafBlockNode + Card (11 leaves)
- Updated top-level `SlideNodeSchema` = current 16 + Card → 17
- `SLIDE_NODE_TYPES` gains `'card'`
- `card.body` uses `LeafBlockNodeSchema` (no nested cards)

**Renderer (`src/domain/ir/compile/node-renderers.ts`)**

```html
<article class="pengui-card pengui-card-accent-{accent}" data-ir-path="..." data-ir-node-type="card">
  <span class="pengui-card-icon" aria-hidden="true">{lucideSvg}</span>
  <p class="pengui-card-eyebrow">{eyebrow}</p>
  <div class="pengui-card-body">{leaves...}</div>
</article>
```

The accent class drives a `border-top: 3px solid var(--color-{role})`.
The icon SVG uses `currentColor` so it picks up the accent via a parent
color rule.

**CSS (`src/domain/ir/compile/layout-css.ts`)**

```css
.pengui-card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  border-top: 3px solid var(--color-border);
  display: flex; flex-direction: column; gap: var(--space-sm);
}
.pengui-card-accent-accent      { border-top-color: var(--color-accent-primary); }
.pengui-card-accent-accent_alt  { border-top-color: var(--color-accent-secondary); }
.pengui-card-accent-accent_warm { border-top-color: var(--color-accent-warm); }
.pengui-card-accent-success     { border-top-color: var(--color-success); }
.pengui-card-accent-warning     { border-top-color: var(--color-warning); }
.pengui-card-accent-error       { border-top-color: var(--color-error); }
.pengui-card-accent-info        { border-top-color: var(--color-info); }
.pengui-card-accent-muted       { border-top-color: var(--color-text-tertiary); }
.pengui-card-icon { width: 28px; height: 28px; color: var(--color-accent-primary); }
.pengui-card-accent-accent_alt   .pengui-card-icon { color: var(--color-accent-secondary); }
/* … one rule per accent so icon color tracks the border … */
.pengui-card-eyebrow {
  font-family: var(--font-mono); font-size: var(--text-label);
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--color-text-tertiary);
}
```

**Lucide SVGs (`src/domain/ir/compile/icons.ts`)**

New file. Static map `IconName → svg-string`. SVGs are the lucide v0.x
bodies, copied inline (24×24, stroke=2, currentColor). No runtime fetch.
One `getIconSvg(name)` export.

## Deliverable 2 — `CURRENT_COMPILER_REVISION` bump

`src/types/slide-document.ts`: 7 → 8. Required because `SlideDocument`
output changes for any deck using card nodes; without the bump,
slide-document-service.ts:53 will serve stale cached compiles and the
v4.13 features won't reach exports.

## Deliverable 3 — Inline color emphasis surfacing

The schema + compiler are already shipped (verified at
`src/domain/ir/compile/rich-text-renderer.ts:46`). The work is purely
documentation:

- `src/resources/slide-ir.resource.ts`: add a TextRun.color section with
  one good example (e.g. heading with one mint-green keyword) + one
  bad-pattern note ("don't color more than ~3 words per heading").
- The E2E deck (Deliverable 4) demonstrates it in the hero so renders
  prove the path works.

## Deliverable 4 — End-to-end verification

`scripts/e2e-v413-cards.mts` clones the v4.12 chart-export pattern.
Builds a 3-slide deck:

1. **Cover** — hero with inline color emphasis on one keyword
2. **Cinco desafíos críticos** — 3-column grid × 2 rows of `card` nodes
   with semantic accents (`success`, `warning`, `error`, `info`,
   `accent`, `accent_warm`) and lucide icons
3. **Soul-themed chart sanity** — the v4.12 bar chart against a punchier
   accent so the chart-theme-bridge swap is visible

Output: PDF, image-mode PPTX, editable PPTX → `output/Pengui_v413_*`.

Acceptance:
- All artifacts > 50 KB
- PPTX starts with `PK` magic bytes
- PDF starts with `%PDF-`
- Card slide HTML contains `pengui-card-accent-` and one of the icon SVG
  paths
- `qlmanage` thumbnail of cover renders without text overflow

## Out of scope (deferred to v4.14+)

- Per-slide chrome / dual-logo header
- Slide masters in PPTX
- App-side editor for accent/icon pickers (engine-only this release —
  the App can author cards via raw IR for now; sidebar UI comes next
  when we touch the App for v4.14 chrome)
- New stage-1 validators for card density (additive, can land any time)
