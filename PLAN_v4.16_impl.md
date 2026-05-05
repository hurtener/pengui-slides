# v4.16 — implementation plan: Decoration & assets

This is the build plan for **Phase 3** of the gap-closing roadmap
(`PLAN_v4.13_design_quality.md`):

> **Goal:** custom illustrations, ornaments, framed screenshots, brand
> marks bleeding off-canvas.

This is the largest single release in the roadmap (estimated 4 weeks)
and the one that lands the visual impact users notice first — the giant
bleed-off "C" on the Project Management cover, the glow-rings on Galici
slide 3, the framed UI prototype screenshots on Galici slides 5 / 8 / 9.

**This release is NOT** motion / build animations. The roadmap explicitly
defers animation — design-team-quality static exports are the benchmark.

## What ships in v4.16 — full scope

Five additive areas, each independently shippable but designed together:

1. **Asset library categorisation** (extension to existing `assets`
   domain).
2. **`decoration` IR node** — new node type, layered + anchored.
3. **Preset ornaments** — ~6 SVG primitives the agent uses without an
   asset upload.
4. **Framed screenshot** — refinement to existing `image` node.
5. **Bleed support** — placement anchors that extend past the canvas
   edge.

Plus the cross-cutting work that must ship every release:
- Validation rules (Stage-1 lint + per-issue export errors)
- Recipes covering each new affordance
- E2E reproducing real benchmark slides
- App-side editor parity (per the standing MCP-App-primary constraint)

## Cross-cutting principles (from the master plan)

1. MCP-App-primary — every IR change ships with App rendering + editing
   in the same release.
2. Bump `CURRENT_COMPILER_REVISION` (12 → 13) since `decoration` adds a
   new node kind that emits new shape inventory.
3. One reference deck — re-render the **PM Top Concerns cover** (giant
   bleed-off "C") and **Galici slide 3** (glow ring shield) as the
   release's smoke test.
4. Validation ships with the IR (Stage-1 lint + export gate).
5. Recipes regenerate — agents won't discover decoration without them.
6. Slides + Print parity from day one for the `decoration` node and
   `image.frame` (both make sense in document/print mode too).

## Architecture

### Asset library categorisation (Step 1)

`AssetService.upload` already accepts `role: 'logo' | 'content'`. Widen
the role enum:

```ts
type AssetRole =
  | 'logo'
  | 'illustration'   // hand-drawn / vector / brand mark
  | 'screenshot'     // app UI capture, paired with the framed image node
  | 'photo'          // photographic content (people, places, products)
  | 'icon';          // small mark used inline (NOT the lucide curated set)
```

Backwards compatibility: existing assets stored as `role: 'content'`
remain valid. Migrate-on-read: classify legacy `'content'` assets as
`'photo'` for surfacing in the App picker, but the asset payload itself
is unchanged.

App-only upload tools (`upload_asset`) gain the wider role enum. No
agent-facing tool changes — the standing constraint is that agents
reference assets by ID, never upload. New asset query helpers:

- `list_assets({ role?, scope? })` already exists; widen the role
  filter.
- `decoration_preset_catalog()` (new tool) — lists the 6 preset
  ornaments + their accepted soul-token slots, so agents can pick
  without guessing names.

### `decoration` IR node (Step 2)

```ts
const DecorationSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('asset_ref'), asset_id: z.string().min(1) }),
  z.object({ kind: z.literal('preset'), name: PresetOrnamentNameSchema }),
]);

const DecorationPlacementSchema = z.object({
  anchor: z.enum([
    'top_left', 'top_center', 'top_right',
    'middle_left', 'middle_center', 'middle_right',
    'bottom_left', 'bottom_center', 'bottom_right',
    // v4.16 bleed anchors
    'bleed_left', 'bleed_right', 'bleed_top', 'bleed_bottom',
    'bleed_top_left', 'bleed_top_right',
    'bleed_bottom_left', 'bleed_bottom_right',
  ]),
  /** Pixel offset from the anchor. Positive values move toward the
   *  slide centre. */
  offset: z.object({ x: z.number(), y: z.number() }).optional(),
  /** Override decoration size (defaults to natural size for assets,
   *  preset-defined size for ornaments). */
  size: z.object({ width: z.number().positive(), height: z.number().positive() }).optional(),
  rotation: z.number().min(-360).max(360).optional(),
  opacity: z.number().min(0).max(1).optional(),
});

export const DecorationNodeSchema = z.object({
  type: z.literal('decoration'),
  source: DecorationSourceSchema,
  placement: DecorationPlacementSchema,
  /** background = renders behind body content (full-bleed marks);
   *  foreground = renders on top of body (glow rings around a focal point). */
  layer: z.enum(['background', 'foreground']),
  /** Optional accent colour for preset ornaments. Soul token name
   *  (`accent`, `accent_warm`, etc.). Ignored for asset_ref. */
  accent: TextColorSchema.optional(),
}).strict();
```

