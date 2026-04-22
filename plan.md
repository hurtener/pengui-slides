# Pengui Slides — Print Mode Implementation Plan

## Status tracker

- [x] **Wave 0** — Contract lockdown (me, serial)
- [ ] **Wave 1** — Backend threading + print recipes + design system port (3 parallel agents)
- [ ] **Wave 2** — Diagrams + MCP app redesign + page chrome (3 parallel agents)
- [ ] **Wave 3** — Polish + graceful degradation + README + e2e demo (me, serial)

## Current state

- SPEC v2.0 drafted at `SPEC.md`.
- Five cross-wave task entries tracked in the session TaskList.
- No code changes yet.

## The model

Four waves, serial between waves, parallel within. Inspired by the wave pattern used for `study-audio-mcp`'s own build. Wave 0 is the only serial wave I own; Waves 1–2 are parallel agent fanouts with **disjoint file ownership** to eliminate merge conflicts; Wave 3 is cleanup.

Each parallel agent runs `isolation: "worktree"` on a throwaway branch. After the wave completes, I inspect their diffs in order, resolve any surface-level nits myself, and fast-forward-merge onto the main working branch.

**My role** across waves: design the contracts in Wave 0, brief each agent airtight, verify deliverables at the sync point, handle rework in Wave 3. Agents do the body of the implementation inside tight boundaries.

---

## Wave 0 — Contract lockdown (me, serial)

**Deliverables:**

- `src/types/format.ts` — `Format`, `FormatKind`, `FormatGeometry`, `FormatMedium` types as per SPEC §3.1.
- `src/domain/formats/format-registry.ts` — `FORMAT_REGISTRY` with the three entries per SPEC §3.2, plus `getFormat(kind)` helper and `DEFAULT_FORMAT` export.
- `src/types/deck.ts` — extend `Deck`, `DeckSummary`, `CreateDeckInput` with optional `format?: FormatKind`. Legacy decks default to `slides_16_9` at read time in the deck-service.
- `src/types/validation.ts` — extend `Stage1Check` and `Stage2Check` interfaces to receive `geometry: FormatGeometry` as a new argument.
- `src/domain/rendering/pdf-exporter.ts` — introduce a constructor-level default geometry + a per-export override path; replace `SLIDE_WIDTH`/`SLIDE_HEIGHT` constants with the exporter's injected geometry. Slide-mode behavior unchanged (default geometry resolves to 1920×1080).
- `src/domain/validation/stage1/safe-area-check.ts` — swap hardcoded `EXPECTED_WIDTH`/`EXPECTED_HEIGHT`/`EXPECTED_SAFE_AREA_TOKEN` for values derived from the geometry argument (token still required, so the expected string is `var(--space-safe-area)` either way).
- `src/domain/validation/stage2/overflow-detector.ts` — same treatment: geometry argument replaces hardcoded constants.
- `src/domain/validation/stage1/stage1-runner.ts` and `stage2-runner.ts` — thread the geometry through each check's `run()` call.
- `src/domain/decks/deck-service.ts` — accept `format` on `createDeck`, default to `slides_16_9`, expose `getDeckFormat(deckId): FormatKind` helper. Include format in `DeckSummary`.
- `src/config.ts` — keep `slideWidth/slideHeight/safeAreaInset` for backward compat but mark them as defaults for `slides_16_9`. A follow-up can deprecate these entirely.

**Quality gate:** `npm run typecheck` clean. `npm test` green with no changes to existing tests. No runtime behavior change for existing slide decks (verified manually by running `scripts/e2e-demo.mts`).

**Sync point:** Wave 0 lands on the main branch before Wave 1 agents are spawned. Agents consume the new types and registry directly.

---

## Wave 1 — 3 parallel agents

All three run `isolation: "worktree"` with fully disjoint file ownership. No agent touches another agent's files.

### Agent 1A — Backend geometry threading

- **Owns:** `src/tools/decks/create-deck.tool.ts`, `src/tools/export/export-pdf.tool.ts`, `src/tools/export/render-preview.tool.ts`, `src/domain/rendering/render-service.ts`, `src/domain/rendering/slide-renderer.ts`, `src/domain/rendering/preview-renderer.ts`, `tests/` additions for the threading. Does **not** touch exporter internals owned by 1B or validator internals.
- **Task:** Expose `format` on `create_deck`. For every renderer/exporter entry point, resolve the deck's format and pass its geometry down. Ensure `render_preview` produces format-aware thumbnail dimensions. Produce a new unit test that creates a print-a4 deck, adds a minimal page, renders a preview, and asserts the output dimensions match A4.
- **Forbidden:** Editing safe-area-check, overflow-detector, pdf-exporter internals (those are Wave 0 contracts). Editing tools in 1B's scope.
- **Quality gate:** `npm run typecheck` + `npm test` clean. Slide-mode fixtures unchanged.

