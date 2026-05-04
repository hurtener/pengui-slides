# Pengui Slides — Functional Specification

**Version:** v4.11 (as-built) · path-to-v5.0 captured in §15
**Status:** canonical
**Last updated:** 2026-05-01

This document describes Pengui Slides as it exists today and the trajectory toward v5.0 (WYSIWYG). For historical context, the v2.0 print-mode introduction lives in [`SPEC-v3.md`](./SPEC-v3.md) (continuous-document model) and the v4 deepening proposal in [`SPEC-v4.md`](./SPEC-v4.md). They remain on disk as design artifacts; this document supersedes them as the description of current behavior.

---

## 0. North star

**v5.0 = WYSIWYG.** Agent and human edit the same artifact, see the same live preview, and HTML stops being the agent's primary interface. Each v4.x release is one coherent step toward that — not a pre-5.0 sprint. Two consequences shape every decision:

1. **IR is the source of truth.** Authoring is a structured node tree (`SlideIR` / `SectionIR`). HTML is a render artifact, not a contract.
2. **The MCP App is the UI.** No parallel web frontend, no REST. Binary upload, comments, direct manipulation all live behind app-only or model-visible MCP tools.

What that has bought so far (v4.0 → v4.11):

| Release | Theme |
|---|---|
| v4.0 – v4.4 | Deeper MCP App: slugs, comments, app-only asset upload, Soul artifact panel |
| v4.5 | IR-first authoring (`SlideIR` / `SectionIR`); raw HTML mutation removed |
| v4.6 | IR-native edit loop: `apply_*_node_edit` + `apply_*_field_edit`, token override cascade, IR-native recipes |
| v4.7 | Visual loop closure: canvas fill, dark-bg text swap, `validation_depth`, `validate_deck_for_export`, per-issue export errors |
| v4.8 | Doc-only IR nodes (`toc`, `bibliography`, `page_break`, `section_divider`); document-mode editor parity |
| v4.9 | Direct manipulation: insert / move / duplicate / remove + node-type morph from the canvas |
| v4.10 | Universal block-level pinning + `compile_markdown` |
| v4.11 | Compound layouts in the picker (`two_column`, `grid`); `data-ir-node-type` for editor-side classification |

---

## 1. Overview

Pengui Slides is an **MCP server with a first-class MCP App** for human-agent slide and print-document creation. Core moves:

```
Agent writes IR → Server validates + compiles to HTML → Playwright renders → PPTX / PDF / HTML / Google Slides
                       ↑                                       ↓
                       └──── App reads + mutates IR ──── Live preview ────┐
                                                                           ↓
                                                         User edits in App, drops comments
```

Two output mediums share Design Souls, asset pipeline, validation engine, and the MCP App:

| Medium    | Format(s)                                                              | Authoring model | Geometry                                | Use cases                              |
|-----------|------------------------------------------------------------------------|-----------------|------------------------------------------|-----------------------------------------|
| **Slides** | `slides_16_9` (default)                                               | `slides`        | 1920 × 1080, 48px safe area              | Pitch decks, presentations              |
| **Print** | `print_a4_portrait`, `print_letter_portrait`                           | `document`      | 1240 × 1754 / 1275 × 1650, 96px safe area | Study summaries, handouts, whitepapers  |

