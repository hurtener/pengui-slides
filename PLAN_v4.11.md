# v4.11 plan — "Compound layouts in direct manipulation"

One theme: extend the v4.9e `NodeTypePicker` so users can drop `two_column` and `grid` containers from the canvas, not just leaves. Today, compound layouts are agent-only territory — the IR + structural ops support them fully (`insertNodeAtPath` accepts containers into `body[]`; leaf-only is enforced inside `two_column.{left,right}` and `grid.cells[i]`), but the App's picker shows only leaves. v4.11 closes that gap.

**Charts deferred to v4.12** per the 2026-04-30 decision (memory: `project_roadmap_to_50.md`). Compound layouts is the smaller increment that leverages everything v4.9e shipped; charts are a meaty 2–3 week release that lands on a stable v4.11 base.

## Why this shape

Three reasons to do this in one focused release:

1. **The IR is ready.** `TwoColumnNodeSchema` and `GridNodeSchema` exist, `insertNodeAtPath` already routes into them, `data-ir-path` on every container root, leaf-only enforcement on inner containers — none of this needs more server work.
2. **The picker is ready.** v4.9e's `NodeTypePicker.svelte` already takes a filtered `availableKinds` list, and `BlockActionBar`'s `+ Block ▾` already drives it. Adding compound tiles is a catalogue extension plus container-aware filtering, not new UI scaffolding.
3. **It unblocks the next-most-common multi-block ask.** "Put text on the left and an image on the right" / "show four bullets in a 2×2 grid" are routine layout requests; today users have to ask the agent.

## Scope (one theme, three sub-tracks)

### Track A — Catalogue extension

`app/src/lib/nodeCatalogue.ts` gains compound entries. Catalogue surface grows from 7 leaves to 7 leaves + a small set of compound presets (the picker stays one click → commit; sub-flows are a v4.11.x polish).

| Kind | Tile label | Default payload |
|---|---|---|
| `two_column_1_1` | "Two columns (1:1)" | `{ type: 'two_column', ratio: '1:1', left: [paragraph], right: [paragraph] }` |
| `two_column_1_2` | "Two columns (1:2)" | same with `ratio: '1:2'` |
| `two_column_2_1` | "Two columns (2:1)" | same with `ratio: '2:1'` |
| `grid_2x2` | "Grid 2×2" | `{ type: 'grid', columns: 2, cells: [[p],[p],[p],[p]] }` |
| `grid_3x1` | "Grid 3×1" | `{ type: 'grid', columns: 3, cells: [[p],[p],[p]] }` |
| `grid_2x1` | "Grid 2×1" | `{ type: 'grid', columns: 2, cells: [[p],[p]] }` |

The default cell content is a single paragraph (`{ type: 'prose', body: [{ text: 'New paragraph — click to edit.' }] }`) so the user has something selectable + editable immediately. Empty cell arrays are schema-valid, but an empty `two_column` renders as two flexed empty divs — confusing. Defaults give the user a working layout on the first click.

### Track B — Container-aware filtering

Compounds belong in `body[]` only. Nesting a `two_column` inside `two_column.left` is rejected by `insertNodeAtPath` already (leaf-only check), but the picker should pre-filter so the user never sees an option that would 400.

