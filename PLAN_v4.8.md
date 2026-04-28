# v4.8 plan — "Document path, first-class"

One theme: bring the document/PDF path up to the same fidelity bar that v4.7 brought to slides/PPTX. Two sub-tracks, both load-bearing for the same outcome:

A. **Pagination repair** — fix what an agent-authored deck visibly breaks today (blank pages, two-column splits, table shears, awkward closings).
B. **Mode-specific IR nodes** — `toc`, `section_divider`, `bibliography`, `page_break`, plus the bimodal layout primitive `grid`. The four mode-specific ones are inherently document- or slide-only and unblock authors from reaching today's section-kind features through the IR. `grid` rides along because it doubles as a pagination-repair tool: alignment grids (image rows, country cards, metric strips) are exactly what's shearing across pages in the bug screenshots, and `two_column` is a special case of it.

Both sub-tracks converge on the same theme; bundling them honors the "one theme per release" rule (memory: `project_roadmap_to_50.md`) while making the catalog progress on schedule (memory: the v4.5→5.0 phasing image — v4.8 = mode-specific).

Total scope: 5 nodes + ~5 compositor fixes. Not bigger than 4.7.

### Bimodal contract (load-bearing constraint for this release)

Per user instruction: **every IR node that works in BOTH modes (slide and doc) must export cleanly to PPTX**, not just to PDF. That means each bimodal node needs three rendering paths verified end-to-end:

1. **Doc/PDF path**: section-html-compiler → DocumentComposer → Playwright `print()`.
2. **Slide preview path**: slide-ir-compiler → HTML → editor preview (pure HTML, no work needed if CSS is set up).
3. **Slide editable PPTX path**: slide-ir-compiler → HTML → `HtmlSlideDocumentCompiler` → `DocumentExportPlanner` → `EditablePptxExporter`. **This is the one that's easy to forget** — see v4.7 where mixed-content text leaves and table cells silently fell to background fallback for a full release cycle before being caught.

Each bimodal node added in this release MUST have:
- An e2e check in `scripts/e2e-section-flow.mjs` that round-trips through `add_slide` + `export_pptx` and asserts the resulting PPTX has the expected native shape kind (not `usedBackgroundFallback: true`).
- A unit test in `tests/unit/domain/documents/slide-document-service.test.ts` asserting the SlideDocument compilation classifies the node's compiled HTML as `native`.

Mode-specific (slide-only / doc-only) nodes are exempt from the PPTX path — they're rejected at Stage 1 lint when used in the wrong mode.

---

## Part A — Pagination repair (compositor fixes)

### Investigation: the blank-page bug

Reproduced on deck `745d1c63-9e4d-4d8d-a3a7-e0cb230404c9`. The deck's first sections are:

| # | kind             | breakHints                       | full-page |
|---|------------------|----------------------------------|-----------|
| 1 | cover            | `{breakAfter: 'page', fullPage}` | true      |
| 2 | toc              | `{breakAfter: 'page'}`           | false     |
| 3 | chapter_header   | `{}`                             | true      |
| 4 | prose            | `{}`                             | false     |
| 5 | chapter_header   | `{}`                             | true      |

Two CSS rules collide:

1. `document-composer.ts:190` — `chapter_header` defaults to `breakBefore: 'page'`.
2. `document-composer.ts:597` — every `data-full-page="true"` section gets `break-after: page`.

So between sections 2 and 3:
- `toc` ends with `break-after: page` → break.
- `chapter_header` declares `break-before: page` → break.

Per CSS spec these should collapse, but Chromium's `print` pipeline emits both. **Result: a fully blank page between toc and chapter 1.** Same pattern between every consecutive full-page pair (cover→toc, prose→chapter, chapter→chapter when prose runs short).

There's no diagnostic difference between "I want two breaks" and "two adjacent rules incidentally produce two breaks", so the redundancy is silent.

### Fix 1 — suppress redundant page breaks (compositor)

In `DocumentComposer.compose()`, after building `plans[]`, do a second pass that tracks the previous plan's effective `breakAfter`:

```ts
let prevEndsWithPageBreak = false;
for (const plan of plans) {
  const explicitBefore = plan.section.breakHints.breakBefore;
  if (explicitBefore === 'page' && prevEndsWithPageBreak) {
    // Authoring-time override always respected.
  } else if (explicitBefore === undefined && prevEndsWithPageBreak && plan.kind === 'chapter_header') {
    // Default break-before suppressed — the previous section already broke.
    plan.suppressBreakBefore = true;
  }
  prevEndsWithPageBreak =
    plan.section.breakHints.breakAfter === 'page' || plan.fullPage;
}
```

Then in `buildBreakInlineStyle`, honor `plan.suppressBreakBefore`. Net effect: only ONE break between two adjacent full-page sections. No blank page.

