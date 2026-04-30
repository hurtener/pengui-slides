# v4.10 plan — "Universal pinning + markdown ingestion"

One theme: close the slide↔section **authoring-parity gap** that v4.9 left open, and add a server-side fast-path from markdown into the IR. Both tracks reuse v4.9's pipes; neither requires new IR primitives.

**Charts (Apache ECharts) deferred to v4.11.** They're a bigger lift (server-side rendering, theme bridging, PNG fallback for PPTX) and would violate the one-theme-per-release rule (memory: `project_roadmap_to_50.md`). Markdown is the smaller content-velocity primitive that complements direct manipulation; charts deserve their own focused release.

## Why this shape

v4.9 wired direct manipulation end to end — click-to-select, action bar, rich-text edit, color picker, drag-and-drop, node-type picker, block-type morph — but only for **slides**. Sections got insert / remove / move / duplicate and the v4.9e picker, but missed the pin-on-block flow that makes the slide editor feel responsive ("agent: this title isn't right" → drop a pin → keep editing). Parity is the highest-leverage debt to clear; it removes the "slide editor feels alive, section editor feels static" asymmetry users will inevitably notice.

`compile_markdown` (memory: `project_markdown_plan.md`) has been deferred since v4.8. It's a small, well-bounded server tool that converts markdown into a sequence of IR nodes the agent can drop into a slide or section. AI-driven content authoring becomes a one-liner. It pairs naturally with v4.10's section-parity work because the most common markdown destination is the body of a content section — and `+ Block ▾`'s tile grid will gain a "Paste markdown" entry that round-trips through the new tool.

## Scope (one theme, two sub-tracks)

### Track A — Per-block pin mode for sections

Today section comments are coarse-grained: every comment lands on the section as a whole. The `CommentTarget` discriminated union already supports `ir_node` targets (used by the slide pin flow), and `migrateIrPathsForContainer` already runs for both slide and section structural ops. The gap is **App-side affordance + one server-side migration bug**.

Server work:
- **Bug fix in `comment-service.migrateIrPathsForContainer`**: orphaned `ir_node` comments downgrade to `{ kind: 'slide', slideId: containerId }` regardless of whether the container is a slide or section. For section comments this produces a `slide` target with the section_id stamped into `slideId` — invalid, breaks `list_comments` rendering. Fix: detect the container type (probe via `deckService.getSlide` / `documentService.getSection`), downgrade to `{ kind: 'section', sectionId: containerId }` when the source was a section. Three new tests to lock this.
- One review pass on the existing section structural-op migration callers (`section-structural-ops.tool.ts` lines 79 / 121 / 169 / 217). Logic should already be correct — just confirm the orphan path now produces section targets.

