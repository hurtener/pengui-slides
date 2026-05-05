# Phased plan — closing the design-team-quality gap

Reference benchmarks: `output/real_life_examples/Propuesta Galici - PPT.pdf`
(17-slide commercial proposal, dark navy, dual-brand) and
`output/real_life_examples/Project_Management_Top_Concerns new 1.pptx`
(serif/dark, bleed-off "C" mark on cover).

## Reality check first (saves a release)

Two of the seven items from the gap analysis are **already shipped at the
engine level** — verified in code today:

| Item | Status | What's actually missing |
|---|---|---|
| **#2 Inline color emphasis** | Schema + compiler done. `TextRun.color` enum (`accent / accent_alt / accent_warm / success / warning / error / info / muted / inverse`) compiles to `<span class="pengui-text-*">` at `src/domain/ir/compile/rich-text-renderer.ts:46`. | Agents don't use it. Pure prompt/recipe surfacing work — half a day. |
| **#7 Soul-themed chart palette** | Built. `src/domain/souls/chart-theme-bridge.ts` derives the full ECharts theme from soul tokens, including the 8-color category rotation, then post-passes hex→`var(--color-*)`. | The pastel feel of the v4.12 E2E PDF is the soul's accent, not a missing feature. Validate with a punchier soul; if it lands, ship as "shown working." |

So the real engineering plan is five items, not seven.

## Cross-cutting principles (apply to every phase)

1. **MCP-App-primary.** Every IR change ships with App rendering + editing
   in the same release. No "engine first, App later."
2. **Bump `CURRENT_COMPILER_REVISION`** in every release that changes
   `SlideDocument` output, or the cache will mask the change in exports.
3. **One reference deck per release** — re-render Galici-style as the test
   artifact. If the slide doesn't get visibly closer, the release didn't land.
4. **Validation rules ship with the IR.** Each new node/field gets Stage-1
   lint + per-issue export errors via the v4.7 validation pipeline.
5. **Recipes regenerate** — the soul recipe set has to grow alongside the
   schema, otherwise agents won't discover the new primitives.
6. **Slides + Print parity from day one** for shared primitives;
   mode-restrict only when there's a real reason.

---

## Phase 0 — v4.13 "Polish primitives" (~1 short release)

**Goal:** ship visible quality lift without new IR concepts. Lowest risk,
highest perception-per-effort.

