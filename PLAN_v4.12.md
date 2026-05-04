# v4.12 plan — "Charts via ECharts"

One theme: add a first-class `chart` IR node so agents can drop data-driven charts into slides and sections, themed by the active soul, with a sensible PPTX fallback. v4.11 cleared the runway — direct manipulation works for compounds, the IR catalogue is open for extension, `compile_markdown` proved the "tool that returns IR" pattern. Charts is the next vertical: schema → renderer → export → validator → tool surface → picker tile, in one focused release.

**Scope is deliberately narrow.** Apache ECharts only. Static SVG output (no animations). Ten chart types max for v4.12 (bar, stacked-bar, line, area, scatter, pie, donut, histogram, heatmap, radar). Native PPTX charts are out — PPTX gets a server-rendered PNG. No interactive drill-downs, tooltips, or runtime user input. Anything richer waits for a v4.12.x patch or v5.0.

## Why this shape

Three reasons to do charts now, this way:

1. **The IR is ready for it.** Adding `chart` mirrors `image` / `table`: a leaf node with structured payload (`spec` blob + `data` array + `chartType` discriminator), `data-ir-path` on the figure root, no recursion, no compose-time cross-references. Slots straight into `LeafSlideNodeSchema` and the existing renderer dispatch in `node-renderers.ts`.
2. **The diagram-legibility check already maps the territory.** `src/domain/validation/stage1/diagram-legibility.ts` enforces `var(--color-*)` fills, viewBox presence, and legend rules for hand-rolled SVG diagrams. Chart output — once we render ECharts to SVG with soul-token colors — passes the same gate. The validator extension is additive, not invented from scratch.
3. **`compile_markdown` proved the pattern.** A pure server tool that takes a JSON-ish input, returns `{ nodes, warnings }`, and optionally inserts in one round-trip. `compile_chart` mirrors it exactly: take a chart spec, return a preview-or-insert. The agent never reasons about ECharts internals; it sends data + chart type.

## Scope (one theme, four sub-tracks)

### Track A — IR schema + renderer

`src/domain/ir/nodes.ts` — add `ChartNodeSchema` next to `TableNodeSchema`:

```ts
export const ChartTypeSchema = z.enum([
  'bar', 'stacked_bar', 'line', 'area',
  'scatter', 'pie', 'donut', 'histogram', 'heatmap', 'radar',
]);

export const ChartNodeSchema = z.object({
  type: z.literal('chart'),
  chart_type: ChartTypeSchema,
  /** Per-series rows. Shape varies by chart_type — validated render-time
   *  the same way TableNode validates row-vs-headers length (Zod refine
   *  doesn't compose with discriminatedUnion). */
  data: z.array(z.array(z.union([z.number(), z.string()]))).min(1),
  /** Header row for x-axis labels / category names. */
  series_labels: z.array(z.string()).optional(),
  category_labels: z.array(z.string()).optional(),
  /** Free-text axis titles. RichText overkill — chart axes are plain. */
  x_axis_title: z.string().optional(),
  y_axis_title: z.string().optional(),
  caption: RichTextSchema.optional(),
  /** Display knobs that don't change the underlying spec. */
  show_legend: z.boolean().optional(),
  show_grid: z.boolean().optional(),
  /** Numeric formatter hint — `'percent' | 'currency' | 'compact'`. */
  value_format: z.enum(['number', 'percent', 'currency', 'compact']).optional(),
}).strict();
```

Add to both `LeafSlideNodeSchema` and `SlideNodeSchema`. Append `'chart'` to `SLIDE_NODE_TYPES`.

`src/domain/ir/compile/node-renderers.ts` — new `renderChart(node, dataAttr)`. Emits a `<figure class="pengui-chart pengui-chart-${chart_type}" data-ir-path data-ir-node-type="chart">` wrapping the SVG output and an optional caption. The SVG comes from the **server-side ECharts renderer** (Track C) at compile time; the renderer reads the active soul's color tokens and feeds them into the ECharts theme bridge. Emits `var(--color-*)` references inside the SVG so the diagram-legibility check passes.

