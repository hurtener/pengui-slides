# v4.17 — implementation plan: Flow & connectors

This is the build plan for **Phase 4** of the gap-closing roadmap
(`PLAN_v4.13_design_quality.md`):

> **Goal:** the pipeline/flow visualization on Galici slide 11 ("Backlog
> Grooming → Sprint Planning → …").
>
> **Exit criteria:** all 17 Galici slides expressible in IR.

This is the smallest release in the roadmap (estimated ~1.5 weeks per
the master plan). Single new IR node, focused renderer + CSS, one new
density lint, one E2E reproducing the Galici reference slide.

## What ships in v4.17 — full scope

One new IR primitive plus its supporting registry:

1. **`flow` IR node** — sequence of steps with directional connectors
   between them. Bimodal (slide + document).
2. **Connector glyph registry** — `arrow`, `arrow_dashed`, `cycle`,
   `plus`. Inline SVG primitives (~200 bytes each), `currentColor` for
   accent inheritance — same pattern as `icons.ts` (v4.13) and
   `ornaments.ts` (v4.16).
3. **Density lint** — Stage-1 warning when a flow has more than 7 steps.
4. **CURRENT_COMPILER_REVISION 13 → 14** — flow nodes emit a new shape
   inventory pattern (step pills as native shapes, connector glyphs as
   native images). Cached docs at rev 13 don't carry these.
5. **E2E** — reproduce Galici slide 11 (4-step horizontal arrow flow)
   plus a cycle-connector composition.

Plus the cross-cutting work that must ship every release:
- App-side renderer parity (slide HTML carries the new classes; the
  App's iframe-srcdoc render picks them up automatically — no new
  Svelte component needed unless we add an editor surface).
- Unit tests for schema + renderer + density lint.

## Architecture

### `flow` IR node (`src/domain/ir/nodes.ts`)

```ts
export const FlowConnectorSchema = z.enum([
  'arrow',         // solid arrow (→) — default; sequential process
  'arrow_dashed',  // dashed arrow — soft / proposed step
  'cycle',         // curved arrow — recurring process (last → first)
  'plus',          // plus glyph — additive composition
]);

export const FlowStepSchema = z.object({
  /** Primary step label. RichText so authors can color/bold individual
   *  words via the existing TextRun color enum. */
  label: RichTextSchema,
  /** Soul accent color. Drives the step pill's top-border tint and the
   *  icon color (matches the v4.13 card pattern). */
  accent: TextColorSchema.optional(),
  /** Curated lucide icon glyph above the label (same allowlist as
   *  CardNode.icon). */
  icon: IconNameSchema.optional(),
  /** Short corner badge — "01", "Done", "Q1", etc. Plain string; no
   *  rich-text formatting. */
  badge: z.string().max(16).optional(),
}).strict();

export const FlowNodeSchema = z.object({
  type: z.literal('flow'),
  direction: z.enum(['horizontal', 'vertical']),
  connector: FlowConnectorSchema,
  steps: z.array(FlowStepSchema).min(2),
}).strict();
```

`steps.min(2)` — a single step isn't a flow, it's just a card. The
density warning fires at 8+ steps (max 7 recommended); 2 is the hard
minimum enforced by the schema.

### Renderer (`src/domain/ir/compile/node-renderers.ts`)

`renderFlow()` emits a flex container with alternating step + connector
children:

```html
<ol class="pengui-flow pengui-flow-horizontal" data-ir-node-type="flow"
    data-ir-path="body,N">
  <li class="pengui-flow-step pengui-flow-step-accent-info" ...>
    <span class="pengui-flow-step-icon">…inline lucide SVG…</span>
    <span class="pengui-flow-step-badge">01</span>
    <p class="pengui-flow-step-label">Backlog grooming</p>
  </li>
  <li class="pengui-flow-connector pengui-flow-connector-arrow"
      aria-hidden="true">…inline arrow SVG…</li>
  <li class="pengui-flow-step …">…</li>
  <li class="pengui-flow-connector pengui-flow-connector-arrow">…</li>
  <li class="pengui-flow-step …">…</li>
</ol>
```

For `connector: 'cycle'`, a final connector glyph wraps from the last
step back to the first — emitted after the last step, with a different
visual (curved/return arrow). For `horizontal` the connectors are
inline; for `vertical` the flex direction column-stacks them.

The connector glyphs ship in `compile/connectors.ts` (sister registry
to `icons.ts` and `ornaments.ts`). Each glyph is ~200-byte inline SVG
with `currentColor` so the connector inherits a soul-token color.

### CSS (`src/domain/ir/compile/layout-css.ts`)

```css
.pengui-flow {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: stretch;
  gap: var(--space-md);
  flex: 1 1 auto;
  min-height: 0;
}
.pengui-flow-horizontal { flex-direction: row; }
.pengui-flow-vertical { flex-direction: column; }

.pengui-flow-step {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-top: 3px solid var(--color-text-muted);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  flex: 1 1 0;          /* horizontal: equal-width steps */
  position: relative;
  /* No box-shadow per v4.16 frame learnings — planner flips
   * shadowed elements to slide background. */
}

.pengui-flow-step-accent-* { /* top-border tint, same as card */ }

.pengui-flow-step-icon { color: inherit; }
.pengui-flow-step-icon > svg { width: 24px; height: 24px; }
.pengui-flow-step-badge {
  position: absolute;
  top: var(--space-sm);
  right: var(--space-sm);
  font-family: var(--font-mono);
  font-size: var(--text-caption);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.pengui-flow-connector {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 48px;
  color: var(--color-text-muted);
}
.pengui-flow-vertical > .pengui-flow-connector {
  width: auto;
  height: 32px;
}
.pengui-flow-connector > svg {
  width: 100%;
  height: 100%;
  max-width: 48px;
  max-height: 48px;
}
```

Connector dimensions are fixed-px because flex isn't enough — they're
positioned glyphs, not flowed content. 48px gives the arrow enough room
without dominating the step pills. Vertical flows rotate dimensions.

### Connector glyph registry (`src/domain/ir/compile/connectors.ts`)

```ts
export interface FlowConnectorDef {
  /** Inline SVG. currentColor for stroke + fill. */
  svg: string;
  /** Square viewBox so the glyph rotates cleanly between horizontal
   *  and vertical (CSS rotate(90deg) on .pengui-flow-vertical
   *  > .pengui-flow-connector swaps the orientation). */
  viewBox: '0 0 24 24';
}

const CONNECTORS: Record<FlowConnector, FlowConnectorDef> = {
  arrow: { svg: '<svg…><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>', viewBox: '0 0 24 24' },
  arrow_dashed: { svg: '<svg…><path stroke-dasharray="4 4" d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>', viewBox: '0 0 24 24' },
  cycle: { svg: '<svg…>↻ glyph…</svg>', viewBox: '0 0 24 24' },
  plus: { svg: '<svg…><path d="M12 5v14"/><path d="M5 12h14"/></svg>', viewBox: '0 0 24 24' },
};

export function getConnectorSvg(name: FlowConnector): string;
```

The horizontal arrow rotates to point down via CSS `rotate(90deg)` on
the `.pengui-flow-vertical > .pengui-flow-connector` selector. Cycle
glyph stays orientation-agnostic.

### `cycle` connector handling

For `connector: 'cycle'`, the renderer emits a closing connector after
the last step. Layout-wise this connector wraps visually back to the
first step. The simplest implementation: append a `cycle`-styled
connector at the end with a special class
(`.pengui-flow-connector-return`) and use CSS `transform: rotate(180deg)`
to point back. Honest visual fidelity isn't 100% — we don't draw a
curved line that physically connects last→first — but the directional
arrow + glyph combo reads as "this loops" to the audience.

### Density lint

New Stage-1 IR-level rule (placed alongside the existing
`lintNodesForMode` in `src/domain/ir/mode-check.ts` or a new
`src/domain/validation/stage1/flow-density.ts` if we want it visible to
the export-time validator):

- Walk SlideIR body recursively (including grid cells, two_column children)
- For each `flow` node, if `steps.length > 7`, emit a warning with code
  `flow-density-high`, severity `warning`, message "Flow has N steps;
  consider splitting at 7."
- Warning, not error — visual density is the author's call. Export still
  succeeds.

Existing pipeline integration: warnings flow through the v4.7
`validate_deck_for_export` surface alongside other Stage-1 issues.

### CURRENT_COMPILER_REVISION 13 → 14

Flow nodes emit:
- Step pills: native `<p:sp>` rectangles with `border-top` accent
  (v4.13 card pattern — already handled by the walker)
- Step icons: inline SVG → native `<p:pic>` with data URI (v4.14.5
  pattern — already handled)
- Step badges: native text shapes (text walker already covers)
- Connector glyphs: inline SVG → native `<p:pic>` (v4.14.5 pattern)

No new walker logic needed — flow leans on the v4.13/4.14.5 inventory
patterns. The revision bump exists because cached docs at rev 13 were
compiled before the `flow` node existed and never carry these shapes.

### E2E (`scripts/e2e-v417-flow.mts`)

Three slides:

1. **Process flow (Galici slide 11 reference)** — 4-step horizontal
   arrow flow: `Backlog grooming → Sprint planning → Development →
   Demo + retro`. Each step has an icon + accent + badge.
2. **Cycle flow** — 4-step `Plan → Build → Measure → Learn` with the
   `cycle` connector (last → first wrap).
3. **Density warning** — 8 steps, asserts the lint fires with
   `flow-density-high` warning code but export still succeeds.

Structural assertions on the editable PPTX:
- 4 step pills as native `<p:sp>` per slide × 3 slides
- 3 connector glyphs per 4-step flow (between step 1-2, 2-3, 3-4) +
  1 closing for cycle
- Native text shapes for every step label + badge
- Mode stays `native_only` for every slide

## Risks

1. **Cycle connector visual fidelity.** Drawing a curved line that
   physically wraps from last → first step is layout-engine-hard
   (would need SVG with computed bezier coords). v4.17 ships a
   simpler "return arrow" glyph after the last step that visually
   communicates the cycle without literally drawing the wrap. If the
   Galici-style reference needs the literal curve, that's a v4.18+
   refinement.

2. **Vertical flow dimensions.** 48px connector width is sized for
   horizontal arrows; the vertical variant uses CSS rotation to swap
   orientation. Some connector glyphs (cycle, plus) are
   orientation-agnostic; arrow / arrow_dashed need the rotation.

3. **Step pill sizing.** `flex: 1 1 0` makes horizontal steps
   equal-width regardless of label length. Pathological label lengths
   (very short + very long mixed) create visual imbalance. Mitigation:
   the density warning at >7 steps captures most cases; for individual
   long labels the label wraps within its pill.

4. **Mode constraint.** Flow is bimodal — works in slide AND document
   modes. Verified by leaving it out of `SLIDE_ONLY_NODE_TYPES` and
   `DOC_ONLY_NODE_TYPES`. The renderer outputs the same HTML in both
   modes; document composer's per-section CSS already covers the
   classes since they live in the shared `NODE_CSS` block.

## What's deferred

- **Per-step variable widths.** v4.17 ships equal-width steps. If a
  flow needs a "wide hero step + narrow follow-ups", that's a `ratio`
  field on FlowNode for v4.18 (mirrors the GridNode ratio pattern).
- **Connectors that physically draw last→first wrap.** Cycle ships as
  a return-arrow glyph; the literal curve is deferred.
- **Timeline subsumption.** The master plan asks: does flow subsume
  timeline? Probably yes — a horizontal flow with date badges is a
  timeline. v4.17 leaves `timeline` as a non-node (no schema entry,
  no recipe). If we hit a soul that needs date-range visuals (Gantt-
  style), we add a `flow.variant: 'timeline'` field then.
- **App flow editor.** Per the standing MCP-App-primary constraint,
  v4.17 ships engine-only. App catches up next App-touching release
  (the iframe-srcdoc render already picks up the new classes since
  the slide HTML carries them — what's missing is the drag-to-reorder
  step UI in the inspector).

## Exit criteria

Per the master plan: **all 17 Galici slides expressible in IR**. v4.17
closes the last gap (the pipeline visualization).

In code terms:
- All E2E test cases pass (4-step process, 4-step cycle, 8-step density)
- 1278+ unit tests still green (no regressions)
- `tsc --noEmit` clean
- Editable PPTX for the process-flow slide opens cleanly in PowerPoint
  with every step + connector as a native shape (verifiable via the
  output PPTX file)
- All 7 prior E2Es (v4.13 → v4.16) re-run green
