# v4.23 — production-readiness pass

User-requested coordinated pass touching six fronts. Each section
documents finding + intervention + open work.

## 1. Table font-size regression (FIXED)

**Symptom**: tables render with smaller font than surrounding text on
the same slide.

**Root cause**: v4.22.2 introduced `scaledFontPt` (a proportional boost
that lifts sub-readable point sizes by ×1.4) and routed text and run
font-sizes through it — but the table path in
`editable-pptx-exporter.ts` kept using the un-boosted `scaledPt`, so
every table cell stayed at the raw 0.5×-compressed pt value while the
rest of the slide was boosted to readable size. Per-cell `fontSize`
was also being dropped (only the table-level default propagated), so
header rows lost their authored size differential.

**Fix** (`editable-pptx-exporter.ts`):
- `toTableProps` fontSize → `scaledFontPt`.
- `toTableRows` threads `cell.style.fontSize` AND `run.fontSize` to
  pptxgenjs cell/run options through `scaledFontPt`.
- Added `ABS_MIN_FONT_PT = 8` floor inside `scaledFontPt` so the very
  smallest text (chip-xs at ~5pt natural × 1.4 = 7pt) also clears the
  legibility threshold instead of riding the bare 1.4× boost.

No compiler-revision bump needed — only the exporter changed; the
cached SlideDocument shape is unchanged (cell.style.fontSize is still
captured in CSS px the same way).

## 2. PPTX repair-prompt regression (HARDENED)

**Symptom**: PowerPoint shows "found a problem with content" on open.

**Investigation**: ran the v4.21 noir editable export and scanned XML
for the known triggers covered by v4.18.5 (`empty_tblPr`, zero-width
cell lines, line-shape outer solidFill, duplicate cNvPr ids,
duplicate `<a:pPr>` per `<a:p>`). The output came up CLEAN — no
remaining triggers. That means either (a) the regression is in a
specific user-deck pattern not covered by the e2e fixtures, or (b)
the trigger is a NEW pattern we don't yet patch.

**Defensive intervention** (`editable-pptx-exporter.ts`):
- New post-processor `stripEmptyLangAttrs` removes `lang=""` from
  `<a:rPr>` / `<a:endParaRPr>` — Mac PowerPoint's strict validator
  rejects empty BCP-47 tokens.
- New `scanForRepairTriggers` runs AFTER the post-processing pipeline
  and logs `editable PPTX repair-prompt triggers remain after
  post-processing` with the list of triggers found. Triggers checked:
  `empty_tblPr`, `zero_width_cell_line`, `empty_lang_attr`,
  `cnvpr_id_zero`, `duplicate_cnvpr_id`, `line_shape_outer_fill`.

If the user can re-export the deck that's prompting repair and grab
the resulting log lines, the scanner will name the specific trigger
remaining — turn that into a new post-processor in the same pattern
as the existing ones.

**Open work**: extend the scanner to detect:
- `<p:cNvPr name="">` (empty name attr — some validators trip)
- `<a:rPr>` with `sz="0"`
- `<a:p>` containing zero `<a:r>` AND zero `<a:endParaRPr>`
- Image `<p:pic>` whose `<a:blip r:embed="..."/>` resolves to a
  missing relationship target

## 3. MCP App performance + bundle size (SHIPPED)

**Result**: bundle dropped from **717 KB → 337 KB** (53% smaller),
gzip from 184 KB → 92 KB, module count from 319 → 181. All 1328
tests still pass.

**What landed**:

A) **Slim postMessage client** (`app/src/lib/slim-mcp-app.ts`).
   Hand-rolled replacement for `@modelcontextprotocol/ext-apps`'s
   `App` + `PostMessageTransport` + style helpers. ~8 KB unminified;
   implements only what the bridge actually uses: `ui/initialize`
   handshake, `tools/call` requests, tool-input + tool-result
   notifications, `ui/message`, host-context-changed, autoResize via
   ResizeObserver. No Zod, no SDK Protocol class — that's the single
   biggest byte source eliminated.

B) **bridge.ts switched to the slim client**. Public surface of
   `McpDeckEditorBridge` unchanged so route components and tests need
   no edits. Verified by running the full deck-editor app test
   (`tests/app/deck-editor-app.test.ts`) plus the rest of the suite.