Critical: SVG must include `viewBox`, `<text>` font-sizes must reference `var(--text-*)`, fills must be `var(--color-*)` references. The renderer's job is to produce token-clean SVG, NOT to inline soul values — same compiler discipline as the rest of the pipeline.

**Compiler revision bump required.** `CURRENT_COMPILER_REVISION` in `src/types/slide-document.ts` goes from 6 → 7. Cached SlideDocuments without chart awareness must recompile on next export so the chart shape lands in the editable PPTX path. Comment in the constant lists every revision; v4.12 entry: `7: chart node renders to inline SVG with token-only fills + token-only text sizes; layout assigns its own native shape rect (image-class) per cell.`

### Track B — Soul / theme bridge

`src/domain/souls/token-generator.ts` — extend `buildCategoryColorTokens`. v4.7 derived four diagram categories (`--color-category-{a,b,c,d}` + `-tint`); charts need at least **eight** distinct categorical colors for stacked bars / multi-series lines. Add four more (`-e` through `-h`) by continuing the channel-rotation strategy with a different lightness pair. Keep the existing four byte-for-byte so the diagram templates stay byte-identical (the existing tree / mind-map templates depend on those exact hex values).

New module `src/domain/souls/chart-theme-bridge.ts` — single export:

```ts
export function buildEChartsTheme(layers: SoulLayers): EChartsTheme;
```

Returns the ECharts theme object: `color: [eight category hex literals]`, `backgroundColor: 'transparent'`, axis ink + label colors derived from `--color-text-secondary` / `--color-text-tertiary`, grid line color from a low-emphasis surface token. The bridge **resolves tokens to hex** because ECharts itself doesn't understand CSS variables — but the rendered SVG output then gets a post-pass that swaps the hex literals back to `var(--color-*)` references. (Two reasons: validator compliance, and so the rendered slide responds to soul switches without a recompile inside the same medium.)

The hex→var swap is a small textual replacement keyed off the theme's known palette — pure string work, no SVG parsing. ~30 lines.

### Track C — Server-side rendering

ECharts ships an SVG renderer that runs in Node without a DOM (`echarts/lib/svg`). New module `src/domain/rendering/chart-renderer.ts`:

```ts
export class ChartRenderer {
  render(node: ChartNode, theme: EChartsTheme): string; // SVG string
}
```

Bundle decision: **add `echarts` to `dependencies`**, lazy-import inside `chart-renderer.ts` so the existing tools that don't render charts don't pay the load cost. Approximate disk weight: ~3 MB minified (full ECharts), ~1 MB if we cherry-pick (`echarts/core` + the ten chart types we actually support). v4.12 ships full ECharts — cherry-picking is a v4.12.x size-pass after the API is stable.

The renderer is **pure**: same input → byte-identical SVG. No timestamps, no random ids, no hash suffixes. ECharts has a few non-determinism sources (random svg-element ids by default) — set `useDirtyRect: false` and pass an explicit `id` per option; if any leak, post-pass strips them.

Render budget: **< 80ms for a typical chart on a warm Node process** (bar/line/scatter with < 200 data points). Heatmaps and many-series charts exempt. If we slip past 200ms on routine cases, drop a series-count cap and warn.

### Track D — Export

**HTML / PDF (Playwright).** Charts already work as inline SVG; Playwright captures SVG identically to any other DOM element. No code change in `src/domain/rendering/pdf-exporter.ts` or `html-exporter.ts`. One concern: SVGs with embedded fonts need `font-display: swap` to print correctly — verify on a heatmap with rotated x-axis labels (the typical failure case).

**PPTX (image path).** `src/domain/rendering/pptx-exporter.ts` already renders each slide to a full-bleed PNG via Playwright, so charts ride for free in the image path — no changes needed.

