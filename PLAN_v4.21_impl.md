# v4.21 — implementation plan: architecture-diagram parity

**Goal:** close the visible gap between our v4.20 "Consolidated Semantic
Layer" rendering and the hand-authored target slide (Claude-made,
fully-editable PPT). The target is achievable with the existing v4.19/
v4.20 primitive surface — most of the gap is **layout structure** and
**IR content**, not missing primitives.

This is a parity release. No new IR node types unless Phase 3 surfaces
something genuinely missing. CURRENT_COMPILER_REVISION bumps only if a
SlideDocument change ships.

> **Tracking artifact** — the canonical slide for this release is
> `scripts/e2e-v420-architecture.mts` (output:
> `output/v420_architecture/consolidated-semantic-layer.html`). Every
> phase regenerates this file and visually compares vs. the target
> screenshot before moving on.

---

## Gap analysis (recap)

Ranked by visible impact, with the inferred root cause:

| # | Gap | Root cause |
|---|---|---|
| 1 | Right ~40% of canvas is empty | Main 3-col grid uses default 1:1:1; AI Platform card body is empty/invisible |
| 2 | Lakehouse + semantic are stacked, target is side-by-side | IR composes them as siblings in a column, not a `two_column` |
| 3 | BRONZE/SILVER/GOLD cards are wide+squat | Squeezed by parent column width; missing portrait styling and colored-dot anchor |
| 4 | TPE Sources looks like a generic card | Has card chrome (border + accent stripe); target is chrome-less with a database icon |
| 5 | AI Platform looks like a header pill with nothing beneath | Solid-fill card + icon-above-stacked agent layout collapses; needs row layout per agent |
| 6 | Arrows feel disconnected | TPE→catalog arrow placed outside the visual flow; lakehouse→semantic arrow missing |
| 7 | Master container header pill lacks brand mark | `sparkles` icon used; target is a red diamond Databricks brand glyph |
| 8 | Semantic schema rows read like tags, not a definition table | Chips with dots used; target is structured rows with bulleted left labels + right-side annotation |
| 9 | Workspaces strip lacks the italic governance annotation | Content gap |
| 10 | Bottom legend pills not visually separated from prose | Content gap; chip layout already supports it |

Items 1–3 alone close ~60% of perceived gap. Items 4–6 close another ~25%.

---

## Phase 0 — pre-flight (~30 min)

**Goal:** lock in a reproducible baseline, audit for schema bugs that may
already be silently mis-rendering.

- [ ] Run `npx tsx scripts/e2e-v420-architecture.mts` as-is. Open the
      emitted HTML and confirm it matches the user's "Image #1"
      reference.
- [ ] Audit the e2e script for IR-schema violations:
  - `icon: 'database'` — currently NOT in `IconNameSchema`
  - `icon: 'bell'` — NOT in `IconNameSchema`
  - `icon: 'file-text'` — NOT in `IconNameSchema`
  - any color-role references that fall outside `TextColorSchema` /
    `ColorRoleSchema`
  - heading levels above the bimodal allow-list
- [ ] Decide for each: add icon to allowlist (Phase 3) vs swap to a
      compatible existing icon. Do not blindly extend the allowlist —
      keep it curated.
- [ ] Save current output as `output/v420_architecture/baseline.html`
      so we can diff against future phases.

**Exit criteria:**
- Baseline HTML reproduces; no Stage-1 / Stage-2 errors logged.
- Audit list of IR fixes recorded inline below this plan.

---

## Phase 1 — layout structure (the big unlock)

**Goal:** stop wasting the right 40% of the canvas. Restructure
without introducing new primitives.

### Changes

1. **Main 3-col grid ratio.** Add `ratio: '2:7:4'` (or fine-tune) on the
   top-level grid so the TPE column is narrow, the catalog container
   is wide, and the right rail (AI + Reporting) is medium-wide.

