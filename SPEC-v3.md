# SPEC v3 — Continuous-Document PDF Mode

**Status:** draft — execution in progress
**Predecessor:** `SPEC.md` (v1, slides_16_9) and Print Mode v2.0 (slide-per-page print)
**Replaces:** Print Mode v2.0 pipeline (legacy page-bound print decks)

---

## 1. Why v3

Print Mode v2.0 treated PDF decks the same as 16:9 slides: the model authors N independent `.slide` HTML documents, each sized to exactly 1 page, and the exporter concatenates them with `page-break-after: always`. That model is structurally wrong for printed material:

- A PDF is a **continuous document**, not a sequence of page-sized boxes. Chapters flow; a table that's too tall splits across pages; a figure stays whole.
- Page-bound authoring forces the model to pre-chunk content into page-sized units before it's seen a pagination engine. Even a capable model (Opus 4.7) wastes turns fighting the page box — measuring paragraphs, trimming lines, shrinking figures — instead of writing good content.
- Every small edit shifts page boundaries in ways the model can't predict, which re-triggers fits/overflow churn.
- Legitimate print primitives (table with repeating header, figure caption, running header with page numbers) have no natural home in the slide-per-page model.

v3 shifts print decks to a **continuous document** authoring model:

- The author writes **sections** (content blocks), not **slides** (page containers).
- The exporter composes all sections into one flowing HTML document and lets Chromium's paginator decide page boundaries.
- Universal CSS break rules (`break-inside: avoid` on figures/charts/diagrams, `break-inside: auto` on tables with repeating headers, orphan/widow hints on paragraphs) are emitted centrally by the composer — not left for each section's author.
- Page chrome (running title, page numbers) uses Chromium's native `position: fixed` + `counter(page)` mechanics instead of per-slide HTML chrome.
- Slide mode (`slides_16_9`) is untouched.

---

## 2. Core model

### 2.1 `authoringModel` on `Deck`

New required field on `Deck`:

```ts
type AuthoringModel = 'slides' | 'document';

interface Deck {
  // ... existing fields
  authoringModel: AuthoringModel;
  sectionIds: SectionId[];   // parallel to slideIds
  documentMeta?: DocumentMeta;
}
```

Derivation:

- `format === 'slides_16_9'` ⇒ `authoringModel = 'slides'`
- `format === 'print_a4_portrait' | 'print_letter_portrait'` ⇒ `authoringModel = 'document'`

The field is the hard discriminant the service layer and MCP tools use. `deck.format` alone isn't enough — we may introduce more formats later, but the authoring pipeline fork is binary.

Legacy decks with no `authoringModel` on disk are read as `'slides'` (they predate the split; none of them are print decks on the fleet we support).

### 2.2 `Section` entity

A section is an **HTML fragment** (not a full document) that lives in a continuous document. Each section has a **kind** that drives break defaults and validation.

```ts
type SectionKind =
  | 'cover'            // full-page hero, break-after: page
  | 'chapter_header'   // full-page break, may reset page counter
  | 'toc'              // auto-generated if fragment is empty
  | 'prose'            // flowing paragraphs, may split
  | 'figure'           // inline SVG/raster figure with caption; keep whole
  | 'chart'            // SVG chart with axes; keep whole
  | 'diagram'          // mind-map/tree/flow diagram; keep whole
  | 'table'            // <table>, splits; <thead> repeats
  | 'callout'          // boxed note/tip; keep whole
  | 'comparison'       // two-column A/B block
  | 'glossary'         // dl list, may split
  | 'bibliography'     // numbered refs, may split
  | 'quote'            // pull-quote; keep whole
  | 'image';           // raster image with caption; keep whole

interface SectionBreakHints {
  breakBefore?: 'auto' | 'page' | 'avoid';
  breakAfter?:  'auto' | 'page' | 'avoid';
  keepTogether?: boolean;
  fullPage?: boolean;          // min-height: calc(100vh - margins) + break-after: page
}

interface SectionMetadata {
  title: string;
  kind: SectionKind;
  narrative: string;
  keyPoints?: string[];
  tags?: string[];
  sources?: SectionSource[];
  chromeOverrides?: {
    hide?: boolean;
    runningTitle?: string;
    resetPageCounter?: boolean;
  };
  // Provenance — mirrors SlideMetadata pattern
  generatedAt: string;
  soulId: string;
  deckId: string;
  position: number;
  metaVersion: '3.0';
  revisionHash: string;
}

interface Section {
  id: SectionId;
  deckId: DeckId;
  position: number;
  html: string;               // fragment — see §3
  kind: SectionKind;
  breakHints: SectionBreakHints;
  metadata: SectionMetadata;
  lastValidation?: ValidationResult;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}
```