### Agent 1B — Print recipes + soul typography overrides

- **Owns:** `templates/print/` (new directory, 10 new HTML files), `src/domain/souls/recipe-generator.ts` (adds print-recipe branch conditioned on format medium), `src/domain/souls/token-generator.ts` (adds print-mode typography overrides per SPEC §5.1), tests for both.
- **Task:** Author 10 print recipe templates: `cover.html`, `toc.html`, `chapter-intro.html`, `content.html`, `content-chart.html`, `content-diagram.html`, `compare.html`, `glossary.html`, `timeline.html`, `summary.html`, `bibliography.html`. All pages use token-only CSS (no literal hex/px), structured for A4 portrait geometry (1240×1754 px with 96px safe area). Add a print-mode branch in the token generator that emits the SPEC §5.1 typography scale when a soul is used with a print-medium format — soul approval still produces both slide and print CSS blocks so a deck can switch format freely.
- **Forbidden:** Touching rendering, validators, or app code.
- **Quality gate:** Each template passes Stage 1 lint when paired with any approved soul. New tests: one "every print recipe validates against a reference soul" test.

### Agent 1C — Design system port

- **Owns:** `app/src/styles/` (new: `tokens.css`, `globals.css`, `motion.css`), `app/src/lib/primitives/` (new: `Sidebar.svelte`, `Toast.svelte`, `Card.svelte`, `Button.svelte`, `Tabs.svelte`, `Chip.svelte`), `app/src/stores/` (new: `toast.svelte.ts`). Does **not** touch `DeckEditorApp.svelte` or `SlideCanvas.svelte` — those are Wave 2's turf.
- **Task:** Port the Cozy Premium design system from `/Users/santiagobenvenuto/Repos/study-audio-mcp/frontend/src/styles/` and `components/primitives/` verbatim into the app, adjusting only for pengui-specific variables. Verify `npm run build:app` still succeeds (existing components stay untouched so this is additive).
- **Forbidden:** Modifying any existing `.svelte` file. Port, don't refactor.
- **Quality gate:** `npm run build:app` clean. Visual sanity check that `tokens.css` loads without errors when imported from a test page.

**Wave 1 sync point:** I verify the three branches in isolation (`npm run typecheck`, `npm test`, `npm run build`), then merge in order 1A → 1B → 1C. Any type errors at merge boundary get fixed by me in a short reconcile commit before Wave 2.

---

## Wave 2 — 3 parallel agents

All three run `isolation: "worktree"` with disjoint ownership. Wave 1 must be merged first.

### Agent 2A — Diagrams & charts resource + validator