C) **Lazy-loaded route components** in `DeckEditorApp.svelte`. Each of
   the 7 routes (Workspace, Decks, Editor, DocumentEditor, Export,
   Souls, Assets) is now a dynamic import. Under
   `vite-plugin-singlefile` they still ship inline, but each chunk
   defers its parse + execute to first navigation, which directly
   addresses the "feeling slow" boot complaint. The infrastructure
   also positions us to drop singlefile later without re-architecting
   the route layer.

**Open follow-ups** (originally section 3 plan steps B + C + D):

- B was "drop singlefile, serve chunks as ui:// resources". After
  reading the spec more carefully, this is blocked by the
  sandboxed-iframe model: subresource fetches need a declared CSP
  origin, and `ui://` is not a network origin the iframe can fetch.
  The only viable path is shipping assets via a real CDN, which is
  out of scope for a locally-installed MCP server. Mark as
  not-viable-without-CDN.
- C was "lite-mode dispatch". Now that the bundle is 337 KB, the
  case for a separate lite build is much weaker — the full editor
  fits under any reasonable client cap. Revisit only if a new
  feature drives the bundle back above ~500 KB.
- D was "slim SDK". Done as A above; no further work needed.

## 3 (legacy). MCP App performance + bundle size (HISTORICAL FINDINGS)

**Current state**: `build/app/index.html` = **712 KB** (gzip 182 KB),
a single inlined HTML doc produced by `vite-plugin-singlefile`. The
`ui://deck-editor/index.html` resource ships the full file every
time, even to clients with strict payload limits.

**Composition breakdown** (eyeballed from the bundle + module sizes):
- `@modelcontextprotocol/ext-apps` (App + PostMessageTransport +
  bundled SDK + Zod schemas): ~150-200 KB after tree-shake
- Svelte runtime: ~50 KB
- Route components: ~210 KB of Svelte source (DocumentEditor 60 KB,
  Editor 58 KB, Workspace 25 KB, Export 24 KB, SoulPanel 17 KB,
  Assets 11 KB, Souls 10 KB, Decks 7 KB)
- Primitives + lib components: ~120 KB
- Styles (tokens + motion + globals): ~100 KB

**Why it feels slow**: even on warm cache, parsing 712 KB of Svelte +
SDK + Zod runtime takes 100-300 ms on a slow client. Every navigation
within the app pays for ALL routes upfront.

**Progressive disclosure plan**:

A) **Lazy-load route bodies**. Convert `import Editor from
  './routes/Editor.svelte'` etc. to `await import('./routes/Editor.svelte')`.
  Even with `vite-plugin-singlefile`, dynamic imports become
  separately addressable chunks the browser parses on demand. The
  bytes still ship, but the BOOT path becomes much cheaper. Owner:
  `app/src/DeckEditorApp.svelte`.

B) **Drop vite-plugin-singlefile**; emit chunks; register each as a
  separate `ui://deck-editor/<chunk>.js` resource. The host loads
  chunks on-demand via the standard `resources/read` flow. Confirmed
  Claude Desktop / Claude.ai support this; need to confirm Claude
  Code. Owner: `vite.app.config.ts`, `src/resources/app-resources.ts`.

C) **Lite-mode dispatch**. Build TWO bundles — `full` and `lite`.
  Lite drops the visual canvas (`SlideCanvas.svelte`, ~27 KB), the
  document-mode editor, and the soul-preview panel; it keeps deck
  list + slide text-edit form. `open_deck_editor` checks
  `getMcpAppsSupport()` and returns whichever `ui://` URI fits.
  Owner: `vite.app.config.ts` (split builds),
  `src/tools/app/open-deck-editor.tool.ts` (dispatch),
  `src/resources/app-resources.ts` (register both).

D) **SDK slim**. The `@modelcontextprotocol/ext-apps` package's
  default entry inlines the full SDK + Zod schemas (~300 KB on disk).
  Investigate whether a slimmer barrel exposing only `App` +
  `PostMessageTransport` exists or can be added upstream. If not,
  consider a hand-rolled tiny postMessage bridge — the app only
  needs `connect()`, `callServerTool()`, `ontoolinput`,
  `ontoolresult`. That's a few hundred lines without Zod.