### 2.3 `DocumentMeta` on `Deck`

Per-document configuration that the composer reads once:

```ts
interface DocumentMeta {
  chrome?: PageChromeDirective;   // deck-level running chrome
  pageMargin?: { top: string; right: string; bottom: string; left: string };
  toc?: {
    maxDepth?: number;
    includeKinds?: SectionKind[];
  };
}
```

---

## 3. The section fragment contract

A section's `html` field **MUST**:

1. Have a single root element: `<section class="pengui-section pengui-{kind}">…</section>`.
2. Be preceded by a `<!-- @section-meta {...} -->` comment carrying the metadata (mirror of `@slide-meta`).
3. **NOT** contain `<!DOCTYPE>`, `<html>`, `<head>`, `<body>`, `<script>`, or `<link>` tags.
4. **NOT** contain standalone `<style>` blocks outside the wrapper. Block-specific CSS is part of the recipe's registered styles (picked up once by the composer).
5. **NOT** define `:root` custom properties. Soul tokens are injected once at document compose time.
6. **NOT** set fixed page-shaped dimensions (`width: 1240px`, `height: 1754px`, `overflow: hidden`) on the root wrapper. (Allowed for `<svg>` children with `viewBox`.)
7. Wrap keep-together content in canonical classes (`pengui-figure`, `pengui-chart`, `pengui-diagram`, `pengui-callout`, `pengui-quote`, `pengui-image`) so universal break rules apply.

Validation (Section Stage 1) enforces all of the above.

---

## 4. The DocumentComposer

File: `src/domain/rendering/document-composer.ts`

### 4.1 Signature

```ts
interface ComposeInput {
  sections: Section[];
  deck: Deck;
  soul: DesignSoul;
  geometry: FormatGeometry;
  documentMeta: DocumentMeta;
  applyDefensive?: boolean;     // default true
  resolveAssets?: boolean;      // default true
  assetService?: AssetService;
}

interface ComposeResult {
  html: string;
  sectionDomIds: Record<SectionId, string>;
  warnings: string[];
}

class DocumentComposer {
  compose(input: ComposeInput): Promise<ComposeResult>;
}
```

### 4.2 Composed document anatomy