Slide decks export to PPTX, PDF, HTML, Google Slides. Print decks are PDF-only and use the document-authoring model — sections compose into a single flowing HTML document that Chromium paginates.

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  LLM / agent (Claude Desktop, Claude Code, custom hosts)    │
│         │                                                   │
│         ▼ model-visible tools                               │
│  ┌────────────────────┐         ┌─────────────────────────┐ │
│  │ MCP transport      │◄───────►│ MCP App (Svelte 5 SPA)  │ │
│  │ (stdio | http)     │ bridge  │ ui://deck-editor/…       │ │
│  └─────────┬──────────┘         └─────────────────────────┘ │
│            │                                                │
│  ┌─────────▼──────────┐                                     │
│  │ ServiceContainer   │  deckService · soulService          │
│  │                    │  documentService · editorService    │
│  │                    │  assetService · commentService      │
│  │                    │  validationService                  │
│  └─────────┬──────────┘                                     │
│            ▼                                                │
│  In-memory or file-backed stores (selected at boot)         │
└─────────────────────────────────────────────────────────────┘
```

Both the agent and the App exercise the same service layer through the same transport. The App is a privileged client (it can call app-only tools for binary upload and editor mutation); otherwise it has no special access — every state change goes through the same domain services and the same validation gates.

Persistence is in-memory by default. `--persist-dir` (or `PENGUI_PERSIST_DIR`) switches to JSON file stores for souls, decks, slides, sections, assets, comments. Both modes pass identical contract tests.

---

## 3. The Format primitive

Every deck declares a `format`. A `FORMAT_REGISTRY` maps each format to geometry; renderer viewport, validator safe-area checks, overflow detection, and PDF exporter page size all read from `deck.format` instead of hard-coded constants.

| Format                  | Width × Height (px) | Safe area | Orientation | Medium  | Authoring model default |
|-------------------------|---------------------|-----------|-------------|---------|--------------------------|
| `slides_16_9`           | 1920 × 1080         | 48px      | landscape   | slides  | `slides`                 |
| `print_a4_portrait`     | 1240 × 1754         | 96px      | portrait    | print   | `document`               |
| `print_letter_portrait` | 1275 × 1650         | 96px      | portrait    | print   | `document`               |

Formats can be added without touching downstream code: register geometry, point recipes at it, threading flows automatically.

---

## 4. Authoring models

`authoringModel` is a deck-level field with two values:

### `'slides'`

A deck is a list of `Slide` records. Each slide owns a `slide_ir` tree compiled to a single 1920×1080 (or print-sized) HTML document. Page boundaries are explicit; layout is fully resolved at author time.

### `'document'`

A deck is a list of `Section` records. Each section is a `section_ir` tree compiled to a `<section class="pengui-section pengui-{kind}">` HTML fragment. The `DocumentComposer` concatenates all sections into one HTML document; Chromium paginates at export time, honoring `break-before/after` hints and the `page_break` IR node. Doc-only nodes (`toc`, `bibliography`, `page_break`, `section_divider`) are rejected by slide-mode lint.

**Section kinds:** `cover`, `chapter_header`, `content`, `compare`, `glossary`, `timeline`, `summary`, `bibliography`, `mixed`. Each carries optional metadata (title, eyebrow, break hints) plus the IR body.

`create_deck` picks the default model from `format` (slides → `'slides'`, print → `'document'`); pass `authoring_model` to override. Once chosen, the deck shape is fixed for that deck's lifetime.

---

## 5. The IR (`SlideIR` / `SectionIR`)

The schema lives in `src/domain/ir/nodes.ts` and is exposed to agents as the `pengui://schema/slide-ir` resource (Zod compiled to JSON Schema). The same node grammar serves both authoring models; the divergence is in which top-level nodes are allowed.

### 5.1 Leaf nodes

Self-contained content units — no nested IR.

| Type        | Carries                                                         |
|-------------|-----------------------------------------------------------------|
| `hero`      | `eyebrow?`, `title`, `subtitle?`, `align`                       |
| `heading`   | `level` (1–6), `text`, `align`                                  |
| `prose`     | `body` (RichText), `align`                                      |
| `list`      | `style` (`bullet`/`numbered`/`checklist`), `items[RichText]`    |
| `quote`     | `body`, `attribution?`                                          |
| `callout`   | `kind` (`note`/`warning`/`tip`/`important`), `title?`, `body`   |
| `image`     | `asset_id` (resolves to `asset://UUID` at compile time), `alt?`, `caption?`, `fit` |
| `divider`   | `spacing`                                                       |
| `table`     | `caption?`, `header?`, `rows[][RichText]`                       |