2. **Lakehouse + semantic side-by-side inside the dashed container.**
   Replace the current stacked layout with a `two_column` (ratio
   `'2:1'` or `'3:2'`) inside the Databricks `card_section`:
   - left column: catalog: lakehouse card + Bronze/Silver/Gold grid
   - right column: catalog: semantic card with the schema rows
   - the workspaces strip becomes a full-width sibling BELOW that
     two_column inside the same card_section

3. **Right rail = vertical column.** Wrap AI Platform + Trusted
   Reporting in a single grid cell already (it is). Confirm the cell's
   children stack vertically with the right padding so AI Platform and
   Trusted Reporting are visually equal-weight cards rather than one
   filling and one collapsed.

4. **AI Platform: drop solid fill.** Switch `fill: 'solid'` →
   `fill: 'none'` and add `border_style: 'solid'`. The agents inside
   need a non-inverse text color, so the cascade swap won't eat the
   labels. Header pill stays — it sits on the card edge.

### Validation checkpoint

Regenerate, open HTML, side-by-side with target.

**Pass if:**
- The right rail is fully populated with two visible cards.
- The lakehouse and semantic catalog cards sit horizontally inside the
  dashed Databricks container.
- No section of the canvas (excluding intentional whitespace around
  arrows) is conspicuously empty.

