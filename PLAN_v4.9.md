# v4.9 plan — "Direct manipulation"

One theme: the MCP App stops being a preview and becomes an **editor**. The user can reorder, insert, delete, duplicate IR nodes, and format rich text inline — all through direct manipulation, all wired through the same IR-path coordinate system v4.8.5 used for pin-to-element. Pin-to-element survives unchanged; it becomes the *complementary* read channel ("ask the agent to do this") next to direct manipulation ("do it yourself").

**Charts (Apache ECharts) deferred to v4.10.** Bundling charts here would violate the one-theme-per-release rule (memory: `project_roadmap_to_50.md`) and the work is mostly orthogonal anyway.

## Why this shape (svedit influence)

[svedit.dev](https://svedit.dev) — a Svelte-native structured-editor library — validated three patterns we should adopt verbatim:

1. **JSON node graph as the source of truth.** Editing manipulates the graph directly; the rendered HTML is a projection. We already have this (SlideIR + `data-ir-path`); v4.9 is wiring the App to mutate the graph instead of just reading it.
2. **Node carets — positions *between* nodes.** Selecting a gap and pressing Enter inserts a new node; Backspace at a gap deletes the preceding one. This is the "structured-block editing" the WYSIWYG-compound filter (memory: `feedback_wysiwyg_compound_filter.md`) explicitly favors.
3. **No third-party editor framework.** svedit avoids ProseMirror / Slate / contentEditable-as-engine in ~2000 LOC. We do the same — we already render through soul-tokenized HTML, so we layer minimal interaction on top, not a whole editor stack.

What we **don't** adopt: svedit's annotation-node model for rich text (annotations as separate nodes with `start_offset` / `end_offset` referring to text by id). Our existing **run-based** RichText (`[{ text, bold?, italic?, link?, color?, … }]`) is simpler, the agent already uses it, and `apply_slide_node_edit` already round-trips it cleanly. Switching is a v5.0 question, not v4.9.

## Scope (one theme, three sub-tracks)

### Part A — Structural manipulation (body[] reordering, insert, delete, duplicate)

Five new MCP tools — each maps 1:1 to a single IR-path mutation, mirrors v4.6's `apply_slide_node_edit` ergonomics, and surfaces a sibling for sections:

| Tool | Input | What it does |
|---|---|---|
| `insert_slide_node` | `slide_id, parent_path, position, new_node` | Insert into `body` / `two_column.{left,right}` / `grid.cells[i]` at index. |
| `remove_slide_node` | `slide_id, ir_path` | Delete the node at the path. |
| `move_slide_node` | `slide_id, from_path, to_parent_path, to_position` | Move within or across containers (subject to leaf-only rules). |
| `duplicate_slide_node` | `slide_id, ir_path, position?` | Clone after the source by default; `position` overrides. |
| (existing) `apply_slide_node_edit` | unchanged | Stays the in-place patch verb. |

Same five for `..._section_node`. All five reuse the leaf-only enforcement and mode-aware lint already in place (v4.8 / v4.8.5).

Server work:
- New IR operations in `src/domain/ir/operations/`: `insert-node.ts`, `remove-node.ts`, `move-node.ts`, `duplicate-node.ts` — pure functions over `IRPath`, returning new roots.
- `DeckService.applySlideStructuralOp(...)` and `DocumentService.applySectionStructuralOp(...)` — thin wrappers that route to the right operation, then recompile + revalidate.
- One mode-aware lint pass per write (already wired through `updateSlide` / `updateSection`).
- Ratio / shape consistency checks — moving a leaf into a `grid.cells` row mustn't break `cells.length % columns === 0`. Surfaced as `INVALID_INPUT` at the operation, not silently corrected.

App work:
- Drag handles overlaid on every `[data-ir-path]` element (positioned via `getBoundingClientRect()` on iframe DOM, same trick as the v4.8.5 pin decorations).
- Drop targets: thin "node caret" zones between every pair of siblings + before-first / after-last per container.
- Action menu on each node: delete, duplicate, change-type (hero ↔ heading ↔ prose for text-ish; image as a separate switcher).
- "+" caret reveals a node-type picker. Default suggestions per context (in body: hero / heading / prose / list / image; in `two_column.left`: leaf-only filtered list).

### Part B — Inline rich-text formatting

Today the user can pin a comment that says "make this bold" and the agent applies it via `apply_slide_node_edit`. v4.9 lets the user just **select-and-bold**.

Infrastructure:
- The slide iframe gets `contentEditable="true"` on text-bearing nodes only (hero title/eyebrow/subtitle, prose body, list items, callout title/body, quote body/attribution, table cell, heading text, bibliography entry text).
- A floating format toolbar (DOM-positioned over the iframe) appears on non-empty selection: **bold, italic, code, strike, link, color** (color = semantic role, not hex — same `ColorRoleSchema` the agent uses).
- On `blur` or Enter, serialize the contentEditable DOM back to a RichText array via a new `parseRichText(domNode)` — the inverse of `renderRichText`. Diff against the original. If changed, persist via `apply_slide_node_edit`.

The serializer is the load-bearing complexity. Edge cases:
- Nested formatting: `<strong><em>x</em></strong>` → one run with `bold + italic` set.
- Whitespace normalization (browsers collapse aggressively).
- IME composition events (don't emit edits mid-composition).
- Paste handling: strip everything except the formatting flags we recognize. Foreign formatting (font-family, size) drops silently.
- Links: `<a href>` → `link` flag on the run; href is preserved verbatim.
- `<br>` → newline character in run text; multi-`<br>` collapses to a single `\n`.

Why not a sub-tool like `apply_rich_text_edit` for partial-field updates? The App always has the full node in hand (it just rendered it), so emitting the whole replacement node via `apply_slide_node_edit` is equivalent and avoids API surface bloat. The agent path is unchanged.

**Tradeoff:** `contentEditable` is famously fiddly. We accept one well-known set of footguns in exchange for free IME / a11y / keyboard handling, and we keep our compiler the only authority on what valid output looks like (the parser only needs to recognize what `renderRichText` emits — every other input is normalized away).

### Part C — Inline asset insertion

The "+ between" caret from Part A surfaces an asset picker as one of the node-type options. Picking an asset:
1. Calls `list_assets` (already exists; scoped to the deck's soul + the deck itself).
2. User picks → composes `{ type: "image", asset_id: "..." }` → calls `insert_slide_node`.
3. Optional inline upload: file-drop on the caret triggers `upload_asset_from_app` (already exists), then auto-inserts.

This is the smallest sub-track — it's almost entirely the union of Part A's `insert_slide_node` and existing asset tools.

**Out of scope for v4.9:** inline images *within* a RichText run (icon-next-to-text). Today our RichText is strictly textual; supporting inline assets requires extending the run schema. Defer to v5.0+ alongside the broader annotation-model question.

## Pin-to-element compatibility (load-bearing)

Direct manipulation is **complementary**, not a replacement. The user must always be able to:
- Drop a pin on a node ("agent: this title isn't right, please rewrite") and continue.
- Edit a node directly when they know what they want.

Wiring:
- Pin-mode and edit-mode are mutually exclusive at the slide level (toggle in the toolbar). When pin-mode is on, `contentEditable` is `false` everywhere; when off, text-bearing nodes are editable.
- A user who pins, gets an agent reply, then wants to refine — toggles edit-mode and types. No state loss.
- Pinned nodes (with active comments) keep their dashed mint outline in edit mode too — visible as a "the agent's looking at this" hint.
- The agent never has to know which mode is active. It always edits via `apply_slide_node_edit` / `insert_slide_node` / etc. The user's manual edits show up in the IR diff exactly the same way.

## Acceptance criteria

1. **Structural ops round-trip:** drag a hero from body[2] to body[5], the IR has it at body[5], the html re-renders with `data-ir-path="body,5"`, the next agent `list_comments` / `apply_slide_node_edit` sees it at the new path.
2. **Bold a word:** select "Q3" inside a hero title, click Bold in the toolbar, the IR's `title` field has the new run shape `[{ text: "Hello " }, { text: "Q3", bold: true }]`. Survives a reload.
3. **Insert image inline:** open the "+" caret between two prose nodes, pick an asset from the deck's library, an `image` node lands at the chosen position; the asset is referenced by `asset_id`, not inlined as base64.
4. **Pin survives:** an existing pin on `body[2]` keeps its outline + drawer entry after the user drags `body[2]` to `body[5]`. The pin's `ir_path` is updated by the move op (or — simpler — the pin gets invalidated with a clear UI hint, agent re-reads it next turn).
5. **Mode toggle:** entering edit-mode disables pin-mode in the same UI gesture; entering pin-mode disables `contentEditable` everywhere. Never both on at once.
6. **Doc-mode parity:** the same five structural ops + the same rich-text editing work in `DocumentEditor.svelte` for sections, not just for slides.
7. **957 → ~1020 unit tests pass; e2e green.**
8. **Bundle hygiene:** the App's iframe must NOT ship a third-party editor library. The format toolbar + caret UI is hand-rolled in Svelte (svedit-influenced, not svedit-imported).

## Open design questions (decide during implementation)

1. **Pin-path migration on move.** Two options:
   - (a) The move op rewrites every comment whose `ir_path` matches the moved subtree (deterministic, small surface).
   - (b) Comments are immutable; a moved node leaves stale pins, which the agent sees and resolves with "the node you commented on moved to body[5]". Less code, more agent confusion.
   - **Lean (a).** The migration is mechanical and one place owns it.

2. **Rich-text serializer placement.** Option:
   - In the App (Svelte, `app/src/lib/parseRichText.ts`) — keeps server simple but duplicates schema knowledge.
   - On the server (`src/domain/ir/compile/rich-text-parser.ts`) — single source of truth, App ships HTML over the wire and gets RichText back.
   - **Lean server-side parser** + a tiny App-side wrapper that calls a new tool `parse_rich_text_html`. Or just do it App-side and trust the unit tests — TBD.

3. **Move within `grid.cells` 2D array.** The path shape `["body", 2, "cells", row, col]` makes "move from cell (1,0) to cell (0,2)" a multi-step rebalance (cells are flat arrays). Worth a focused test fixture.

4. **Undo/redo.** Out of v4.9 scope — the agent's revision history (already exists at deck level) covers the use case. Per-keystroke undo is a v5.0 question.

## Out of scope (defer)

- **Apache ECharts node** — v4.10. JSON config primitive, server-side SVG rendering with soul-theme bridge, PNG fallback for PPTX. Mostly orthogonal to v4.9.
- **Inline assets in RichText** (icon-next-to-text) — v5.0. Requires extending the run schema; the annotation-model question is best decided once.
- **Per-keystroke undo/redo** — v5.0. Revision history is enough for now.
- **Real-time multiplayer** — out of roadmap. Single-user editor, structured comments are the collaboration channel.
- **`compile_markdown`** — still deferred (memory: `project_markdown_plan.md`); slot for v4.9.x patch or v4.10.

## Pre-flight tasks (v4.9 kickoff)

- [ ] Server: scaffold `src/domain/ir/operations/{insert,remove,move,duplicate}-node.ts` + tests (mirror of `replace-node.ts`).
- [ ] Server: register five new MCP tools per mode (slide + section), wire through `DeckService` / `DocumentService`.
- [ ] App: extract the v4.8.5 pin-decoration positioning trick into a reusable `useNodeOverlay` Svelte primitive — Part A's drag handles + caret zones + action menus all need it.
- [ ] App: prototype `parseRichText` against fixtures derived from `renderRichText` golden outputs.
- [ ] App: pin/edit mode toggle wiring + the "ir_path migration on move" pin-path rewrite.

## Status (2026-04-28)

**Shipped end-to-end:**
- **Part A server tools** — eight MCP tools (`insert_slide_node` / `remove_slide_node` / `duplicate_slide_node` / `move_slide_node` and matching `*_section_node` quartet), each routing through `DeckService` / `DocumentService` with mode-aware lint + revision tracking. Pure IR operations live in `src/domain/ir/operations/{insert,remove,duplicate,move,path-migration,path-resolver}.ts`. 34 unit tests (structural-ops + path-migration).
- **Part A App (slides + sections)** — Structure-mode toggle on both editors, hover-overlay action toolbar (↑/↓/⧉/+T/+▣/✕) injected into the iframe via the shared `lib/structureBridge.ts`. Sandbox now allows scripts in DocumentEditor; SlideCanvas reuses the same script. Default text-insert stamps a `prose` node carrying `[{ text: 'New paragraph' }]`.
- **Drag-and-drop reordering** — In structure mode every `[data-ir-path]` is `draggable=true`. `dragstart` flags the source, `dragover` paints a mint underline on the candidate target, `drop` postMessages a `structure-reorder` event with src + dest paths. The parent translates that into `deck.moveSlideNode(src, destParent, destIndex + 1)` for slides and `bridge.moveSectionNode(...)` for sections. Cross-container drops are allowed when the leaf-only rule passes; the server returns `INVALID_INPUT` otherwise. Front-end pre-checks reject drops into the source's own subtree.
- **Part B — Rich-text formatting** — `app/src/lib/parseRichText.ts` walks the DOM (`<strong>` / `<em>` / `<code>` / `<s>` / `<sup>` / `<sub>` / `<a href>` / `<span class="pengui-text-…">`) and emits `TextRun[]` matching `src/domain/ir/rich-text.ts`. The in-iframe bridge shows a floating selection toolbar (B / I / S / `</>` / clear) when a contentEditable selection is non-empty outside pin/structure modes. SlideCanvas's text-edit click handler now also matches `p.pengui-prose[data-ir-path]` (IR-authored slides had no inline edit before); on blur it parses the prose node's HTML and emits `oncommitrichtext` which routes through `apply_slide_node_edit` with a `{ type: 'prose', body }` new_node. 16 parser tests + 11 `renderRichText → parseRichText` round-trip tests pin the symmetry.
- **Part C — Inline asset insertion** — Structure-mode toolbar grew an `+▣` button that emits `insert_image_after`. The Editor opens a centered asset-picker dialog listing `role: 'content'` assets via `bridge.listAssets`; click a tile and an `image` IR node is inserted at `parent[index + 1]` of the addressed path. Asset thumbnails use the `data_base64` from the bridge response. Doc-mode falls back to inserting a prose block for image actions until the section-side picker ships in v4.9b.
- **Pin compatibility** — Mutual exclusion between pin-mode and structure-mode; comment `ir_path` migration runs at the tool layer after every structural op (`commentService.migrateIrPathsForContainer`). Five round-trip tests in `tests/unit/domain/comments/comment-migration-roundtrip.test.ts` lock insert / remove / move / duplicate semantics. The Editor's `commentedIrPaths` effect re-keys on `revisionHash`.

**Deferred to v4.9b / future:**
- Inline rich-text editing on table cells (rows[r][c] addressing). Cells are still agent-edited.
- Section-side TOC and bibliography rich-text editing.

## Polish pass (2026-04-28 — pre-user-test)

- **End-user terminology** — every visible internal name renamed to block-level vocabulary. "Structure mode" → "Edit layout"; "Exit structure" → "Done"; "Pin to node" → "Pin to a block"; "Click a node" → "Click a block in the slide"; "Inserted prose block" → "Paragraph added"; "Cannot drop a node into its own subtree" → "Can't drop a block onto itself"; "Already at the top of its container" → "Already at the top". Status messages auto-clear after 3.5s.
- **Affordance cursors injected via shared CSS** — `cursor:text` on prose blocks (rich-text editing), `cursor:grab` on every IR block in edit-layout mode, `cursor:crosshair` in pin mode. Each rule keyed off `documentElement.dataset.pengui*Mode` so the affordance is always in sync with the active mode.
- **Toolbar icons + tooltips** — explicit tooltips on every action; rich-text strike button now renders `S` with `text-decoration: line-through` so the icon previews the result.
- **Sandbox-safe delete confirmation** — moved `confirm('Delete this block?')` to the parent (sandboxed iframe without `allow-modals` blocks `window.confirm`).
- **Edit-layout button gating** — hidden when the selected slide is `legacy_html` / `document_v1` (no `data-ir-path` markers to bind to). The mode auto-exits when navigating to a non-IR slide.
- **Empty rich-text body fallback** — wiping all text in a prose block now commits a single empty run instead of an empty array, so the node remains targetable for re-editing.
- **Section asset picker parity** — extracted `AssetPicker.svelte` and used it from both Editor and DocumentEditor, so `+ 🖼` works the same in both modes (was previously falling back to a prose insert in document mode with a "v4.9b" placeholder message).
- **Mode switch hides the rich-text toolbar** — flipping into pin or edit-layout mode while a selection is active now hides the floating B/I/S toolbar instead of leaving it stranded.
- **Bridge clean-up on mode-off** — exiting edit-layout now strips `draggable` / `cursor` / drop-indicator side-effects from every touched block via a single MutationObserver-driven `deactivateStructureMode()` pass.
- **Toolbar position clamping** — both the action toolbar and the rich-text toolbar are now clamped to the iframe viewport so they don't disappear off the right edge for blocks near the canvas margin.
- **Shared helpers** — `app/src/lib/irPath.ts` exports `decodeIrPath` + `isPathInside` (used by both editors); `app/src/lib/structureBridge.ts` is the single source of truth for the in-iframe DOM script.

## v4.9c — Click-to-select + universal rich-text (2026-04-28)

User testing of v4.9b surfaced three killing UX problems:
1. The hover-attached toolbar inside the iframe blocked adjacent blocks — moving the cursor toward the toolbar crossed other blocks, repositioning the toolbar mid-flight; impossible to reach.
2. Native HTML5 drag preview snapshotted the full block (1500px wide on a 1920 slide); drag overlay was huge.
3. Rich-text editing only worked on `prose` blocks. Headings, hero titles, list items, callouts, etc. silently did nothing on click.

v4.9c rewrites the action surface around two ideas:

- **Click-to-select with parent-DOM action bar.** A new `BlockActionBar.svelte` component renders below the canvas card (in parent DOM, NOT inside the iframe) and shows the move / duplicate / add / delete actions for the currently-selected block. Selection persists until you click a different block or click empty canvas (or hit "Deselect"). The bar is sized in parent-DOM units so it's always readable, never overlaps slide content, and works identically in slide and document editors.
- **Rich-text on every RichText IR field.** The IR compiler now emits `data-ir-rt-field="<name>"` on every text-bearing element it produces — `eyebrow`, `title`, `subtitle`, `body`, `text`, `items[N]`, `attribution`, `caption`. The bridge's click handler activates `contentEditable` on any of those, postMessages `{ type: 'rt-field-commit', irPath, field, html }` on blur. Parents parse the HTML via `parseRichTextFromHtml` and route through the new `apply_slide_field_edit` / `apply_section_field_edit` MCP tools, which patch a single named field on the IR node — never re-emitting the whole node. Compiler revision bumped to 6.

Server changes:
- `src/domain/ir/operations/set-field.ts` — `setNodeFieldAtPath(root, path, field, value)` with `field` grammar `"name"` or `"name[index]"`. Pure function, returns new root.
- `DeckService.applySlideFieldEdit(...)` and `DocumentService.applySectionFieldEdit(...)` route through the existing `updateSlide` / `updateSection` pipeline, so mode-aware lint and revision tracking still run.
- Two new MCP tools registered: `apply_slide_field_edit`, `apply_section_field_edit`. The section variant joins the `SECTION_MUTATING_TOOL_NAMES` contract list.
- Compile tests updated to expect the new attributes.

App changes:
- `BlockActionBar.svelte` — new parent-DOM toolbar.
- `structureBridge.ts` — hover-attached in-iframe toolbar removed; replaced with click-to-select postMessages and a click-to-edit-text path that postMessages `rt-field-commit`. Hover paints a light dashed outline; selection paints a solid mint outline driven by `data-pengui-selected-path` synced from the parent. The rich-text formatting toolbar (B / I / S / `</>` / clear) and the inverse-scale fix from v4.9b stay.
- `SlideCanvas.svelte` and `DocumentEditor.svelte` — both gained `selectedIrPath` state; the iframe selection outline is driven by writing `documentElement.dataset.penguiSelectedPath`. Both wire `runBlockAction(...)` to `BlockActionBar` callbacks. The duplicate parent-side rich-text edit path is gone — the bridge owns it now, single source of truth.
- `decode-ir-path` / `isPathInside` helpers and `parseRichTextFromHtml` are reused by both routes.

The action bar buttons appear at native-DOM size, drag-and-drop has a custom "Moving: …" preview chip (from v4.9b), and clicking *any* visible text on an IR-authored slide now enters rich-text edit mode.

Tests: 103 files / 1080 passing. New `tests/unit/domain/ir/operations/set-field.test.ts` (9 tests) covers field-set semantics. Existing compile tests updated for the new `data-ir-rt-field` attributes.

## v4.9e — Node-type picker + block-type changer (planned, 2026-04-29)

v4.9d closed the direct-manipulation primitives (select, edit text, color, move, delete, insert paragraph/image). v4.9e closes the **breadth gap**: today the canvas can only insert two block types and can't morph what's already there. After v4.9e the user picks from the full leaf catalogue when inserting, and reshapes a selected block into any compatible sibling without leaving direct manipulation.

This is squarely on the WYSIWYG-compound axis (memory: `feedback_wysiwyg_compound_filter.md`). Each new affordance is a structured-block primitive, not a HTML-style toolbar.

### Goal

Replace `BlockActionBar`'s `+ Paragraph` / `+ Image` pair with a single `+ Block ▾` opening a contextual node-type picker, and add a `Change ▾` button that morphs the selected block to a compatible target type, preserving its primary RichText content.

### Scope

**1. Node-type picker (insert).**
- New `app/src/lib/NodeTypePicker.svelte` — modal/popover similar in style to `AssetPicker.svelte`. Grouped tile grid:
  - **Text:** Paragraph · Heading (h2 default + h1/h3/h4 sub-options) · List (bullet/numbered/checklist) · Quote · Callout (note/tip/warning/important)
  - **Media:** Image · Divider
- Replaces the two existing buttons with one `+ Block ▾`. Picking a type composes a default IR node with placeholder RichText and calls `insert_*_node` at `parent + lastSeg + 1`. Image picks open the existing `AssetPicker` as a second step.
- After the insert returns, the new block becomes selected (parent reuses the existing select-block dataset push), so `Change ▾` and rich-text edit are immediately available.

**2. Block-type changer (morph).**
- New `Change ▾` button in `BlockActionBar`, visible only on a block whose type is in the morphable set.
- Opens a sibling popover listing **compatible** target types only — the App's pre-filter mirrors the server's leaf-only rules but is purely advisory; the server stays the gate.
- Picking a target composes a `new_node` payload that ports the source block's primary RichText field, then routes through `apply_slide_node_edit` / `apply_section_node_edit`. No new MCP tool — the existing `apply_*_node_edit` already replaces a node in place.
- Default morph mappings (preserve content):

| Source field          | → Target              | Mapping                                         |
|-----------------------|----------------------|-------------------------------------------------|
| `prose.body`          | `heading.text`       | RichText copied verbatim, `level=2` default     |
| `heading.text`        | `prose.body`         | RichText copied verbatim, `align` dropped       |
| `prose.body`          | `quote.body`         | RichText copied; `attribution` left empty       |
| `quote.body`          | `prose.body`         | RichText copied; attribution discarded (warn)   |
| `prose.body`          | `list.items[0]`      | New list with one item == source body, bullet   |
| `list.items[N]`       | `prose.body`         | Items joined with newline runs                  |
| `prose.body`          | `callout.body`       | RichText → body; `kind=note` default; no title  |
| `callout.body`        | `prose.body`         | body copied; `title` + `kind` dropped (warn)    |
| `heading.text` ↔ `quote.body` ↔ `callout.body` | (all combinations) | Routed via the four cases above |

- A short `setStructureStatus(...)` toast surfaces "Title dropped." / "Attribution dropped." when a morph discards data the user might miss.

**3. Container-aware filter.**
- `parent_path` segment dictates which leaf types the picker offers:
  - `body[]` — full leaf list except hero (hero is cover-slide territory).
  - `two_column.{left|right}` — leaf-only filter (already enforced server-side); same allow-list.
  - `grid.cells[]` — leaf-only.
  - `toc` / `bibliography` — pickers hidden (composite content owned by their parent).
- Filter rules live in a new `app/src/lib/nodeCatalogue.ts` so both editors share them.

### Out of scope (defer)

- **Inserting compound layouts** (`two_column`, `grid`) from the picker — needs sub-positioning UX, deferred to v4.10 alongside charts.
- **Inserting `table`** — needs row/col input dialog. Sticks with agent-driven creation for now; once placed, cell-level rich-text editing remains a v5.0 question.
- **Auto-enter rich-text edit on insert.** Tempting (insert a heading → cursor lands inside, ready to type), but commits would race with the structural insert that just happened. Stage as a v4.9f polish if users ask.
- **List-item nesting (Tab / Shift-Tab).** Lists stay flat in v4.9e. Nested lists are a v5.0 question.
- **Hero morph.** Hero is a cover-slide primitive; promoting/demoting hero ↔ heading is more about slide semantics than block editing. Skip until needed.
- **`compile_markdown` tool** — still slotted for v4.10 (memory: `project_markdown_plan.md`). Doesn't compete with the manipulation loop.

### Server work

- **No new IR ops, no new MCP tools.** Insert reuses `insert_*_node`; morph reuses `apply_*_node_edit`.
- **No compiler revision bump** — this round emits no new HTML attributes; the IR contract is unchanged.
- One review pass on the leaf-only validators to confirm they reject any picker-composed node that lands in a wrong container (e.g., trying to insert `two_column` into `two_column.left`). Already covered by existing tests; spot-check.

### App work

- `app/src/lib/nodeCatalogue.ts` — new module exporting:
  - `LeafNodeKind` enum (paragraph / heading / list / quote / callout / image / divider).
  - `defaultNodePayload(kind, options)` — placeholder content composers.
  - `morphTo(sourceNode, targetKind)` — returns `{ newNode, droppedFields }`.
  - `availableForParent(parentPathTail)` — array of allowed kinds for a given container.
- `app/src/lib/NodeTypePicker.svelte` — popover grid, keyboard-navigable (arrow keys + Enter), `data-pengui-overlay="1"` so the bridge ignores its clicks.
- `app/src/lib/BlockActionBar.svelte` — replace the two `+` buttons with `+ Block ▾`; add `Change ▾`. Hide `Change ▾` when the selected block isn't morphable (image / divider / table — for now).
- `Editor.svelte` / `DocumentEditor.svelte` — new `runInsertPicker()` and `runMorph()` handlers; dropped-field toasts via existing `setStructureStatus`.
- The bridge needs no changes — picker lives in parent DOM, like the action bar.

### Acceptance criteria

1. Selecting a paragraph → `Change ▾` → `Heading h2` → IR replaces the `prose` with a `heading` whose `text` equals the source `body`. Block stays selected at the same `data-ir-path`. Rich-text edit on the new heading works immediately.
2. `+ Block ▾` between two siblings shows the catalogue. Picking `Quote` inserts a `quote` block with `body = [{ text: "Quoted text" }]`, no attribution, and selects it.
3. In a `two_column.left` container, `+ Block ▾` does **not** offer `two_column` / `grid` / `toc` (leaf-only).
4. Morphing a `quote` with non-empty `attribution` to `prose` shows `"Attribution dropped."` for ~3.5s.
5. Section parity: every behaviour above works identically in `DocumentEditor.svelte`.
6. Tests: `+15-25` unit tests for `nodeCatalogue.ts` (default payloads + morph mappings + container filtering). Existing 1080 still pass.

### Open questions

1. **Default heading level on insert/morph.** `h2` matches the most common content-slide pattern, but heading-from-prose in a slide that already has an `h1` could look weird. Lean: always default `h2`, let the user step it via a level selector inside the heading picker entry.
2. **List style on insert/morph.** Default `bullet`. The picker offers `bullet | numbered | checklist` as a sub-radio inside the list tile — small enough not to need a separate dialog.
3. **Callout kind on insert.** Default `note`. Same sub-radio pattern as list style.
4. **Picker UX: tile grid vs flat menu.** Tile grid is friendlier for first-time use (icons + labels), flat menu is faster for repeat use. Lean tile grid with keyboard shortcut hints (`P` for paragraph, `H` for heading, etc.) for power users — implementation cost the same.

### Pre-flight tasks

- [ ] App: scaffold `nodeCatalogue.ts` with payload composers + morph mappings, fully unit-tested before any UI work.
- [ ] App: build `NodeTypePicker.svelte` with hard-coded catalogue first, wire to the catalogue module second.
- [ ] App: replace `BlockActionBar` `+ Paragraph` / `+ Image` with `+ Block ▾`. Keep `+ Image` as a quick-action shortcut iff it's a high-frequency insert (revisit after dogfooding).
- [ ] App: add `Change ▾` with the morph short-list. Toast on dropped-field morphs.
- [ ] Manual round-trip in Claude Desktop: paragraph → heading → list → quote → callout → paragraph; commits stay clean, IR diffs make sense.