**PPTX (editable path).** `src/domain/rendering/editable-pptx-exporter.ts` builds native PPTX shapes from the SlideDocument. Charts get a special case: emit a single `image` shape positioned at the chart's bbox, with the SVG **rasterized to PNG via Playwright** (not chrome's PDF path — a separate `page.screenshot` of just the chart's bounding rect, returned as PNG bytes for `pptxSlide.addImage`). Native PPTX `c:chart` parts are **out of scope** — the OOXML to drive PptxGenJS's chart API correctly across ten chart types is a multi-week diversion; PNG fallback gets us there in a day. Document this clearly in the chart-renderer comment block.

`src/domain/documents/html-slide-document-compiler.ts` — add a chart-aware branch in the element walker that emits `{ type: 'image', src: 'data:image/png;base64,…', bbox }` for each chart node. Reuses the existing image-shape codepath in the editable PPTX exporter. Compiler revision 7 documents the new element shape.

### Track E — Validation

`src/domain/validation/stage1/diagram-legibility.ts` — already covers chart-style SVG. New chart-specific check `src/domain/validation/stage1/chart-shape.ts` modeled after `section-table-shape.ts`:

1. **Series count vs. color tokens.** Stacked bar with 12 series and only 8 category colors → warning ("series 9–12 will reuse colors a–d; consider grouping").
2. **Axis titles for non-pie types.** Bar/line/scatter/area/heatmap/histogram/radar without `x_axis_title` AND `y_axis_title` → info-level nudge ("axis titles improve a11y; consider adding").
3. **Pie/donut series limit.** > 7 slices → warning ("pie charts are hard to read above 7 slices; consider bar or stacked bar").
4. **Heatmap data shape.** Cells must be a rectangular grid (every row same length); ragged rows → error.
5. **Legend overflow heuristic.** Series-label total character count > 200 with `show_legend: true` → warning ("legend may wrap or clip; consider shorter labels").
6. **Dark canvas contrast.** When the slide has `data-bg-mode="dark"` (already produced by the v4.7 dark-bg validator infrastructure), chart text colors must reference `--color-text-inverse`-family tokens. Reuse the existing color sampler from `src/domain/validation/stage2/color-sampler.ts`.

Wire into `src/domain/validation/stage1/stage1-runner.ts` — same insertion point as `DiagramLegibilityCheck`.

### Track F — MCP tool surface

New tool `compile_chart` mirrors `compile_markdown` (`src/tools/decks/compile-markdown.tool.ts`). Two modes:

1. **Preview** (no `target`): returns `{ node, warnings, svg_preview }`. The agent can show the SVG inline in the conversation before committing, useful for "iterate on chart_type / value_format" flows.
2. **Insert** (with `target`): server compiles, applies the insert in IR space, recompiles + revalidates the slide / section ONCE, saves, returns `{ inserted_path, warnings }`.

`src/tools/decks/compile-chart.tool.ts` (new). Register in `src/tools/index.ts` next to `registerCompileMarkdownTool`.

`apply_chart_node_edit` is **not a separate tool** — `apply_slide_node_edit` / `apply_section_node_edit` already accept any `SlideNode` payload, and the IR-first contract means agents send the full new chart node back. No new edit tool.