- `availableForParent(['body'])` → leaves + compounds
- `availableForParent(['body', N, 'left'|'right'])` → leaves only (today's behavior, unchanged)
- `availableForParent(['body', N, 'cells'])` → leaves only (unchanged)
- `availableForParent([])` / unsupported → empty (unchanged)

Trivial change inside `availableForParent`. Two-line guard.

### Track C — Morphable detection hardening

v4.9e's bridge marks a block "morphable" iff it has a `[data-ir-rt-field]` descendant. That worked when only leaves were insertable, but compounds also have rt-field descendants (via their leaf children), so v4.11 would let users open `Change ▾` on a `two_column` only to see "This block can't be changed to a different type." after the IR fetch.

Two options:
1. **Add `data-ir-node-type` to the IR compiler** (the cleaner choice). Every node root carries `data-ir-node-type="two_column"` / `"prose"` / etc. The bridge's `morphable` check becomes `kindOf(t.dataset.irNodeType) !== null` — exact, no false positives.
2. **Tighten the rt-field query to a "direct rich-text owner" check.** Brittle and harder to reason about.

Lean option 1. The attribute is editor-only (compiler emits it on the same path that emits `data-ir-path`), no PPTX / export consequences. No `CURRENT_COMPILER_REVISION` bump because the rendered visual output is unchanged — only an attribute is added.

## Server work

None. The IR + structural ops + leaf-only enforcement + path resolver + comment migration all already handle compounds. The only server-adjacent change is the compiler's `data-ir-node-type` attribute (Track C).

## App work

- `nodeCatalogue.ts`:
  - Add the six compound entries above to `CATALOGUE`.
  - Update `LeafNodeKind` union (rename to `NodeKind` since it's no longer leaves-only) — touches all consumers.
  - `defaultNodePayload(kind)` extends with the six new branches.
  - `kindOfNode` adds `'two_column'` / `'grid'` mappings.
  - `morphTargetsFor('two_column' | 'grid')` returns `[]` (compounds are non-morphable for v4.11).
  - `availableForParent` keeps current container classification but adds compounds to the `'body'` allow-list.
- `NodeTypePicker.svelte` — no structural changes; the new tiles flow through automatically. The shortcut letters need attention (current letters are `p / h / l / q / c / i / d`; compounds would need `2 / 3 / g` — single chars must still be unique, modifier-free).
- `Editor.svelte` / `DocumentEditor.svelte` — `handleInsertPick` already routes any catalogue kind through `defaultNodePayload` → `insert_*_node`. No code change.

## Out of scope (defer)

- **Sub-flow ratio / dimension chooser** (e.g. "Two columns" → ratio dial → commit). v4.11 ships hard-coded variants as tiles for simplicity. Sub-flow is a v4.11.x polish if users ask.
- **Inserting compounds into other compounds.** Forbidden by the IR's leaf-only rule; the picker pre-filter enforces this. Don't relax.
- **Editing column ratio after insert.** The user re-inserts a different variant and deletes the old one. Inline ratio adjustment is a v5.0 question (single-column-or-double toggle on the action bar would be the natural extension).
- **Inline grid resize** (drag column boundary). v5.0+.
- **Charts (ECharts).** v4.12.

## Acceptance criteria

1. **Insert a two_column (1:1) into body[]** → IR has `body[N] = { type: 'two_column', ratio: '1:1', left: [prose], right: [prose] }`. The new container becomes selected and its action bar shows it. Each pre-filled paragraph is independently click-to-edit.
2. **Insert a 2×2 grid into body[]** → IR has the grid with 4 prose cells. Each cell is independently selectable + editable.
3. **`+ Block ▾` inside a `two_column.left`** → picker filters to leaves only (no `two_column` / `grid` tiles).
4. **`Change ▾` on a `two_column`** → button is hidden (Track C delivers this; pre-fix it would have shown then opened an empty picker).
5. **Drag-and-drop, move-up/down, duplicate, delete** all work on a compound at body level.
6. **Doc-mode parity** — same flows work in `DocumentEditor.svelte` for sections.
7. **Tests** — `tests/app/node-catalogue.test.ts` extends with ~15 new cases (every default payload Zod-validates as `LeafSlideNodeSchema` for leaves OR `SlideNodeSchema` for compounds; container filter rules; `kindOfNode` for compounds; `morphTargetsFor` returns empty). One bridge-side test for the `data-ir-node-type` attribute. Total: ≥1190 tests pass.

## Open design questions (decide during implementation)

1. **Should the picker group leaves vs compounds?** A subtle visual divider between "Block" and "Layout" tiles would help users find compounds. Lean yes — extend `CatalogueEntry` with an optional `group` field, render headers when present.
2. **Default cell content.** A single empty-ish paragraph means the user has to delete the placeholder text on every cell. Alternatives: leave cells empty (renders as bare flex divs — confusing), or use a single empty run (renders invisible until clicked — also confusing). Lean keep the placeholder; cost is one extra click per cell to clear, which is normal authoring.
3. **Keyboard shortcut letters for compounds.** `2` for two-columns and `g` for grid? But `2` isn't a letter. Either accept digit shortcuts (`2`, `3`, `4` for grid columns?) or skip shortcuts on compound tiles. Lean skip — compounds are less frequent, the cost is small.
4. **Selecting a compound vs selecting its inner leaves.** Today click resolves to the closest `[data-ir-path]`. A click inside a `two_column.left` paragraph hits the paragraph; a click on the gap between columns hits the `two_column`. That's already correct. Verify in manual testing.

## Pre-flight tasks

- [ ] App: rename `LeafNodeKind` → `NodeKind` in `nodeCatalogue.ts`. Trace every consumer (Editor, DocumentEditor, NodeTypePicker) — fully mechanical.
- [ ] App: add the six compound entries + update `defaultNodePayload` + `kindOfNode` + `availableForParent`.
- [ ] App: extend `tests/app/node-catalogue.test.ts` covering compound payloads (Zod-validated against the full discriminated `SlideNodeSchema` union).
- [ ] Server: emit `data-ir-node-type` from the compiler's per-node renderer; bridge reads it for the morphable check.
- [ ] App: bridge `morphable` computation switches from `querySelector('[data-ir-rt-field]')` to `kindOf(t.dataset.irNodeType)`-based.
- [ ] Manual round-trip: insert two_column → click each side → edit text → drag the whole compound → delete it. Repeat for grid 2×2.

## Status

Not started. Suggested branch: `v4.11-compound-layouts`.