Renderer outputs an absolutely-positioned `<aside class="pengui-decoration
pengui-decoration-{layer}">` containing either:
- For `asset_ref`: `<img>` (resolved by `resolveAssetRefs` to a data:
  URI at compile time, same as v4.15 fonts).
- For `preset`: inline SVG from the preset catalog (currentColor
  consumes the resolved `accent` token, so soul re-theming is free).

The `<aside>` lives outside the slide body's flex flow — bleed anchors
push it past the slide root via negative `inset` values. Slide root
gains `overflow: visible` so the bleed isn't clipped.

### Preset ornaments (Step 3)

Bundled as inline SVG in `src/domain/ir/compile/ornaments.ts` — same
pattern as `icons.ts` from v4.13. Six presets:

| Preset | Use case | Bench reference |
|---|---|---|
| `glow_ring` | Halo around a focal point | Galici slide 3 |
| `radial_glow` | Soft gradient backdrop | hero slides |
| `grid_dots` | Texture for empty regions | data slides |
| `corner_bracket` | Frame device for emphasis | quote callouts |
| `chevron_arrow` | Directional accent | flow / process |
| `noise_overlay` | Subtle grain texture | photo overlays |

Each preset is a viewBox-normalised SVG using `currentColor` for the
accent stroke/fill, sized via the `placement.size` override (or a
sensible default — e.g. `glow_ring` defaults to 480×480px). Ornaments
**must reference soul color tokens** — validation enforces presence of
the `accent` field for any preset that has a tinted variant.

### Framed screenshot (Step 4)

Refinement to existing `ImageNodeSchema`:

```ts
ImageNodeSchema.extend({
  frame: z.enum(['none', 'browser', 'phone', 'desktop', 'laptop']).optional(),
  // existing: caption, alt, fit
});
```

Frame chrome is generated by a new `frame-renderer.ts`:
- `browser` — title-bar with traffic-light dots + URL placeholder
- `phone` — rounded-corner device frame, status bar, home indicator
- `desktop` — generic monitor stand
- `laptop` — laptop bezel

Frames are pure CSS + a small inline SVG for device-shape paths (no
extra raster assets). The asset image fits inside the frame's
content area; frame chrome sits in `::before` / `::after`
pseudo-elements when possible to avoid extra IR nodes.

For the editable PPTX path, the framed image becomes a single native
`<p:pic>` (the asset PNG) plus per-frame chrome shapes (rounded-rect
border for browser, etc.). `html-slide-document-compiler` walker handles
this: when it sees a `pengui-frame-{kind}` wrapper, it emits the chrome
rects + image as native shapes, no hybrid fallback.

### Bleed support (Step 5)

CSS — slide root gains a `overflow: visible` class when ANY decoration
on the slide uses a `bleed_*` anchor. Bleed offsets are negative inset
values from the canvas edge — e.g. `bleed_left` with `offset: { x: 240, y: 0 }`
means "draw 240px past the left canvas edge."

PPTX path: Editable PPTX coordinates are EMU-based and clip at slide
boundaries by default. Bleed shapes need `<a:off x="-X">` (negative
offsets) — PowerPoint accepts these and renders the partial shape
within the slide. Scale: 1 px ≈ 9525 EMU.

Static (image) PPTX is naturally bleed-correct — Playwright renders
the whole canvas including overflow, the resulting PNG is what gets
embedded. No extra work needed for the rasterised path.

### Validation

New Stage-1 lint rules (`src/domain/validation/stage1/decoration-rules.ts`):

| Rule | Severity | Message |
|---|---|---|
| `decoration-text-content` | error | "Decoration nodes cannot carry text. Use a separate text node and place it manually." |
| `decoration-bleed-coverage` | warning | "Bleed decoration extends past the slide edge by >25% — large bleeds may print or export oddly." |
| `decoration-preset-missing-accent` | warning | "Preset `${name}` is tinted; provide `accent` or it falls back to muted." |
| `decoration-asset-not-found` | error | "Decoration references unknown asset_id `${id}`." |
| `image-frame-missing-asset` | error | (existing image rules apply; frame validation is opportunistic) |

Per-issue export errors via the existing v4.7 validation pipeline
(`validate_deck_for_export`) — bleed warnings don't block export, but
asset-not-found does.

### CURRENT_COMPILER_REVISION 12 → 13