- **Owns:** `src/resources/print-charts-and-diagrams.ts` (new MCP resource registration), `src/resources/app-resources.ts` (index update), `docs/charts-and-diagrams.md` (new long-form doc with SVG templates), `src/domain/validation/stage1/diagram-legibility.ts` (new check), `src/domain/validation/stage1/stage1-runner.ts` (register the check conditionally), `templates/print/content-diagram.html` (upgrade Wave-1's stub with a full tree/mind-map example matching the reference image style), tests for the validator.
- **Task:** Ship a comprehensive `pengui://docs/charts-and-diagrams` resource. Content: full working SVG templates for the tree/mind-map diagram (flagship, matching the reference image: horizontal hierarchy, pastel category grouping, orthogonal connectors), flow diagram, comparison matrix (HTML table), timeline, bar/line/pie charts. Each template uses soul tokens exclusively. Implement the Stage 1 `diagram-legibility` check per SPEC §8.4 — warnings only, fires on `content_diagram` / `content_chart` slide types.
- **Forbidden:** Touching the MCP App or the PDF exporter.
- **Quality gate:** Stage 1 runner tests pass. The diagram template renders via Playwright without issues and screenshots cleanly (one visual snapshot test).

### Agent 2B — MCP App redesign

- **Owns:** `app/src/DeckEditorApp.svelte` (full rewrite), `app/src/lib/SlideCanvas.svelte` (format-aware updates), new `app/src/routes/` (`Decks.svelte`, `Editor.svelte`, `Export.svelte`), `app/src/main.ts` (routing entry), `app/src/stores/deck.svelte.ts` (new), `app/src/lib/PagePreview.svelte` (new, multi-page scrollable preview for print decks), `app/src/lib/FormatBadge.svelte` (new). Consumes (read-only) the primitives and tokens Wave 1C produced.
- **Task:** Rebuild the editor app per SPEC §10 — Svelte 5 `$state` runes, route-based shell, Cozy Premium styling consumed from Wave 1C tokens. Three routes (Decks library / Editor / Export) as described in SPEC §10.2. Canvas adapts to deck format per §10.3. Export panel per §10.4 with live iframe preview and one-click download. Keep `bridge.ts` API contract (tool calls in/out) unchanged so no backend change is required.
- **Forbidden:** Backend changes of any kind. Touching validator code. Adding new tools (Agent 2C can propose page-chrome-related protocol if needed, but app changes are consumers, not authors of protocol).
- **Quality gate:** `npm run build:app` clean. Manual browser verification via `vite dev` that (a) opening a slide deck in the app still works with the same edits as before, (b) opening a print deck shows the new vertical layout.

### Agent 2C — PDF exporter page chrome

- **Owns:** `src/domain/rendering/pdf-exporter.ts` (add page-chrome directive handling), `src/domain/metadata/page-chrome-parser.ts` (new), `src/types/page-chrome.ts` (new), tests for chrome parsing and exporter chrome rendering. Also updates `src/tools/export/export-pdf.tool.ts` response metadata to report `pageChromeApplied: boolean`.
- **Task:** Implement the `@page-chrome` directive parser and thread it into the PDF exporter. When any slide in a print deck carries a non-hidden chrome directive, the exporter uses `page.pdf({ displayHeaderFooter: true, headerTemplate, footerTemplate })` with soul-token-styled templates. Templates render "Running Title" in the header strip and "Page X of Y" in the footer (alignment per directive). Slides with `"hide": true` get a per-page override to blank header/footer for that page (via `@page :nth-of-type(...)` or the exporter splitting into multiple pdf() calls — decide during implementation and document the choice).
- **Forbidden:** Touching the MCP App, validators, or recipe templates.
- **Quality gate:** New exporter tests: two-page print deck with chrome → header/footer visible on both pages; cover page with `hide:true` → no chrome on cover but present on subsequent pages; malformed chrome JSON → typed error per SPEC §12.

**Wave 2 sync point:** Verify three branches. Merge order 2A → 2C → 2B (2B consumes the full backend surface, merge last). Another short reconcile commit if type edges mismatch.

---

## Wave 3 — Polish & graceful degradation (me, serial)

- `src/tools/export/export-pptx.tool.ts` + `export-google-slides.tool.ts` — detect print-format deck, return `format_not_exportable` typed error per SPEC §12.
- `src/resources/print-mode.ts` — new MCP resource `pengui://docs/print-mode`: authoring guide, when to use print, recipe index, page-chrome reference.
- `src/prompts/create-print-document.ts` — new MCP prompt analogous to `create-presentation`, but oriented around exam summaries and handouts.
- `README.md` — add Print Mode section, update tool/resource/prompt counts.
- `scripts/print-demo.mts` — end-to-end: creates a new soul, approves it, creates a print-a4 deck, adds cover + TOC + 2 content pages + a content-diagram page (tree/mind-map) + summary, exports to PDF, asserts file size and page count.
- Full `npm run typecheck && npm test && npm run build` pass.

**Sync point:** Human smoke test through Claude Desktop: create a print deck, confirm the MCP App shows the new layout, export a PDF and open it.

---

## Quality guardrails (enforced in every agent brief)

1. `npm run typecheck` clean on the agent's branch before reporting done.
2. `npm run build` clean.
3. `npm test` passes including new tests.
4. No `TODO`, `FIXME`, or `any` shortcuts in owned files. Grep check in the brief.
5. Token-only CSS in any HTML the agent authors — literal hex or px values are forbidden. Agents check their templates against the reference soul.
6. Disjoint file ownership enforced — if an agent discovers they need to touch a file outside their scope, they stop and report rather than modify.
7. No new runtime dependencies without explicit owner approval (this plan). No `dompurify`, `d3`, `chart.js`, etc. — we have playwright, cheerio, postcss, and that is enough.

At each sync point I verify these claims rather than trust the agent summary. Specifically: read the diff, run the quality gate commands locally, spot-check one or two tests per agent to confirm they exercise real behavior.

---

## Trade-offs

- Wave 0 and Wave 3 are inherently serial. No speedup there.
- Agent brief writing costs real time (10–15 min per agent) — shallow briefs produce shallow work, so budget the time.
- Rework round-trips cost ~20–30 min each. Tasks I can't brief airtight, I do myself.
- Realistic wall-clock speedup per parallel wave is ~1.7×, not 3× (sync + review overhead).
- Worktree isolation adds merge overhead but eliminates whole-tree conflicts; a net win at this scope.

---

## Explicit non-goals for this build (see SPEC §14)

Flowing pagination, auto-TOC, bleed marks, Google Slides for print, editable PDF forms, cross-page footnote numbering. These may come later; they are not on today's delivery list.