**Why this scope, not "drop break-before on chapter_header entirely":** if a chapter_header follows a regular prose section that doesn't end with break-after, we still want a forced break.

### Fix 2 — `break-inside: avoid` on `two_column` and `grid`

`two_column` is currently free to split. The Ethiopia/Colombia/Yemen/Guatemala screenshot is a 2x2 country grid where columns broke across pages awkwardly. Add to universal print rules in `document-composer.ts`:

```css
.pengui-two-column,
.pengui-grid {
  break-inside: avoid;
  page-break-inside: avoid;
}
```

**Tradeoff:** very tall two-column blocks (longer than one page) will now overflow rather than split — they'll get pushed onto a new page that may have unused space above. In practice, IR-authored two-columns tend to be card-pair comparisons that comfortably fit. Accept the tradeoff; long-form columnar text isn't a current pattern.

If we hit a real "too tall to keep together" case, escape hatch: agent sets `break_hints.keepTogether: false` on the wrapping section, OR splits into two adjacent two-columns. Document this in the v4.8 release notes.

### Fix 3 — `break-inside: avoid` on table rows + caption/header pair

Already present at row level (`tr { break-inside: avoid }`). Add: keep the table caption and the first header row together, so a table doesn't orphan its caption on a previous page:

```css
.pengui-table-caption + table thead { break-before: avoid; }
caption { break-after: avoid; }
```

### Fix 4 — drop `:last-of-type` workaround once Fix 1 lands

The current `data-full-page="true":last-of-type { break-after: auto }` rule was a workaround for "trailing blank page" symptoms. With Fix 1, chains of full-page sections produce no extra blanks; verify the workaround is no longer needed and remove it (smaller surface = fewer surprises).

### Fix 5 — page-break diagnostics in `validate_document_for_export`

When we ship `validate_document_for_export` (the doc-path counterpart to `validate_deck_for_export`), include a "pagination preview" warning when the rendered document has any blank page (detect by rendering page count vs. content count). Surface as a Stage 2 issue. **Stretch goal**, not blocking.

---

## Part B — Mode-specific IR nodes

The roadmap image schedules these for v4.8: **toc, section_divider, bibliography, page_break**. Three of the four already exist as `SectionKind`s but not as IR nodes. The asymmetry is awkward: agents have to mix `add_section { kind: 'toc' }` with `add_section { kind: 'prose', section_ir }` when authoring a doc.

### Node 1 — `toc`

```ts
type TocNode = {
  type: 'toc';
  title?: RichText;        // default "Contents"
  include_kinds?: SectionKind[];  // default ['chapter_header']
  max_depth?: number;      // default 1
};
```

Renders to the existing `pengui-toc` markup that the composer already understands. Compiler resolves entries at compose time (same path as the section-kind 'toc'). Mode constraint: rejects when slide-mode (Stage 1 lint).

### Node 2 — `section_divider`

```ts
type SectionDividerNode = {
  type: 'section_divider';
  label?: RichText;        // optional small chapter label
  ornament?: 'rule' | 'dot' | 'none';
};
```

Slide-only, full-bleed chapter break. Mode constraint: rejects when document-mode. (Document mode uses `chapter_header` section kinds for chapter breaks.)

### Node 3 — `bibliography`

```ts
type BibliographyNode = {
  type: 'bibliography';
  title?: RichText;        // default "References"
  entries: Array<{
    id?: string;           // for inline citation refs (future)
    text: RichText;        // freeform; structured CSL is a future v5 thing
  }>;
};
```

Doc-only. Renders as a styled `<ol class="pengui-bibliography">`. Mode constraint: rejects when slide-mode.

### Node 4 — `page_break`

```ts
type PageBreakNode = { type: 'page_break' };
```

Doc-only. Renders to a zero-height element with `break-after: page`. Lets the agent force a break mid-section without splitting into two sections.

Use case from this conversation's screenshots: "the closure feels like it wants to be alone, as closing a book". An agent emits `[..., page_break, quote, divider, prose("closing line")]` and the closing block lands on its own page.

### Node 5 — `grid` (bimodal — slide AND doc)

```ts
type GridNode = {
  type: 'grid';
  columns: 2 | 3 | 4;          // N-column count; 2 covers two_column's 1:1 case
  ratio?: string;              // optional weighted ratios — '1:1', '1:2', '2:1', '1:1:1', '2:1:1', etc.
                               // length must match `columns` when set; defaults to even
  gap?: 'sm' | 'md' | 'lg';
  align_items?: 'start' | 'center' | 'stretch';
  cells: LeafSlideNode[][];    // one array per cell; outer length must equal columns × rows
};
```

Generalizes `two_column` to N columns. Single primitive for three-column comparisons, four-up image rows, metric strips, country-card grids — exactly the shapes the v4.7 PDF export was shearing across pages.