The existing `insert_slide_node` / `insert_section_node` tools work for chart inserts without code changes (they take a `SlideNode` payload that now includes `chart` after Track A's schema landing).

### Track G — App-side picker

`app/src/lib/nodeCatalogue.ts`:

- Add `'chart'` to `LeafNodeKind`.
- Add `{ kind: 'chart', group: 'block', label: 'Chart', hint: 'Bar, line, pie — soul-themed', glyph: '▥', shortcut: undefined }` to `CATALOGUE`. No keyboard shortcut — the letter space is crowded (`p / h / l / q / c / i / d` are taken; `c` is callout). Adding shortcuts to v4.11 compounds was already deferred; chart joins them.
- Extend `defaultNodePayload` with a `'chart'` branch returning `null` unless `options.chart_spec` is provided. The picker opens a chart-spec sub-flow (see below) and re-calls with the spec attached.
- `kindOfNode` — map `'chart'` → `'chart'`.
- `morphTargetsFor('chart')` returns `[]`. Charts aren't morphable from text — converting a paragraph into a chart needs a data-shape decision the bridge can't make.

`app/src/lib/NodeTypePicker.svelte` — chart tile triggers a sub-flow (new `app/src/lib/ChartSpecPicker.svelte`):
- Step 1: pick chart_type (10 tiles, one per type).
- Step 2: paste TSV / CSV (the simplest data-entry surface that doesn't need a spreadsheet widget). Auto-detect headers. Show inline SVG preview via the App-side bridge calling `compile_chart` in preview mode.
- Step 3: confirm → call `insert_*_node` with the chart payload.

The sub-flow is the **only place** the App talks to ECharts directly — and it doesn't, it asks the server. No client-side ECharts bundle in the App.

## Server work — file checklist

- `src/domain/ir/nodes.ts` — add `ChartTypeSchema`, `ChartNodeSchema`, append to leaf union + slide union + `SLIDE_NODE_TYPES`.
- `src/domain/ir/compile/node-renderers.ts` — `renderChart` + dispatch case + `renderNode` switch entry.
- `src/domain/souls/token-generator.ts` — extend `buildCategoryColorTokens` to 8 categories.
- `src/domain/souls/chart-theme-bridge.ts` — new module.
- `src/domain/rendering/chart-renderer.ts` — new module wrapping ECharts SVG renderer.
- `src/domain/validation/stage1/chart-shape.ts` — new check.
- `src/domain/validation/stage1/stage1-runner.ts` — register the check.
- `src/domain/documents/html-slide-document-compiler.ts` — chart→image-shape branch.
- `src/types/slide-document.ts` — bump `CURRENT_COMPILER_REVISION` 6 → 7, document the bump.
- `src/tools/decks/compile-chart.tool.ts` — new tool.
- `src/tools/index.ts` — register `compile_chart`.
- `package.json` — add `"echarts": "^5.5.0"` to `dependencies`.

## App work — file checklist

- `app/src/lib/nodeCatalogue.ts` — chart entry + payload composer + kindOfNode + morph targets.
- `app/src/lib/ChartSpecPicker.svelte` — new sub-flow component.
- `app/src/lib/NodeTypePicker.svelte` — wire chart tile → sub-flow.
- `app/src/lib/Editor.svelte` / `DocumentEditor.svelte` — `handleInsertPick` already routes catalogue kinds; the chart kind needs a hook to open `ChartSpecPicker` instead of an immediate `insert_*_node`. ~10 lines per editor.

## Out of scope (defer)

- **Native PPTX `c:chart` parts.** Editable charts inside PowerPoint stay PNG fallback for v4.12. Native chart embedding is a v5.0+ question (own theme — "round-trippable PPTX charts").
- **Animations / transitions.** ECharts supports them; we render static SVG. No animation in PDF/HTML/PPTX exports.
- **Interactive tooltips, drill-downs, brushing.** Slides are static; this is the wrong product surface.
- **Custom ECharts JSON spec passthrough.** v4.12's API is the structured `ChartNode` schema. Power users who want raw ECharts JSON wait for a v4.12.x escape-hatch tool (`render_echarts_spec`) that explicitly bypasses the IR.
- **Live data sources.** No fetch-from-URL, no DB connectors. Agents paste numeric arrays.
- **Charts inside `two_column` cells.** They're allowed by the IR (chart is a leaf), but the chart-spec sub-flow may produce SVGs that need full-width room. Validator's overflow check (Stage 2) catches the bad cases — no special UI restriction in v4.12.
- **Inline data editing on the canvas.** Edit-the-data flow goes through `apply_*_node_edit` with a fresh chart payload. Inline tabular data editor is a v5.0 question.
- **Chart-style validator rules at Stage 2.** The Stage 1 `chart-shape` check is the v4.12 gate; sampled-color and overflow checks at Stage 2 already cover what's left.
- **Markdown chart fences** (` ```chart … ``` ` in `compile_markdown`). v4.12.x patch — needs a JSON sub-grammar decision.

## Risks

- **ECharts bundle size.** ~3 MB of minified JS pulled into the server's `node_modules`. The MCP App is unaffected (App never imports echarts). Mitigation: lazy-load inside `chart-renderer.ts` so cold tools that never touch charts don't pay the parse cost. v4.12.x size-pass cherry-picks `echarts/core` + 10 chart types if it matters.
- **Server-side SVG rendering edge cases.** ECharts' SVG renderer is less battle-tested than its canvas renderer. Heatmaps with > 1000 cells, radar with many axes, and non-Latin text labels are the typical failure cases. Mitigation: test fixtures cover each chart type with realistic-but-bounded data; render budget cap (200ms hard timeout) bails out gracefully on pathological inputs.
- **Determinism.** ECharts assigns random ids to SVG elements by default. Mitigation: set explicit ids per option + post-pass strip residuals. SlideDocument cache keyed on revision-hash assumes byte-identical output for the same input — non-determinism breaks the cache.
- **Soul-token mapping.** Eight categorical colors derived from a single accent hex via channel rotation works for v4.7's diagram tokens (4 cats), but at 8 the colors start to repeat hue families. Mitigation: lightness alternation between adjacent indices (`a` light, `b` dark-of-rotated, `c` light-of-next-rotated, …) to keep adjacent categories visually distinct; ship + iterate.
- **PNG fallback fidelity in PPTX.** Charts that look crisp at 1920×1080 may pixelate at 4K. Mitigation: render the chart PNG at the slide's native resolution, NOT at a fixed thumbnail size. Existing `RESOLUTION_MAP` in `pptx-exporter.ts` already exposes 1080p / 4k.
- **Validation depth tradeoff.** The chart-shape check pulls cheerio over every slide once. Existing `DiagramLegibilityCheck` already loads cheerio for diagram slides only; chart-shape can do the same gate (`if (!html.includes('pengui-chart')) return []`). Mitigation: cheap pre-check before full parse.
- **Compiler revision rollout.** Existing decks compiled at revision 6 will recompile on next export when revision 7 lands. The recompile is normal — but a deck with no chart nodes shouldn't see any visual diff. Mitigation: golden-image test on a non-chart deck across revisions 6 → 7 confirming byte-identical PPTX/PNG output. Memory: `feedback_compiler_revision_bump.md` flagged this as routine.
- **App-side TSV paste UX.** Pasting from Excel or Google Sheets produces TSV with locale-formatted numbers (`1,234.56` vs. `1.234,56`). v4.12 takes US-format only and warns on parse failures. Mitigation: clear error in the sub-flow ("expected 1234.56 format; locale parsing is a v4.12.x patch").
- **Charts inside narrow cells.** Stage 2 overflow detector handles it but a user confused by a clipped legend will blame charts, not layout. Mitigation: the chart-shape Stage 1 warning on character counts gives an early signal before render.

## Success criteria

1. **Insert a 5-bar bar chart** via `compile_chart` → IR has a single `chart` node with `chart_type: 'bar'`, `data` rows preserved, valid Zod payload. Renders as inline SVG inside the slide preview. PDF / HTML / PPTX export all show the chart at the right place. Editable PPTX path embeds it as a single image shape.
2. **Insert a stacked bar with 8 series** → eight distinct categorical colors come from the soul. Switching the soul (via `update_design_soul`) recolors the chart at next export without a code change.
3. **Pie with 9 slices** → Stage 1 validator warns about slice count. Bar chart with 12 series → warns about color reuse.
4. **Dark-bg slide** containing a chart → axis text resolves to `--color-text-inverse`-family tokens; Stage 2 contrast sampler reports no failures.
5. **Round-trip a chart through `apply_slide_node_edit`** (change `chart_type: 'bar'` → `'line'`) → new SVG renders, comments pinned to the chart's `data-ir-path` survive (path is unchanged).
6. **Compiler revision 7** lands; existing non-chart decks recompile to byte-identical PPTX output (golden-image test); chart-bearing decks recompile cleanly.
7. **`compile_chart`'s preview mode** returns SVG short enough to fit in an MCP tool result. The agent can iterate on `value_format` without inserting.
8. **Tests** — chart schema round-trip, theme bridge color generation, chart-shape validator (8 rules), chart-renderer determinism, ECharts bundle lazy-load, App sub-flow, PPTX image-shape emission, golden export across revisions 6→7. Total: ≥ 1320 tests pass.
9. **No new tool fails on cold start.** First call to `compile_chart` after server boot stays under 800ms (ECharts lazy import cost). Subsequent calls stay under 200ms for typical inputs.

## Open design questions (decide during implementation)

1. **Chart caption: RichText or plain string?** Plan says RichText for symmetry with image's caption. Rich-text formatting on a chart caption (bold a number, link a source) is a real ask. Lean RichText. Cost: caption rendering goes through `renderRichText` like image's caption — already free.
2. **Where does the SVG `viewBox` come from?** ECharts assigns one based on the configured width × height. The renderer should pick a default canvas (e.g., 800 × 480 for landscape charts) and document it; the slide CSS scales the figure to fit its container via `width: 100%; height: auto`. Fixed aspect ratio per chart_type or one global default? Lean global default — agents who need a different aspect set `chart_type`-appropriate sizes via `apply_slide_node_edit` once we add an aspect_ratio knob (v4.12.x).
3. **Chart inside grid cell.** Already allowed by the leaf-only rule. Verify the rendered SVG scales to the cell's flexbox width. Manual check during implementation.
4. **PNG resolution for PPTX fallback.** Match slide DPI (1920×1080 or 3840×2160) or render at fixed 2× the chart's CSS box and rely on PowerPoint's image scaling? Lean fixed 2× — smaller PPTX file, no measurable visual difference at presentation distances.
5. **Theme-bridge memoization.** `buildEChartsTheme` is pure on a soul; cache by soul revision hash so repeated chart renders inside one export don't redo the token resolution. Simple Map, evict on soul change. Lean yes — measurable on multi-chart decks.

## Pre-flight tasks

- [ ] Server: write the failing schema test for `ChartNode`. Watch it fail. Land the schema.
- [ ] Server: scaffold `chart-renderer.ts` with a single bar-chart fixture; round-trip to SVG. Confirm determinism by hashing the output across 10 runs.
- [ ] Server: extend `buildCategoryColorTokens` to 8 categories; verify no existing diagram template's golden output changes.
- [ ] Server: add `chart` to `node-renderers.ts`, register in dispatch, emit `data-ir-node-type="chart"` (already automatic via `typeAttr`).
- [ ] Server: bump `CURRENT_COMPILER_REVISION` 6 → 7. Document the bump in the constant's comment block.
- [ ] Server: write `chart-shape` validator with all 8 rules + register in `stage1-runner.ts`.
- [ ] Server: scaffold `compile_chart` tool, wire through `tools/index.ts`. Mirror `compile_markdown`'s preview/insert duality.
- [ ] Server: extend `html-slide-document-compiler.ts` chart→image-shape branch + add fixture for editable PPTX golden.
- [ ] App: add `'chart'` to catalogue + payload composer + kindOf + morph targets.
- [ ] App: scaffold `ChartSpecPicker.svelte`; wire chart tile → sub-flow → `compile_chart` preview → `insert_*_node`.
- [ ] Manual round-trip in Claude Desktop: paste TSV → preview chart → insert into slide → drag the chart → export to PDF + PPTX. Repeat in document mode for sections.

## Status

Not started. Suggested branch: `v4.12-charts-echarts`.