```html
<!DOCTYPE html>
<html lang="en" data-pengui-medium="print" data-pengui-model="document">
<head>
  <meta charset="UTF-8" />
  <title>{deck.title}</title>

  <!-- 1. Soul tokens, once -->
  <style id="pengui-soul-tokens">:root { --color-canvas: …; /* … */ }</style>

  <!-- 2. Stage-0 defensive defaults, document-level -->
  <style id="pengui-defensive-defaults">/* html/body margin:0, * box-sizing:border-box */</style>

  <!-- 3. Print + pagination base -->
  <style id="pengui-print-base">
    @page {
      size: A4 portrait;               /* from geometry.physicalPage + orientation */
      margin: 18mm 15mm 22mm 15mm;     /* from documentMeta.pageMargin or default */
    }

    html, body { background: var(--color-canvas); color: var(--color-text-primary); }
    body { font-family: var(--font-body); font-size: var(--text-body); line-height: var(--leading-body); }

    .pengui-figure, .pengui-chart, .pengui-diagram,
    .pengui-callout, .pengui-quote, .pengui-image {
      break-inside: avoid; page-break-inside: avoid;
    }

    h1, h2, h3 { break-after: avoid-page; page-break-after: avoid; }

    table { break-inside: auto; page-break-inside: auto; width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }

    p, li, dd { orphans: 3; widows: 3; }

    .pengui-section[data-full-page="true"] {
      min-height: calc(100vh - 0px);
      break-after: page; page-break-after: always;
    }
    .pengui-section[data-reset-page-counter="true"] { counter-reset: page 1; }
  </style>

  <!-- 4. Block styles registered by recipes -->
  <style id="pengui-block-styles">/* figure, chart, callout, comparison, glossary, … */</style>

  <!-- 5. Running chrome -->
  <style id="pengui-chrome">
    .pengui-running-header, .pengui-running-footer {
      position: fixed;
      left: 15mm; right: 15mm;
      font-size: 9pt;
      color: var(--color-text-secondary);
    }
    .pengui-running-header { top: 8mm; }
    .pengui-running-footer { bottom: 8mm; text-align: right; }
    .pengui-running-footer::after { content: counter(page) " / " counter(pages); }
    .pengui-section[data-chrome="off"] { /* see named @page technique below */ }
  </style>
</head>
<body>
  <header class="pengui-running-header">{runningTitle}</header>
  <footer class="pengui-running-footer"></footer>

  <main class="pengui-document">
    <section class="pengui-section pengui-cover"
             id="sec-1" data-kind="cover" data-full-page="true" data-chrome="off">
      {fragment 1 inner HTML}
    </section>
    <section class="pengui-section pengui-prose"
             id="sec-2" data-kind="prose">
      {fragment 2 inner HTML}
    </section>
    ...
  </main>
</body>
</html>
```

### 4.3 Per-section chrome & chapter running titles

We use **named `@page` contexts** to vary the running title per chapter or to hide chrome on cover / chapter headers:

```css
@page cover { margin: 0; }
@page chapter1 { --running-title: "Chapter 1 — Foundations"; }
@page chapter2 { --running-title: "Chapter 2 — Techniques"; }

.pengui-section[data-kind="cover"] { page: cover; }
.pengui-section[data-chapter="1"]  { page: chapter1; }
.pengui-section[data-chapter="2"]  { page: chapter2; }
```