**Renders to:**
```html
<div class="pengui-grid pengui-grid-cols-3 pengui-gap-md">
  <div class="pengui-grid-cell">…</div>
  <div class="pengui-grid-cell">…</div>
  …
</div>
```

CSS: `display: grid; grid-template-columns: repeat(N, 1fr)` (or weighted from `ratio`); `break-inside: avoid` from Fix 2 in Part A.

**Bimodal: must work for PPTX too.** Slide-mode grid:
- Each cell's content compiles to the same node leaves as anywhere else.
- The grid wrapper has no visual chrome (no bg, no border) → drops in the SlideDocument compile (same as `two_column`).
- Each leaf-child renders at its absolute pixel rect captured from `getBoundingClientRect()` — i.e. cells naturally lay out side-by-side because the DOM positioned them. No special PPTX path needed.
- The `pengui-grid-cell` flex/grid columns inherit `min-width: 0` to match `two_column`'s inner-wrapper rule (so text wraps and doesn't push siblings).

**Backwards compatibility for `two_column`:** keep `two_column` accepting the old shape (deprecate in v5.0, not v4.8). Internally we could compile `two_column` → equivalent `grid` and share renderers, but that's a refactor we should defer; cohabit for now.

**Edge case to verify before shipping:** PPTX export of a 3-column grid where one cell is taller than the others. The DOM bounding rects place each cell's content at the height it actually occupies; in PPTX this looks "ragged-bottom" rather than visually equal-bottom. That mirrors how `two_column` renders today and is consistent with the IR-first contract — no special-case fix needed in v4.8, but document it in the release notes.

### Schema + tooling additions

For each node:
- Add to `nodes.ts` discriminated union (`toc`, `section_divider`, `bibliography`, `page_break` are top-level only; `grid` is also top-level — its cells take `LeafSlideNodeSchema` to match `two_column`'s recursion-prevention).
- Add renderer to `node-renderers.ts`.
- Add CSS to `layout-css.ts` (`.pengui-toc`, `.pengui-section-divider`, `.pengui-bibliography`, `.pengui-page-break`, `.pengui-grid` + `.pengui-grid-cols-{N}` + `.pengui-grid-cell`).
- Stage 1 mode-check: lint rejects mode-incorrect placement.
- Update `pengui://schema/slide-ir` resource + the cheatsheet in tool descriptions.
- Bump `CURRENT_COMPILER_REVISION` (memory: `feedback_compiler_revision_bump.md`) since the node catalog widens — `grid` in particular changes the SlideDocument element graph for any deck that uses it.

---

## Convergence / housekeeping (optional, in-scope if time permits)

- **Make `validate_section_ir` mode-aware**. Currently it accepts any IR node regardless of authoring_model. With mode-specific nodes landing, lint must enforce slide-only / doc-only.
- **Document-mode prompt update** — describe when to reach for `page_break` vs. `chapter_header`-section vs. `section_divider`.

---

## Acceptance criteria

1. **Re-export deck `745d1c63-9e4d-4d8d-a3a7-e0cb230404c9` to PDF**: no blank-only page anywhere; two-column country cards stay together; tables don't shear cell-borders across pages; page count drops by ~3-5 (the eliminated blanks).
2. **Authoring**: agent can pass `{type: 'toc'}` / `{type: 'page_break'}` / `{type: 'bibliography'}` / `{type: 'section_divider'}` / `{type: 'grid', columns: 3, …}` and they round-trip through compile + validate + export.
3. **Lint**: slide IR with `bibliography`/`toc`/`page_break` is rejected at Stage 1; document IR with `section_divider` is rejected at Stage 1; `grid` accepted in both modes.
4. **PPTX bimodal verification (the constraint that bit us in v4.7):** an `add_slide` carrying a 3-column `grid` exports through `export_pptx` with `mode: 'native_only'` (zero bg-image fallback) and produces N native shape elements per cell, not a single rasterized chunk. Asserted by an e2e check.
5. **Tests**: per-node unit (one each), at least one e2e check exercising a doc with toc + page_break + bibliography, plus the bimodal grid PPTX check.
6. **957 → ~967 unit tests pass; e2e green.**

## Out of scope (defer)

- `figure`, `code`, `metric`, `metric_grid` — these were nominally v4.6/v4.7 catalog items but didn't ship. Hold for v4.9 alongside `chart`/`raw_html` heavyweights, OR slot piecemeal into 4.8.x patches if a release is asked for. Don't expand 4.8 scope for them. (`grid` was originally on this defer-list; it's promoted into v4.8 because it doubles as a pagination-repair tool.)
- `validate_document_for_export` MCP tool — still on the candidate list (memory: `project_roadmap_to_50.md`); slot it as a v4.9 standalone or a 4.8 stretch if Part A finishes early.
- Markdown compile tool (memory: `project_markdown_plan.md`) — explicitly v4.8+ deferred.