`SlideDocument` shape inventory grows to include:
- decoration shapes (background-layer = behind body, foreground-layer =
  above body, with an explicit z-index ordering field)
- frame chrome shapes (browser title bar, phone bezel)
- bleed-positioned shapes (negative offsets allowed)

Cached docs at rev 12 don't carry decoration / frame metadata — must
recompile on next export.

## E2E

`scripts/e2e-v416-decoration.mts`:

1. **Reference reproduction A — bleed mark cover.** Build a single-slide
   deck with a hero text + a `decoration` node referencing the
   `glow_ring` preset, anchor `bleed_top_right`, layer `background`,
   accent `accent_primary`. Output: PDF + image PPTX + editable PPTX.
   Assert: editable PPTX has the decoration as a native `<p:pic>` (or
   shape group) with negative `<a:off>` coordinates.

2. **Reference reproduction B — Galici slide 3 (shield + glow rings).**
   Two-card layout with a centered icon and two stacked `glow_ring`
   decorations at increasing size. Assert: the rings render in
   foreground layer above the icon.

3. **Framed screenshot.** Image node with `frame: 'browser'` + upload a
   small PNG asset. Assert: editable PPTX has 5 native shapes — the
   image + 4 chrome rects (title bar + URL bar + traffic lights + body
   border).

4. **Asset library categorisation.** Upload one asset of each new role,
   assert the App-side `list_assets({ role: 'illustration' })` filter
   returns only the illustration, and the agent-facing
   `decoration_preset_catalog()` returns 6 entries.

5. **Validation.** Build a slide with a decoration that references an
   unknown asset_id; assert `validate_deck_for_export` blocks with
   `decoration-asset-not-found`.

Structural assertions on the editable PPTX:
- Bleed shapes have negative `<a:off x>` or `<a:off y>` values
- Frame chrome shapes ship as native `<p:sp>` (no hybrid fallback)
- decoration with layer=background renders BEFORE body shapes in the
  z-order

## Risks

1. **PPTX bleed coordinates.** PowerPoint accepts negative `<a:off>`
   per the OOXML spec but some old PowerPoint versions clip silently.
   Mitigation: ship a unit test fixture that opens cleanly in
   PowerPoint 2019+ and Keynote; document the known floor (PowerPoint
   2016 may ignore bleeds — that's acceptable, the older audience is
   small).

2. **Asset library scope creep.** Per the master plan: keep it minimal.
   Upload, list, reference. NO asset editor, NO AI generation, NO
   automatic background removal. The asset domain already has 90% of
   what's needed; we widen the role enum and add filtering to existing
   list calls — that's it.

3. **Framed image complexity.** The frame chrome (browser, phone, etc.)
   could grow into its own design system. Mitigation: ship 4 frames as
   declarative CSS + minimal SVG, no per-frame styling knobs in v4.16.
   Agents pick a frame, frame ships as-is. Customisation is a v4.18
   concern.

4. **Decoration vs background image collision.** Slide already has
   `background: 'image'` semantics. A decoration with layer=background
   and a slide background image both compete for z-order. Rule: slide
   background paints first (z-index 0), decoration background-layer
   second (z-index 1), body content third (z-index 10), decoration
   foreground-layer last (z-index 100). Document in the IR resource
   guide so agents reason about it.

5. **Preset ornament SVG bytes.** Inline SVG keeps it simple but six
   presets × ~2 KB each = 12 KB added to every slide HTML that uses an
   ornament. Acceptable. Bigger ornaments (high-res grids, complex
   noise overlays) get cut from the curated set.

## What's deferred

- **Asset transformations** (crop, rotate, recolor at upload time) —
  v4.18+. v4.16 ships pristine assets only.
- **Custom frame chrome** — only ship the 4 device frames listed.
- **Decoration animation** — out of scope per the no-motion principle.
- **Per-decoration soul recipes** — agents pick decorations contextually;
  recipes (`hero-with-bleed-mark`, `prototype-showcase`,
  `subject-with-glow-ring`) ship in v4.16, but parameterisable
  decoration recipes wait for v4.17.

## Exit criteria

Per the master plan: of the 17 Galici slides, **at least 13** are
reproducible at ≥85% visual similarity once v4.16 ships. The remaining
4 are the flow / table-heavy slides — those are v4.17's territory.

In code terms:
- All 5 E2E test cases above pass
- 1252+ unit tests still green (no regressions)
- `tsc --noEmit` clean
- App renders decoration nodes + frames in the editor canvas
- Asset upload UI accepts the 4 new roles
- v4.16 reference deck (PM Top Concerns cover + Galici slide 3) ships
  in `output/real_life_examples/_pengui_reproductions/` for boss
  comparison