The fixed chrome reads `--running-title` from the page box (Chromium inherits CSS custom properties from `@page` into the page's fixed descendants). Page `cover` has zero margins, which implicitly hides the chrome because the page box leaves no room above/below the content.

### 4.4 Full-page sections

`kind: 'cover' | 'chapter_header'` and `breakHints.fullPage === true` sections get:

- `data-full-page="true"` ⇒ `min-height: calc(100vh - ...)` + `break-after: page`.
- A wrapper `<div class="pengui-fullpage-canvas">` for flex layout of the hero content.

### 4.5 TOC auto-generation

If `documentMeta.toc` is set and a section has `kind: 'toc'` with an empty fragment body, the composer walks all sections, filters by `includeKinds`, and emits:

```html
<nav class="pengui-toc">
  <ol>
    <li><a href="#sec-3">Chapter 1 — Foundations</a></li>
    <li><a href="#sec-7">Chapter 2 — Techniques</a></li>
  </ol>
</nav>
```

with CSS using `target-counter(attr(href), page)` to print the page number. Chromium supports this in print.

### 4.6 Asset references & Stage 0

The composer invokes `resolveAssetRefs` once per fragment (`asset://…` → inline data URI or HTTP URL), then runs Stage 0 defensive injection on the final composed document.

---

## 5. Recipes

### 5.1 Deletion + replacement

- Delete all `templates/print/*.html` (slide-per-page templates).
- New directory: `templates/document/` with content-block fragments.

### 5.2 New recipe set (13 blocks)

| File | kind | Notes |
|------|------|-------|
| `cover.html` | `cover` | Full-page, no chrome. |
| `chapter-header.html` | `chapter_header` | Full-page, no chrome. |
| `toc.html` | `toc` | Empty sentinel; composer fills. |
| `prose.html` | `prose` | H2 + paragraphs + optional bullets. |
| `figure.html` | `figure` | `<figure>` with `<svg>` or `<img>` + `<figcaption>`. |
| `chart.html` | `chart` | Heading + inline SVG chart + caption. |
| `diagram.html` | `diagram` | Heading + inline SVG diagram (tree/flow/mindmap). |
| `table.html` | `table` | `<table>` with `<thead>`/`<tbody>`. |
| `callout.html` | `callout` | Boxed note/tip/warning. |
| `comparison.html` | `comparison` | Two-column A/B grid. |
| `glossary.html` | `glossary` | `<dl>` of terms. |
| `bibliography.html` | `bibliography` | `<ol>` of references. |
| `quote.html` | `quote` | Blockquote + attribution. |

### 5.3 Fragment shape conventions

- Root: `<section class="pengui-section pengui-{kind}">…</section>`
- No inline `<style>` tags; recipe-specific CSS lives in a separate file (`<recipe>.css`) loaded into the composer's `pengui-block-styles` block.
- All color/spacing/typography uses `var(--*)` tokens (no `:root` block needed).

---

## 6. Validation

### 6.1 Section Stage 1 (fast, runs on add/update)

File: `src/domain/validation/stage1/section-stage1-runner.ts`

Checks:

- `section-structural` — root is `<section class="pengui-section pengui-{kind}">`, `@section-meta` comment present with valid JSON.
- `section-no-document-wrappers` — no `<!DOCTYPE>`, `<html>`, `<head>`, `<body>`, `<script>`.
- `section-no-page-sized-containers` — no `width: 1240px` / `height: 1754px` / `overflow: hidden` / `height: 100vh` on the wrapper.
- `section-wrapper-class-present` — `kind: figure` has `.pengui-figure`; `kind: chart` has `.pengui-chart`; etc.
- `section-figure-shape` (kind: figure) — exactly one `<figure>` with `<figcaption>`.
- `section-table-shape` (kind: table) — `<table>` with `<thead>` + `<tbody>`.
- `section-svg-viewBox` (kind: chart|diagram) — inline `<svg>` has `viewBox`.
- Existing token/font/network-isolation checks reused (scoped to fragment).

### 6.2 Document Stage 2 (Playwright, runs at export / on demand)

File: `src/domain/validation/stage2/document-stage2-runner.ts`

Approach: compose the full document, render in Playwright, measure each `.pengui-section` (and keep-together children) against `@page` height.

Checks:

- `split-keep-together` — for each `.pengui-figure/.pengui-chart/.pengui-diagram/.pengui-callout/.pengui-quote`, compute `startPage = floor(top / pageHeightPx)` and `endPage = floor((top + height - 1) / pageHeightPx)`. Error if `start !== end`.
- `orphan-heading` — for each `h1|h2|h3`, check the next 100px has no page break. Warning if alone at the bottom.
- `figure-exceeds-page` — any keep-together element taller than the page content area → warning ("won't fit on any page").
- Reuse chart legibility / font compliance / contrast on the composed document.
- Emit `pagination-info` with page count.

### 6.3 Disabled for document mode

- `overflow-detector` — replaced by split-keep-together.
- `safe-area-check` — irrelevant for continuous documents (margins are on `@page`).
- `structural-check` — replaced by `section-structural`.

---

## 7. MCP Tools

### 7.1 New

| Tool | Purpose |
|------|---------|
| `add_section` | Append a section; returns section + validation. |
| `update_section` | Mutate html / metadata / break hints. |
| `get_section` | Fetch a section. |
| `remove_section` | Delete a section. |
| `reorder_sections` | New positions array. |
| `list_sections` | Lightweight: id, position, kind, title, score. |
| `update_document_meta` | Set chrome / page margins / TOC config. |

### 7.2 Cross-model guards

- `add_slide`/`update_slide`/… reject with `WRONG_AUTHORING_MODEL` on document-mode decks.
- `add_section`/… reject on slides-mode decks.
- Error message points to the correct tool and the `pengui://docs/document-mode` resource.

---

## 8. Exporter

### 8.1 PDF

- `PdfExporter.exportDocument(sections, deck, soul, geometry)` — new path.
- Calls `DocumentComposer.compose()` → single HTML document.
- Playwright: `margin: 0, printBackground: true, preferCSSPageSize: true`.
- No `displayHeaderFooter` — chrome is fixed HTML.
- `RenderService.exportPdf` branches on `deck.authoringModel`.
- Legacy per-slide print path removed once document path stabilizes.

### 8.2 HTML

- `HtmlExporter` for document decks returns the composed HTML unchanged (scrollable, no nav script).

### 8.3 PPTX / Google Slides

- Already refuse print formats. Add redundant guard on `authoringModel === 'document'`.

---

## 9. Docs / prompts / resources

- **Rewrite** `pengui://docs/print-mode` for continuous mode.
- **Add** `pengui://docs/document-mode` with the full authoring guide: fragment contract, kinds, wrapper classes, break hints, chrome, TOC, validation phases.
- **Replace** prompt `create-print-document` with `create-document` + `document-html-quickref`.
- **Update** `SPEC.md` with a v2.1 pointer to `SPEC-v3.md`.
- Tool descriptions on all deck tools reflect the model split.

---

## 10. Migration

**Policy:** no runtime migration. Legacy page-bound print decks are migrated once via `scripts/migrate-legacy-print-deck.ts`.

The script:

1. Reads the legacy Slide array for a given deck id.
2. For each slide, extracts block candidates: `<figure>`, top-level `<svg>`, `<table>`, prose paragraphs. Emits one Section per block.
3. Writes new sections, flips `authoringModel = 'document'`, clears `slideIds`, initializes `documentMeta` from any deck-level chrome.
4. Prints a diff.

Only runs when invoked; not on startup.

---

## 11. Rollout waves

| Wave | Scope | Files |
|------|-------|-------|
| 1 | Types, storage, guards | `src/types/section.ts`, `src/types/deck.ts`, `src/types/errors.ts`, `src/storage/interfaces.ts`, `src/storage/{memory,file}/section-store.ts`, `src/storage/factory.ts`, `src/domain/decks/deck-service.ts` |
| 2 | Document service + MCP tools | `src/domain/documents/document-service.ts`, `src/container.ts`, `src/tools/decks/{add,update,get,remove,reorder,list,update-doc-meta}-section.tool.ts`, guards on slide tools |
| 3 | DocumentComposer + recipes | `src/domain/rendering/document-composer.ts`, `templates/document/*.html`, `src/domain/souls/recipe-generator.ts` |
| 4 | Validation | `src/domain/validation/stage1/section-*.ts`, `src/domain/validation/stage2/document-*.ts`, `src/domain/validation/validation-service.ts` |
| 5 | Exporter integration | `src/domain/rendering/pdf-exporter.ts`, `src/domain/rendering/html-exporter.ts`, `src/domain/rendering/render-service.ts`, `src/tools/export/export-validation.ts` |
| 6 | Docs, prompts, migration script | `src/resources/{print,document}-mode.resource.ts`, `src/prompts/index.ts`, `scripts/migrate-legacy-print-deck.ts`, `SPEC.md` |

Each wave typechecks cleanly and the full test suite passes before the next one starts.

---

## 12. Non-goals

- Adding new output formats (EPUB, HTML-book, …). Out of scope.
- Real-time WYSIWYG preview of continuous documents. Preview-renderer can keep per-section rendering heuristically; full WYSIWYG is a later wave.
- Multi-column layout. Out of scope for v3.

---

## 13. Risks & mitigations

- **Chromium named `@page` + CSS custom properties.** Documented-to-work but finicky. Mitigation: integration test rendering a fixture and scraping PDF text for running titles.
- **`target-counter` for TOC.** Works in headless Chromium; fallback is a two-pass compose (render once, count pages, re-inject numbers, render again).
- **Split detection mm↔px math.** Centralize in `document-composer.ts` as `getCssPageHeightPx(geometry)` consumed by both composer and Stage 2.
- **Legacy deck friction.** The one in-prod legacy print deck has been migrated via the one-shot script before removing the legacy path; migration tested end-to-end against the last known-good PDF.