App work (`DocumentEditor.svelte`):
- New state: `pinMode`, `pinnedIrPath`, `pinnedPreview`. Mutually exclusive with `structureMode` (mirror Editor.svelte's toggle wiring).
- New handlers: `togglePinMode`, `handlePinTarget`, `submitComment` (adapted to send `{ kind: 'ir_node', container_id: section_id, ir_path, preview }` when `pinnedIrPath` is set, falling back to `{ kind: 'section', section_id }` otherwise).
- The bridge already postMessages `pintarget` events with the IR path — sections route through the same `STRUCTURE_BRIDGE_SCRIPT` as slides, so the iframe-side wiring is free.
- Mode toggle button in the section toolbar next to `Edit layout`. Pin-mode CSS sets `cursor: crosshair` (already injected by the shared bridge).
- New `commentedIrPaths` derived state for sections, fed by a `refreshCommentedIrPaths()` function that calls `bridge.listComments({ deck_ref, section_id })` and filters to `ir_node` targets — same shape as the slide variant. Drives the dashed mint outline on pinned blocks via the existing bridge CSS.
- Re-key `commentedIrPaths` on section reload so structural ops + the new orphan-aware migration land cleanly.

Acceptance:
1. **Pin a paragraph in a section** → drop a comment with kind `revision`. `list_comments` returns the comment with `target.kind === 'ir_node'` and `container_id === section_id`. The block keeps its dashed mint outline after the comment is committed.
2. **Move a pinned paragraph in a section** → the comment's `ir_path` follows. Pin-outline survives the iframe re-render.
3. **Delete a pinned paragraph** → orphan migration produces `{ kind: 'section', section_id }`, NOT `{ kind: 'slide', slide_id: <section_id> }`. The comment stays visible in the drawer but the dashed outline disappears.
4. **Toggle pin-mode + edit-layout** → mutually exclusive, identical UX to the slide editor.
5. Tests: 3 new server-side migration tests + 2-3 DocumentEditor parity tests for the comment shape.

### Track B — `compile_markdown` MCP tool

A pure server tool that takes a markdown string and returns an array of IR `LeafSlideNode` payloads ready for `insert_*_node`. No runtime markdown — markdown is purely an authoring input format.

Coverage (initial pass):

| Markdown | → IR node |
|---|---|
| `# H1` / `## H2` / … | `heading` with matching `level` |
| Paragraph | `prose` |
| `- bullet` / `1. numbered` / `- [ ] checklist` | `list` (style detected) |
| `> blockquote` | `quote` (multi-line collapse with newline runs) |
| `---` / `***` | `divider` |
| `**bold**`, `*italic*`, `` `code` ``, `~~strike~~`, `[link](href)` | inline RichText marks on the run |
| `![alt](asset_id)` where the slug resolves to a known asset | `image` with that `asset_id`; otherwise warning + skip |
| Tables, code blocks (fenced), images-by-URL | not in v4.10 — return a `not_supported` warning the agent can surface |

Server work:
- New `src/domain/markdown/compile-markdown.ts` — pure function `compileMarkdown(input: string): { nodes: LeafSlideNode[]; warnings: Warning[] }`. Use a small handwritten line-based parser; no third-party markdown library (memory: `feedback_wysiwyg_compound_filter.md` favors structured-block primitives over HTML-first scaffolding).
- New MCP tool `compile_markdown` — `{ input: string }` → `{ nodes, warnings }`. Pure transformation — no deck / slide state, no soul lookup, no Zod side-effects beyond schema validation on the output.
- Round-trip tests: every supported markdown construct, every warning code, every Zod-validated node payload.

App work — none needed. The agent calls `compile_markdown` followed by `insert_slide_node` (one per emitted leaf) or `insert_section_node`. The action bar's `+ Block ▾` doesn't need a "Paste markdown" affordance in v4.10 — that's a follow-up if users ask.

Acceptance:
1. `compile_markdown({ input: "# Title\n\nA paragraph with **bold** and *italic*." })` → `[{ type: 'heading', level: 1, text: [...] }, { type: 'prose', body: [{ text: 'A paragraph with ' }, { text: 'bold', bold: true }, ...] }]`.
2. Bullet, numbered, and checklist lists each emit a single `list` node with the right `style` and item count.
3. An unknown image slug produces a `warning` with `kind: 'unresolved_asset'` and is skipped, not aborted.
4. Tests: ≥25 new unit tests covering the compiler.

## Out of scope (defer)

- **Apache ECharts charts** — v4.11. Server-side SVG rendering, soul-theme bridging, PNG fallback for PPTX. Big lift, own theme.
- **Section conflict tracking / canvasNonce parity** — sections call the bridge directly instead of going through a deck-store with optimistic state. Pre-existing pattern; not v4.10 scope.
- **Inline assets in RichText** (icon-next-to-text) — v5.0. Requires extending the run schema.
- **Per-keystroke undo/redo** — v5.0.
- **Markdown tables / fenced code blocks / images-by-URL** — v4.10.x patch or v4.11 stretch.
- **Compound layouts (`two_column`, `grid`) in NodeTypePicker** — needs sub-positioning UX. Bundle with charts in v4.11.
- **Auto-enter rich-text edit on insert** — small polish; standalone v4.10.x candidate.

## Open design questions (decide during implementation)

1. **Pin orphan UX in sections.** When a section comment is orphaned (its block was deleted), today the comment gets stranded in the drawer with no visible canvas anchor. v4.10's fix downgrades the target so it re-anchors to the section. Should the drawer also flag "this comment's target was deleted" with a small badge? Lean yes, but keep it small (one mint dot in the drawer entry — same visual language as the bridge outline).
2. **Markdown asset resolution.** `![alt](asset_id)` could mean (a) the literal `asset_id` from `list_assets`, or (b) a slug the agent expects the server to resolve. Lean (a) — keeps the tool pure, no soul/deck context needed. Document the convention; agents that have a slug call `find_asset_by_slug` first.
3. **Should `compile_markdown` accept a `parent_path` hint** so it can emit container-aware filtering (e.g., flag nodes that wouldn't fit in `two_column.left`)? Lean **no** — the App's `availableForParent` already filters; the compiler's job is "markdown → IR", not "markdown → IR-that-fits-here".
4. **Heading level inference.** Markdown `#` is h1, `##` is h2, etc. The slide editor reserves h1 for cover/hero and uses h2-h4 for content. Should the compiler auto-shift `#` → `h2` for slide contexts? Lean **no** — pure mapping, agents that want a shift apply one downstream. The decision belongs in the prompt, not the compiler.

## Pre-flight tasks (v4.10 kickoff)

- [ ] Server: write the failing test for the orphan-section bug in `migrateIrPathsForContainer`. Watch it fail. Fix the downgrade to detect container type.
- [ ] Server: scaffold `src/domain/markdown/compile-markdown.ts` + tests. TDD the parser construct-by-construct.
- [ ] Server: register `compile_markdown` MCP tool, wire through `tools/index.ts`.
- [ ] App: copy slide-editor's pin-mode wiring (`pinMode`, `togglePinMode`, `handlePinTarget`, `submitComment` branching, `commentedIrPaths` effect) into `DocumentEditor.svelte`. Most of this is mechanical mirroring.
- [ ] App: add the pin-mode toggle button to the section toolbar; mutually exclusive with `Edit layout`.
- [ ] Manual round-trip in Claude Desktop: pin a paragraph in a section, drop a revision comment, drag the paragraph, verify the pin follows. Pin a paragraph, delete it, verify the comment shows up as section-scoped.

## Status

Not started. Branch: TBD (`v4.10-section-parity`).