`RichText = Array<{ text: string; bold?, italic?, underline?, strike?, code?, color? }>`. The validator + parser round-trip preserves marks; v4.6 introduced semantic color roles so token edits cascade through user-marked spans without lossy substitution.

### 5.2 Compound containers

Lay out leaves in two-axis structures. **Leaf-only inside** — the schema rejects nesting another compound, and `insertNodeAtPath` enforces it server-side.

| Type          | Shape                                                                            |
|---------------|----------------------------------------------------------------------------------|
| `two_column`  | `ratio` (`1:1`/`1:2`/`2:1`), `gap`, `left[LeafSlideNode]`, `right[LeafSlideNode]` |
| `grid`        | `columns` (2/3/4), `ratio?`, `gap`, `align_items`, `cells[[LeafSlideNode]]` (2D) |

`grid.cells.length` must be a multiple of `columns`; `grid.ratio` (if present) must have exactly `columns` weights. Both are enforced at render time.

### 5.3 Doc-only nodes

Allowed inside `section_ir.body`; rejected by slide-mode lint.

| Type              | Carries                                                                  |
|-------------------|--------------------------------------------------------------------------|
| `toc`             | `title?`, `include_kinds?`, `max_depth?` — resolved at compose time      |
| `bibliography`    | `title?`, `entries[{id?, text}]`                                         |
| `page_break`      | (no body) — forces the next sibling onto a new page                      |
| `section_divider` | `label?`, `ornament?` — slide-mode chapter break (rejected in doc IR)    |

### 5.4 Path addressing

Every IR node has a stable address: `IRPath = ('body' | string | number)[]`. Examples:

```
['body', 0]                            // first slide-body node
['body', 2, 'left', 1]                 // second leaf in two_column.left
['body', 4, 'cells', 1, 0]             // first leaf in grid row 1
```

The compiler emits `data-ir-path="body,N[,key,M…]"` on every node root. The App reads this attribute to map a click back to the IR; the bridge sends edits with the path, and the path-resolver in `src/domain/ir/operations/path-resolver.ts` walks it. Sibling shifts (insert, remove, duplicate, move) automatically migrate any pinned comments anchored to affected paths via `migratePathAfter*` helpers.

### 5.5 Editor classification

Since v4.11 the compiler also emits `data-ir-node-type="<type>"` on every node root. The bridge reads it to decide whether the selected block is morphable (text-bearing leaves only — image/divider and any compound say no). This replaced a brittle "has `[data-ir-rt-field]` descendants" probe that gave compounds false positives.

---

## 6. Compile pipeline

`compileSlideIRToHtml` and `compileSectionIRToHtml` (`src/domain/ir/compile/*`) are pure functions: `(IR + Soul + Geometry) → HTML`. They:

1. Walk the IR tree via `renderNode(node, path)`. Each leaf renderer emits `<tag class="pengui-…" data-ir-path data-ir-node-type[ data-ir-rt-field]>…</tag>`.
2. Inline a `<style>` block built from the soul's CSS tokens (~73 vars) plus a small layout sheet matching the format's geometry.
3. Resolve `asset://UUID` references to `data:` URIs at render time via the asset resolver.
4. For document-mode, the `DocumentComposer` concatenates sections into one HTML, threads page-chrome (running titles, page numbers) via `page.pdf({ headerTemplate, footerTemplate })`, and resolves cross-section state (TOC entries, bibliography references) at compose time.

**Compiler revision (`CURRENT_COMPILER_REVISION`)** gates cached `SlideDocument` outputs. Bump it when compiler output changes; cached docs older than the current revision are recompiled on next read. Forgetting to bump ships fixes that never reach export.

---

## 7. Design Souls

A Soul defines visual identity across 7 layers: **Color Language** · **Typography** · **Spacing** · **Shape** · **Depth & Shadow** · **Components** · **Motion & Tone**.

`approve_design_soul` generates:

- ~73 CSS custom properties (`--color-canvas`, `--text-h1`, `--space-md`, `--radius-card`, `--shadow-soft`, …)
- ~38 utility CSS classes (layout, typography, cards)
- Layout recipes for both authoring models (slide recipes + print recipes for document mode)
- An LLM-consumable style guide markdown

**Token-only enforcement.** Stage 1 lint rejects literal hex / px values for visual properties. The IR-native authoring path mostly sidesteps this concern (the renderer emits token-driven CSS), but custom HTML still goes through the gate.

**Token-override cascade.** `apply_token_override` mutates a single soul-layer token, recompiles the soul, and recompiles every affected slide / section so the change propagates without manual touch-ups.

---

## 8. Validation

Two stages, gated by `validation_depth`:

| Depth   | Stage 1 (≈50ms) | Stage 2 (≈800ms) | When it runs                                              |
|---------|-----------------|-------------------|-----------------------------------------------------------|
| `lint`  | ✓               | ✗                 | Every IR write (`add_slide`, `apply_*_node_edit`, …)      |
| `full`  | ✓               | ✓                 | `validate_slide` / `validate_section` opt-in              |
| `export`| ✓               | ✓ + per-issue export errors | `validate_deck_for_export` (gates PDF/PPTX/etc.)|

**Stage 1 — Static lint.** Token compliance, structural shape, network isolation, safe-area compliance, doc-only-node-in-slide rejection.

**Stage 2 — Render truth.** Playwright renders the HTML; checks WCAG contrast, overflow + clipping, rendered color sampling against tokens, text legibility.

Output is a `ValidationResult` with `issues`, a weighted `score` (tokens 30%, contrast 25%, typography 15%, spacing 15%, structural 15%), and a `validation_presentation` summary the App renders inline. `validate_deck_for_export` runs the export-blocking subset across every slide/section in a deck and fails the export call with structured per-issue context if anything trips.

---

## 9. The MCP App

The Svelte 5 SPA bundle (single-file `build/app/index.html`, served as `ui://deck-editor/index.html`) is the user-facing surface. It opens via `open_deck_editor` (deck-scoped) and navigates internally to:

- **Workspace** — decks list, souls list, asset library
- **Editor** (slide mode) — canvas + thumbnail rail + IR tree + action bar + comment drawer
- **DocumentEditor** (document mode) — paginated section preview, section list, IR tree, comment drawer
- **Export** — format-aware export panel with live PDF preview

### 9.1 Direct manipulation (v4.9+)

The canvas is an iframe sandbox. The structure bridge (`app/src/lib/structureBridge.ts`) injects affordances and posts messages back to the parent:

- **Click** a block in edit-layout mode → `select-block` (carries `irPath`, `morphable`, `siblingIndex`, `siblingCount`).
- **`+ Block ▾`** → opens the `NodeTypePicker` filtered by `availableForParent(parentPath)` — body offers leaves + compound layouts; inside `two_column.{left,right}` and grid rows offers leaves only (matches the IR's no-nesting rule).
- **`Change ▾`** → morphs the selected block to another text-bearing kind (paragraph / heading / list / quote / callout). Hidden for image / divider / compounds.
- **Move up/down · Duplicate · Delete** → routed through the deck store to `move_*_node` / `duplicate_*_node` / `remove_*_node` tools.
- **Inline rich-text edit** — `[data-ir-rt-field]` elements are click-to-edit; on commit, the App calls `apply_*_field_edit` with parsed `RichText`.

### 9.2 Comments

Comments are typed objects: `{ kind: 'revision' | 'question' | 'approval' | 'note', target: { kind: 'slide' | 'section' | 'pinned'; ir_path? }, body, author }`. Pin-mode lets the user click any block to anchor a comment to its `data-ir-path`. Sibling shifts after structural ops migrate the pin transparently; deletions orphan the comment to the slide/section level (so the body text stays visible in the rail). The agent reads them via `list_comments` between turns.

### 9.3 App-only tools

Visibility: `['app']` — invisible to the LLM, called from the App via the bridge.

| Tool                       | Purpose                                                              |
|----------------------------|----------------------------------------------------------------------|
| `apply_text_edit`          | Original v4.0 inline-text edit; legacy HTML path                     |
| `apply_slide_node_edit` (v4.6) | IR node mutation by path; revision-hash gated                    |
| `apply_section_node_edit`  | Same, for sections                                                   |
| `apply_slide_field_edit`   | Mutate a single rich-text field in place                             |
| `apply_section_field_edit` | Same, for sections                                                   |
| `apply_token_override`     | Mutate a soul token + cascade through dependent decks                |
| `apply_block_edit`         | Structured edit for chrome / TOC config / section meta               |
| `upload_asset_from_app`    | Base64 upload routed through the bridge — never enters LLM transcript |
| `get_thumbnail`            | Live thumbnails cached by revision hash                              |
| `set_active_workspace`     | App tells the server what the user is focused on                     |
| `add_comment_from_app`     | Comment with UI context (scroll position, viewport)                  |
| `get_editor_state`         | App's primary state-load tool                                        |

### 9.4 Concurrency

Every IR mutation passes an `expected_revision_hash`. The service compares against the current store value; on mismatch a `RevisionConflictError` returns the fresh state and the App re-prompts the user. Stage 1 runs **before** the store writes — failed validation never persists, so the agent never wakes up to a broken state.

---

## 10. Tool surface

~56 model-visible tools + 8 app-only tools as of v4.11.

### 10.1 Decks · slides · sections (CRUD)

`list_decks` · `create_deck` · `get_deck_summary` · `add_slide` · `update_slide` · `get_slide` · `remove_slide` · `reorder_slides` · `add_section` · `update_section` · `get_section` · `remove_section` · `reorder_sections` · `list_sections` · `update_document_meta` · `apply_recipe` · `compile_markdown`

### 10.2 IR structural ops (v4.9+)

For each of slide / section: `insert_*_node` · `remove_*_node` · `duplicate_*_node` · `move_*_node`. All accept `parent_path` + `position` (or `path` + `to_*` for move) and `new_node` validated against `SlideNodeSchema` / `SectionNodeSchema`. Server enforces leaf-only inside compound containers.

### 10.3 IR field-level edit

`apply_slide_node_edit` / `apply_section_node_edit` (replace a node by path) and `apply_slide_field_edit` / `apply_section_field_edit` (mutate one rich-text field in place). All revision-hash gated.

### 10.4 Souls

`register_design_soul` · `approve_design_soul` · `list_design_souls` · `get_design_soul` · `get_design_tokens` · `save_as_template`

### 10.5 Assets

`upload_asset` · `list_assets` · `get_asset` · `delete_asset`. Agents are pointed at `upload_asset_from_app` (app-only) for non-trivial binaries.

### 10.6 Comments

`list_comments` · `add_comment` · `resolve_comment`. Pin-mode targets carry `ir_path`.

### 10.7 Validation

`validate_slide` · `validate_section` · `validate_slide_ir` · `validate_section_ir` · `validate_deck_for_export`

### 10.8 Export

`render_preview` · `render_section_preview` · `export_pdf` · `export_pptx` · `export_html` · `export_google_slides`

PPTX and Google Slides reject document-mode decks with `format_not_exportable`. PDF defaults to `direct` mode for print, `image` mode for slides. Every export call self-runs `validate_deck_for_export` first; non-empty issue lists block the export and surface in the response.

### 10.9 Session / app

`get_session` · `open_deck_editor` · `list_resources` · `get_resource`

---

## 11. Resources & prompts

### 11.1 Resources (13 doc + 1 schema + 1 app bundle)

`pengui://docs/{overview, slide-format, design-souls, validation, assets, css-utilities, recipes, workflows, print-mode, charts-and-diagrams, document-mode, collaboration}` · `pengui://schema/slide-ir` · `ui://deck-editor/index.html`

### 11.2 Prompts (6)

`onboarding` · `create-presentation` · `create-document` · `create-print-document` · `design-soul-guide` · `slide-html-quickref`

The IR-first workflow prompts (`create-presentation`, `create-document`) lead with the IR schema and the `compile_markdown` shortcut for prose-heavy content.

---

## 12. compile_markdown (v4.10)

`compile_markdown` accepts a markdown string + optional `target` (deck/slide/section + parent path + position). The server compiles the markdown to leaf IR nodes (`heading`, `prose`, `list`, `quote`, `divider`) preserving rich-text marks. With `target`, nodes are inserted directly; without it, the IR is returned for the agent to splice itself.

This avoids the wasteful pattern of an agent emitting markdown then re-emitting the same content as a 15-node IR JSON — the server does the round-trip once. Pairs naturally with `toc` (markdown → headings → toc resolves them at compose time).

---

## 13. Compound layouts (v4.11)

The `NodeTypePicker` exposes six compound presets in addition to the seven leaves: `two_column_1_1` / `1_2` / `2_1`, `grid_2x1` / `2x2` / `3x1`. Each has a fixed default payload (one placeholder paragraph per cell) so the user has something selectable on the first click.

The picker is **container-aware**: `availableForParent` filters the catalogue by parent path. `body[]` shows leaves + layouts; inside `two_column.{left,right}` or grid rows shows leaves only. `Change ▾` is hidden on compounds (compound morph would discard cell content).

`kindOfNode` recognizes existing compound IR nodes and returns a representative preset kind (`two_column_1_1`, `grid_2x1`); morph targets are empty for compounds, so the action bar correctly hides the morph affordance via the bridge's `morphable` flag.

---

## 14. Error taxonomy

| Code                       | When                                                                         |
|----------------------------|------------------------------------------------------------------------------|
| `INVALID_INPUT`            | Schema rejection, leaf-only violation in compound, malformed path            |
| `RevisionConflictError`    | `expected_revision_hash` ≠ current; response includes fresh state            |
| `format_not_exportable`    | `export_pptx` / `export_google_slides` invoked on document-mode deck         |
| `unknown_format`           | `create_deck` with an unknown `format`                                       |
| `EDITOR_HTML_MUTATION_DISABLED` | `apply_text_edit` against an IR-authored slide                          |
| `DECK_EMPTY`               | `validate_deck_for_export` on a deck with no exportable units                 |
| `page_chrome_invalid_json` | `@page-chrome` directive contains malformed JSON                              |

---

## 15. Path to v5.0

5.0 is **WYSIWYG**. The remaining gap from v4.11:

| Theme                              | Current state                                    | What 5.0 needs                                                |
|------------------------------------|--------------------------------------------------|---------------------------------------------------------------|
| **Bidirectional state sync**       | App refetches on `ontoolresult` / `onhostcontextchanged` | Push-style invalidation per affected IR path; no full-state refetch |
| **Inline ratio / dimension edit**  | Compound layouts insert at fixed presets         | Drag column boundary; ratio dial on action bar                |
| **Compound morph**                 | Hidden for compounds (would lose cells)          | Lossless variant swap (1:1 ↔ 1:2 ↔ 2:1) and dimension swap (2×1 ↔ 2×2) |
| **Charts (ECharts)**               | None — out of scope until v4.12                  | First-class chart node; soul-token themed; SVG output         |
| **Block-level region anchoring**   | Comments target `ir_path` only                   | Bounding-box pins on figures / charts                         |
| **Multi-user**                     | Single-user revision-hash concurrency            | OT or CRDT for concurrent edits in shared sessions            |
| **Inline diagram authoring**       | Agent writes inline SVG following templates      | Structured diagram node + visual editor                       |

**v4.12 (next):** charts. Plan: ECharts via the IR (chart node carrying data + theme refs), SVG output styled with soul tokens, validator rule keyed off `chart` node type.

---

## 16. Backward compatibility

- Decks created before v4.5 (HTML-authored slides) still load and render. Mutating them via `apply_text_edit` works; `apply_*_node_edit` requires an IR-authored slide.
- Pre-v3 print decks (slide-per-page) load via the legacy reader; `scripts/migrate-legacy-print-deck.ts` converts them to v3 sections.
- Tool signatures gain optional fields; nothing is renamed or made required across releases.
- `data-ir-node-type` (v4.11) is editor-only — no compiler revision bump, no PPTX / export consequences.

---

## 17. Non-goals

- **Standalone web UI / REST surface.** The MCP App is the only user-facing UI. No `/ui/*` routes, no public HTTP endpoints beyond the MCP transport.
- **Mid-generation streaming.** Updates are visible at tool-call completion, not during.
- **Free-form contenteditable HTML editor.** Editing is structured via IR paths and rich-text fields. The agent stays the sole authority for layout.
- **Real-time multi-user collab.** Single user per deck; revision-hash concurrency.
- **Server-sent events / WebSocket push.** MCP host's `ontoolresult` and `onhostcontextchanged` are sufficient.
- **Auth, multi-tenant, or public hosting.** Local dev-tool model continues.
- **Mobile-optimised UI.** MCP App runs in Claude Desktop / other MCP-Apps-capable hosts; we follow whatever they support.

---

## Appendix — Project layout

```
pengui-slides/
├── src/                           # MCP server (Node + TypeScript)
│   ├── index.ts                   # CLI entry (stdio | http)
│   ├── server.ts                  # MCP server factory
│   ├── container.ts               # ServiceContainer
│   ├── domain/
│   │   ├── ir/                    # SlideIR / SectionIR — schema, compile, ops
│   │   │   ├── nodes.ts           # Zod schemas (LeafSlideNodeSchema, SlideNodeSchema)
│   │   │   ├── compile/           # IR → HTML renderers
│   │   │   └── operations/        # insert / remove / duplicate / move / replace + path-resolver
│   │   ├── decks/                 # Deck + slide service
│   │   ├── documents/             # Section service + DocumentComposer
│   │   ├── souls/                 # Soul lifecycle, token + recipe generation
│   │   ├── markdown/              # compile_markdown
│   │   ├── validation/            # Stage 1 (lint) + Stage 2 (Playwright)
│   │   ├── assets/                # Upload, resolve, lifecycle
│   │   ├── metadata/              # Embed, parse, export
│   │   ├── comments/              # Pin-mode comment service
│   │   └── rendering/             # Playwright pool, exporters (PPTX/PDF/HTML/GSlides)
│   ├── storage/                   # In-memory + file-backed stores
│   ├── tools/                     # MCP tool implementations (~56 + 8 app-only)
│   ├── resources/                 # MCP doc + schema resources
│   └── prompts/                   # MCP prompt templates
├── app/                           # MCP App (Svelte 5 SPA, single-file bundle)
│   └── src/
│       ├── routes/                # DeckEditorApp, Editor, DocumentEditor, Export, Workspace, Souls, Assets
│       ├── lib/                   # bridge, structureBridge, NodeTypePicker, BlockActionBar, primitives, …
│       └── stores/                # Client-side stores (deck, route)
├── tests/                         # Vitest suite (~1190 tests)
├── docs/                          # North Star, exploration notes
├── templates/                     # Reference HTML recipes (legacy + v4)
└── scripts/                       # Migration, e2e, build helpers
```

---

## Appendix — Document history

| Version | Doc | Coverage |
|---------|-----|----------|
| v1.x | (no spec) | Slide-only HTML pipeline |
| v2.0 | (predecessor of this file; rewritten) | Print mode + format primitive |
| v3.0 | [`SPEC-v3.md`](./SPEC-v3.md) | Continuous-document model for print |
| v4.0 proposal | [`SPEC-v4.md`](./SPEC-v4.md) | Deeper MCP App: slugs, comments, app-only upload |
| v4.5 exploration | [`docs/v5-slide-ir-exploration.md`](./docs/v5-slide-ir-exploration.md) | IR-first authoring exploration → as-shipped |
| v4.11 (current) | this document | Canonical as-built + path to v5.0 |