**Scope:**
- **Surface inline color emphasis (#2)** in agent prompts, recipes, and
  `apply_node_edit` examples. Add a "use color emphasis sparingly for
  keywords" guidance line to the IR-first authoring resource. Add 2–3
  recipes that demonstrate it.
- **Validate + demo soul-themed charts (#7)** — re-run the v4.12 E2E
  against the LG Ad Solutions and Cozy Premium souls, check the post-pass
  var swap is firing in the SVG (`grep var(--color-category-` in exported
  PPTX media). If anything's broken, fix; otherwise document and move on.
- **Per-card accent + icon slot (#4 — small variant).** Extend `GridNode`
  items and `TwoColumnNode` columns with optional `accent: TextColor` and
  `icon: string` (lucide icon name from a curated allowlist). Compiles to
  a top-border tinted to the accent and a small icon glyph above the
  heading. No image assets — lucide is SVG-inline. **Schema work: ~80 LOC
  + recipe + compiler hooks.**

**Deliverables:**
- New recipes: `grid-accented-cards`, `two-column-accented`
- Galici slide-7 re-render side-by-side with original
- App: card editor sidebar gains accent color picker + icon picker

**Exit criteria:** the "Cinco desafíos críticos" slide from Galici (6 cards
with semantic colored borders + icons) renders within 80% visual similarity
using only IR + soul tokens.

**Risk:** low. Lucide allowlist needs a small policy decision — pick ~50
icons to ship.

---

## Phase 1 — v4.14 "Slide chrome" (~1 release, the biggest visual lever)

**Goal:** persistent header/footer regions that render on every slide.
This single release transforms perceived quality more than any other.

**Scope:**
- New IR concept: **`DeckChrome`** — a deck-level field, not a slide-level
  one. Shape:
  ```
  chrome: {
    header?: ChromeRegion,    // top edge, full width
    footer?: ChromeRegion,    // bottom edge, full width
    showOnCover?: boolean,    // default false
    showOnSectionDividers?: boolean
  }
  ChromeRegion: {
    left?: ChromeSlot, center?: ChromeSlot, right?: ChromeSlot
  }
  ChromeSlot:
    | { kind: 'logo', assetId: string, height?: 'sm'|'md'|'lg' }
    | { kind: 'page_number', format?: '1' | '1/N' | '01' }
    | { kind: 'text', content: RichText }
    | { kind: 'section_badge', source: 'auto' | RichText }  // auto pulls from nearest preceding section_divider
  ```
- New tool: `set_deck_chrome` (and App-side editor in the deck settings panel).
- Per-slide override: `slide.chromeOverride: 'inherit' | 'hide' | { ... }`
  for cover/section pages.
- Compiler: `slide-html-compiler.ts` wraps the slide body with
  `<header class="pengui-chrome-header">…</header>` and
  `<footer class="pengui-chrome-footer">…</footer>`, positioned via the
  soul's chrome dimension tokens (new layer in the soul, see below).
- Soul extension: small new soul layer **`chromeStyle`** with token-driven
  height, padding, divider opacity, and badge pill shape. Doesn't break
  existing souls (defaulted).
- Validation: chrome regions can't overlap body content (lint warning if
  header/footer height exceeds 12% combined).

**Deliverables:**
- Galici-style dual-logo header on every slide
- Section badge that auto-derives from `section_divider` content
- App: deck-settings panel with chrome editor; slide-level "show chrome"
  toggle in slide sidebar

**Exit criteria:** Galici slides 2–17 all show the dual-brand logo chrome
+ section badge pill *without per-slide IR repetition*. Chrome edits
propagate live in App.

**Risk:** medium. Two real ones:
- **PPTX export:** PPTX has slide-master support; we should map deck
  chrome to a PPTX slide master, not duplicate shapes per slide. Allocate
  a sub-task for the PPTX exporter to learn slide masters.
- **Cover/section behavior:** need clear default rules for when chrome
  shows. The `showOnCover` / `chromeOverride` knobs cover this but need
  a UX pass.

---

## Phase 2 — v4.15 "Premium fonts" (~1 release, mostly infra)

**Goal:** decks render in real typefaces, not system fallbacks. Without
this, every output reads as "AI-generated" no matter how good the layout is.

**Scope:**
- **Font registry** in soul service — `soul.typography.fontBody` becomes
  `{ family, source, license }` where `source` is one of
  `system | google_fonts | bundled`.
- **Bundled font loader**: a curated set of OFL-licensed fonts (Inter,
  Inter Display, Source Serif, Lora, JetBrains Mono, Manrope, Space
  Grotesk — pick ~8 covering serif/sans/mono/display). Stored as WOFF2
  in `assets/fonts/`. Loaded into the Playwright render context via a
  stylesheet; embedded into PPTX via the OOXML `embeddedFont` mechanism;
  embedded into PDF via Playwright's default behavior (already correct).
- **Google Fonts proxy** for souls that name a Google font — resolved at
  soul-approve time, cached locally so renders don't hit the network.
- **License manifest** in `assets/fonts/LICENSES.md` — the boss
  conversation: who can ship which font.
- New tool: `list_available_fonts` for the agent + App font picker.
- Soul editor (App) gains a font picker that surfaces only licensed fonts.

**Deliverables:**
- Galici PPTX with embedded Inter / Inter Display, opens in PowerPoint
  without font substitution
- Coffee Brewing rebuilt with Source Serif as the running serif

**Exit criteria:** PPTX export passes "PowerPoint shows no font
substitution warning" check with at least 3 different bundled fonts.

**Risk:** medium-high on PPTX font embedding (OOXML embedded fonts is
finicky and license-sensitive); medium on bundle size. Worth a 2-day
spike before committing.

---

## Phase 3 — v4.16 "Decoration & assets" (~1 release, the biggest scope)

**Goal:** custom illustrations, ornaments, framed screenshots, brand marks
bleeding off-canvas.

**Scope:**
- **Asset library** — extension to the existing `assets` domain.
  Categorize uploaded assets (`logo | illustration | screenshot | photo`).
  MCP-App upload only (per the standing constraint), not exposed to agent
  tools.
- **New IR node: `decoration`** — purely visual, doesn't carry data.
  Schema:
  ```
  { type: 'decoration',
    asset: { kind: 'asset_ref', assetId } | { kind: 'preset', name: 'glow_ring'|'grid_dots'|... },
    placement: { anchor: 'top_left'|...|'bleed_right'|...,
                 offset?: {x,y}, size?: {w,h}, rotation?, opacity? },
    layer: 'background' | 'foreground' }
  ```
- **Preset ornaments** — ship ~6 SVG primitives the agent can use without
  an asset upload: `glow_ring`, `grid_dots`, `radial_glow`,
  `corner_bracket`, `chevron_arrow`, `noise_overlay`.
- **Framed screenshot** — refinement to existing `image` node:
  `frame: 'none' | 'browser' | 'phone' | 'desktop' | 'laptop'` + optional
  `caption: RichText`. Renders the chrome around the asset (Galici's UI
  prototype slides).
- **Bleed support** — placement anchors `bleed_left/right/top/bottom` +
  new `overflow: 'visible'` on the slide root so the decoration extends
  past the canvas edge (the giant "C" device).
- **Validation** — decoration nodes can't carry text content; bleed
  warnings for important content; preset ornaments must reference soul
  color tokens.
- **Recipes** — `hero-with-bleed-mark`, `prototype-showcase`,
  `subject-with-glow-ring`.

**Deliverables:**
- PM Top Concerns cover (giant "C" bleed) reproducible in IR
- Galici slide 3 (shield with glow rings) reproducible from preset ornaments
- Galici slide 5 + 8 + 9 (UI prototype screenshots) reproducible with
  framed image node

**Exit criteria:** of the 17 Galici slides, at least 13 are reproducible
at ≥85% visual similarity. The remaining 4 are the flow + table-heavy
ones (Phase 4).

**Risk:** medium. Two real concerns:
- Bleed past the slide canvas needs PPTX shape positioning math (PPTX
  coordinates are top-left, EMU-based — already handled, but bleed
  extends those bounds).
- Asset library scope creep — keep it minimal: upload, list, reference.
  No asset editor, no AI generation.

---

## Phase 4 — v4.17 "Flow & connectors" (~1 release)

**Goal:** the pipeline/flow visualization on Galici slide 11 ("Backlog
Grooming → Sprint Planning → …").

**Scope:**
- **New IR node: `flow`** — sequence of steps with directional
  connectors. Schema:
  ```
  { type: 'flow',
    direction: 'horizontal' | 'vertical',
    steps: [{ label: RichText, accent?: TextColor, icon?: string, badge?: string }],
    connector: 'arrow' | 'arrow_dashed' | 'cycle' | 'plus' }
  ```
- Renderer outputs an SVG (so PPTX export gets an SVG group, PDF gets
  vector) with connector geometry computed from step layout.
- Validation: max ~7 steps before lint warning (visual density).
- App: flow editor with drag-to-reorder steps.
- Recipes: `flow-process`, `flow-cycle`, `flow-comparison`.

**Deliverables:** Galici slide 11 reproducible end-to-end.

**Exit criteria:** all 17 Galici slides expressible in IR.

**Risk:** low — well-scoped node type. The only judgment call is whether
"flow" subsumes "timeline" (probably yes, follow-up).

---

## What's deliberately NOT in this plan

- **Per-slide free-form positioning.** Tempting but corrosive — it erodes
  the IR-first contract and pushes us toward HTML-first authoring
  (WYSIWYG-compound filter rules this out).
- **AI illustration generation.** Out of scope; lean on uploaded assets +
  presets.
- **Animation / transitions.** Doesn't move quality on the static-export
  medium the team is benchmarking against.
- **Custom soul authoring UI.** Already exists; no extension needed for
  this gap.

---

## Timeline summary (realistic, with App work + reference-deck verification each phase)

| Phase | Release | Effort | Net visual gap closed |
|---|---|---|---|
| 0 | v4.13 | ~1 week | 15% |
| 1 | v4.14 | ~3 weeks | +35% (chrome is the single biggest lever) |
| 2 | v4.15 | ~2.5 weeks | +20% |
| 3 | v4.16 | ~4 weeks | +20% |
| 4 | v4.17 | ~1.5 weeks | +5% |

**Total:** ~12 weeks of focused work to where the Galici deck is ~95%
reproducible from IR. v4.14 is the "show the boss it's working" milestone
— chrome alone visibly transforms every slide.