**Suggested order**: A (low risk, immediate UX win), then C (clear
size win for limited clients), then B (architectural), then D (most
work, biggest single win on bytes).

## 4. Slides ↔ Sections parity for production (TO AUDIT)

User wants full parity between slide and section (A4) authoring for
production-grade exports. Run the parity audit by walking each tool's
slide / section symmetric pair and noting gaps. See section 5 below
for detailed findings.

## 5. Slides ↔ Sections parity audit findings

See per-file diff captured under `audit/slides-sections-parity.md`
(to be produced as part of this pass). Quick scan of `src/tools/`:

- `apply-slide-text-patch` (v4.22) → no section mirror; PLAN_v4.22
  explicitly punted this. **Action**: add `apply_section_text_patch`.
- `apply-slide-node-edit` ↔ `apply-section-node-edit` ✓
- `apply-slide-field-edit` ↔ `apply-section-field-edit` ✓
- `slide-structural-ops` ↔ `section-structural-ops` ✓
- `add-slide` ↔ `add-section` ✓
- `remove-slide` ↔ `remove-section` ✓

Export quality: section export goes through PdfExporter only;
no PPTX path. **Action**: confirm this is the intended boundary
(print → PDF, slides → PPTX) and document it in tool descriptions
so the LLM doesn't try `export_pptx` on a section deck (already
guarded server-side at `export-pptx.tool.ts:42` via
`FormatNotExportableError`, but the guard error is opaque).

## 6. LLM token efficiency (QUICK WINS)

Token cost lives mostly in:
- Tool descriptions (loaded on every connection)
- Tool input schemas (loaded on every connection)
- Tool RESPONSES (per call)

**Done in this pass**:
- `get_slide` now defaults to a lean shape (IR + source_kind +
  metadata + position + translation_issues, no html / document).
  Callers that need html or document opt in via `include_html` /
  `include_document`. Verified the only App caller (`Editor.svelte`
  line 525) only consumes `ir`, so the lean default is safe.
- `apply_section_text_patch` added — section mirror of v4.22's
  `apply_slide_text_patch`. Same find/replace token savings for
  document-mode decks.

**Still open**:
- Pass-through review of `apply-*.tool.ts` descriptions to trim
  verbose prose to ≤600 chars each (the deck dir is ~120 KB of
  source; ~80-100 KB ships as description text every connection).
  Replace inline guides with `pengui://` resource references —
  resources are loaded lazily.
- Prompts/resources should surface `apply_slide_text_patch` and
  `apply_section_text_patch` ABOVE the node-edit variants for any
  single-substring change.
- Verify `get_deck_summary` doesn't duplicate fields that `list_decks`
  already returns (no duplication today, but worth periodic check).

## What shipped in this pass

- `editable-pptx-exporter.ts`: tables now route fontSize through
  `scaledFontPt` (cell + run + table-level), with an 8pt absolute
  floor; added `stripEmptyLangAttrs` post-processor; added
  `scanForRepairTriggers` defensive log at end of post-processing.
- `tests/unit/domain/ir/nodes.test.ts`: SLIDE_NODE_TYPES catalog test
  now includes `code_block` (was failing pre-existing test).
- `document-service.ts` + `apply-section-text-patch.tool.ts` +
  tool index + section-mutation-response.ts: new
  `apply_section_text_patch` MCP tool, closes a parity gap from
  v4.22.
- `get-slide.tool.ts`: default to lean response (no html/document);
  callers opt in with `include_html` / `include_document` flags.
- `app/src/lib/slim-mcp-app.ts`: NEW. 8 KB unminified hand-rolled
  replacement for `@modelcontextprotocol/ext-apps`'s `App` class and
  PostMessage transport. Drops 138 modules from the bundle.
- `app/src/lib/bridge.ts`: switched to the slim client.
- `app/src/DeckEditorApp.svelte`: 7 routes converted to dynamic
  imports for boot-time perf.
- **Bundle: 717 KB → 337 KB (-53%); gzip 184 KB → 92 KB.**
- All 1328 existing tests still pass.