**Fail-hand-off:** if a primitive is structurally insufficient (e.g.
`two_column` ratio doesn't accept a value we need, `card_section` body
doesn't accept the layout we want), document the missing primitive
inline and stop — discuss before extending the IR.

---

## Phase 2 — card shape and content refinements

**Goal:** make individual cards read like the target.

### Changes

1. **BRONZE / SILVER / GOLD portrait cards.**
   - Set the parent grid `align_items: 'stretch'` (already), and place
     each card with a tall body — promote the 3-line description from
     `prose` to a multi-line block by relying on natural width
     compression.
   - Add a small colored dot anchor: prepend a `chip` with `dot: true`,
     `tone: 'tint'`, `size: 'xs'`, label empty/single-letter — OR keep
     the existing accent and rely on `card.icon` filled with a circular
     glyph. Decide during implementation.
   - Strengthen the colored fill: `fill: 'tint'` already; check that
     the soul's `surfaceAlt` / accent tint is saturated enough.

2. **AI Platform agents as horizontal rows.**
   - Each agent becomes a `card` with `body_layout: 'row'`, holding:
     icon (via the existing card.icon slot), then a small inner
     `two_column`/`prose` block with the title and caption stacked
     vertically.
   - Three such cards stack vertically inside the AI Platform
     `card_section`. Goal: read as 3 horizontal rows, not 3 stacked
     mini-cards with icon-above.

3. **TPE Sources without card chrome.**
   - `border_style: 'none'`, `fill: 'none'`, keep `icon: 'database'`
     (or whatever Phase 0 settles on), `size: 'large'`.
   - Heading + prose stacked beneath the icon.

4. **Semantic schema rows as a definition table.**
   - Replace the 3 chips with a 3-row `grid` (columns: 2, ratio
     `'1:1'`) where each row has: left = bulleted label (chip with
     dot, label = "Views", "Materialized Views", "Metric Views"), right
     = annotation `prose` ("CERTIFIED", "PRECOMPUTED", "KPIS &
     GOVERNED METRICS") in muted small caps.
   - If this composition feels brittle, raise a new "definition_row"
     primitive proposal — but try the composition path first.

### Validation checkpoint

**Pass if:**
- Bronze/Silver/Gold visually read as portrait cards with a colored
  category anchor.
- Each AI Platform agent reads as a horizontal row.
- TPE Sources has no card outline; the database icon is the visual
  anchor.
- Semantic rows scan as a small structured table, not a chip bag.

---

## Phase 3 — finish and polish

**Goal:** remove the last reasons "this still looks like a wireframe
of the target."

### Changes

1. **Master container header pill — brand mark.**
   - Add a `databricks` (or `diamond`) entry to `IconNameSchema` and
     `icons.ts`. Use a stroked diamond glyph (lucide `gem` is close).
   - Set `header_pill.icon` accordingly.

2. **Arrow placement and labels.**
   - Add an inline `arrow` between the lakehouse and semantic
     sub-cards (inside the new two_column).
   - Keep "Reads from semantic.metrics" annotations on the arrows
     leaving each right-rail card.
   - Verify the TPE→catalog arrow is centered vertically against the
     catalog container, not floating in TPE's bottom whitespace.

3. **Workspaces annotation.**
   - Append a `prose` entry to the workspaces strip with text
     `"isolated per environment, governed by Unity Catalog"`, color
     muted, italic — needs a check that RichText supports italic
     (`bold` is documented in nodes.ts; italic should be the same
     channel).
   - Right-align inside the row.

4. **Bottom legend separation.**
   - Currently a single `card` with `body_layout: 'row'` mixing
     `prose` + 3 chips. Promote the chips into a right-aligned chip
     cluster: wrap the prose and the chip group in a `two_column`
     (ratio `'1:1'` or `'3:2'`) so they sit at opposite ends.

5. **AI Platform "External" chip.**
   - Add a tiny `chip` with `tone: 'outline'`, `size: 'xs'`,
     `label: [{ text: 'External' }]` next to the AI Platform header
     pill. The cleanest path is to put both inside a `two_column`
     header row above the agent cards (since `header_pill` itself is a
     single label).

### Validation checkpoint

**Pass if:**
- Diamond / brand mark visible in Databricks header pill.
- Lakehouse → semantic arrow lives inside the dashed container.
- Workspaces row carries the italic annotation.
- Bottom legend pills clearly separated from prose.
- AI Platform header carries the "External" chip.

---

## Out of scope for v4.21

- Real isometric / perspective database glyph (lucide stack is fine).
- Editable PPTX parity for any new icon — if `databricks` icon ships,
  bump `CURRENT_COMPILER_REVISION` and regenerate the SlideDocument
  shape inventory.
- New primitives beyond what falls out of Phase 2 / Phase 3
  validations. Anything bigger gets a v4.22 plan.

---

## Validation method (per phase)

1. Edit `scripts/e2e-v420-architecture.mts`.
2. Run `npx tsx scripts/e2e-v420-architecture.mts`.
3. Open `output/v420_architecture/consolidated-semantic-layer.html` in a
   browser; compare against the target screenshot.
4. If a phase's "Pass if" bullets all hold, commit and move on. If not,
   iterate within the phase before opening the next.

## Commit cadence

One commit per phase, with a `v4.21.<phase>` prefix:
- `v4.21.0`: pre-flight fixes (icon allowlist, schema audit)
- `v4.21.1`: layout restructure
- `v4.21.2`: card shape + content
- `v4.21.3`: polish

---

## Execution log (2026-05-07)

### Phase 0 — pre-flight (DONE)

Findings:
- 3 icons referenced by the e2e script were silently dropped at render
  time (renderer returns empty string for unknown names): `database`,
  `bell`, `file-text`. The IR had no Zod validation hop in the e2e
  path, so these never errored.
- HTML emit had no `<meta charset="utf-8">` — `·` characters and em-
  dashes rendered as Latin-1 mojibake (`Â·`, `â€"`, `â†'`).
- Latent v4.19 bug discovered: `card.fill: 'solid'` produced a
  white-on-white card. Cause: rule order in layout-css.ts. The
  inverse-text cascade selector reset `color` to white BEFORE
  `background: currentColor` was resolved, so background ended up
  white. Fixed by binding fill-solid background directly to the accent
  token via compound selectors per accent.

Files touched:
- `src/domain/ir/nodes.ts` — added `bell`, `database`, `globe`,
  `file-text`, `gem` to `IconNameSchema`.
- `src/domain/ir/compile/icons.ts` — added inline SVG paths for the 5
  new icons.
- `src/domain/ir/compile/layout-css.ts` — replaced
  `.pengui-card-fill-solid { background: currentColor }` with 9
  compound-selector rules (one per accent token).
- `src/domain/ir/compile/slide-html-compiler.ts` — added
  `<meta charset="utf-8">` to the emitted head.

### Phase 1 — layout structure (DONE)

Changes to `scripts/e2e-v420-architecture.mts`:
- Top-level grid: added `ratio: '2:7:5'` so TPE column is narrow,
  Databricks middle is wide, right rail is medium.
- Inside Databricks `card_section`: replaced the stacked
  lakehouse → BSG → semantic body with a `two_column` (later upgraded
  in Phase 3 to a 3-col grid with an arrow column in the middle).
- AI Platform: dropped `fill: 'solid'` so it becomes a white card
  with the navy header pill — matches Trusted Reporting visual
  weight.

Result: AI Platform body is no longer empty/invisible. Lakehouse and
semantic catalogs sit side-by-side. Right ~40% of canvas is fully
occupied.

### Phase 2 — card shape and content (DONE)

IR / schema changes:
- `CardNode.layout: 'vertical' | 'horizontal'` — new optional field;
  `'horizontal'` puts icon to the LEFT of the body (icon column +
  body column) for AI Platform agent rows. Body keeps its own
  direction (default column) so title/caption still stack vertically
  beside the icon.
- TPE Sources: added `border_style: 'none'` (chrome-less).
- AI Platform agents: added `layout: 'horizontal'` to each.
- Semantic schema rows: replaced 3 chips with a 2-col 3:2 grid of
  `[chip-with-dot, prose right-aligned annotation]` per row, giving
  a definition-table look.

Files touched:
- `src/domain/ir/nodes.ts` — added `layout` field to CardNode.
- `src/domain/ir/compile/node-renderers.ts` — emit
  `pengui-card-layout-horizontal` class.
- `src/domain/ir/compile/layout-css.ts` — CSS for
  `.pengui-card-layout-horizontal`.

### Phase 3 — finish and polish (DONE)

- Databricks header pill now uses `icon: 'gem'` (red diamond glyph,
  brand-mark proxy).
- Lakehouse → semantic arrow placed inline inside the dashed
  container via a 3-col grid with ratio `'7:1:5'`.
- Workspaces strip: appended right-aligned italic annotation
  "isolated per environment, governed by Unity Catalog" using
  RichText.italic.
- Bottom legend: split into a `two_column` so prose stays left and
  the 3 chips (Delta / Unity Catalog / Agents) cluster right-aligned.

Skipped / out-of-scope:
- AI Platform "External" chip beside the header pill — small finesse,
  not load-bearing on the parity goal. Defer if needed.
- Aggressively-portrait Bronze/Silver/Gold cards — current render is
  proportional to content; would require min-height tweak. Defer.

## Outcome

The "Consolidated Semantic Layer" reference slide now matches the
target end-to-end at the structural level:
- TPE Sources chrome-less with database icon ✓
- 3-col main canvas with proper ratio ✓
- Lakehouse + arrow + Semantic side-by-side inside dashed Databricks
  container ✓
- Definition-table semantic rows ✓
- Workspaces strip with italic governance annotation ✓
- AI Platform white card with 3 horizontal agent rows ✓
- Trusted Reporting beneath AI Platform on the right rail ✓
- Bottom legend split (prose left, chip cluster right) ✓
- Bug fixes that cascade beyond this slide:
  - `card.fill: 'solid'` now actually fills (latent v4.19 bug).
  - All emitted HTML now has `<meta charset="utf-8">`.
  - Icon allowlist now includes the architecture-diagram-friendly
    set (`database`, `bell`, `file-text`, `globe`, `gem`).

Outputs:
- `output/v420_architecture/consolidated-semantic-layer.html`
- `output/v420_architecture/v420_Consolidated_Semantic_Layer.pdf`
- `output/v420_architecture/v420_Consolidated_Semantic_Layer.pptx`
- `output/v420_architecture/v420_Consolidated_Semantic_Layer_Editable.pptx`
