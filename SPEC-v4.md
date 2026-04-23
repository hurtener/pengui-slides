# SPEC v4 — Deeper MCP App for Human-Agent Collaboration

**Status:** draft — proposal for approval, execution deferred to the v4 cycle
**Predecessors:** `SPEC.md` (v1 slides + v2 print), `SPEC-v3.md` (continuous-document print)
**Does not replace:** any v3 behavior. v4 is additive; the MCP tool model, the authoring pipelines, the stores, and the export paths are unchanged unless this spec says otherwise.

---

## 1. Why v4

Pengui Slides is an **MCP server with a first-class MCP App** for human-agent collaboration. v4's job is to make the MCP App actually fulfil that promise end-to-end — not to become a web backend with tools bolted on.

Pain points the current surface has:

- **Opaque identity.** Every tool call takes a UUID. Users can't remember them; they copy-paste from prior tool results and lose the thread across sessions.
- **Invisible artifacts.** Agent registers a Design Soul → user has nothing to look at until someone explicitly renders a preview. Same for decks between creation and export.
- **No semantic feedback channel.** To ask the agent to revise slide 3, the user scrolls chat back and describes the change in prose. No way to pin a note to a specific slide / section / element.
- **Context-bloating uploads.** The only way to attach a logo is `upload_asset` called by the *agent* with base64 in its transcript. For anything non-trivial this is unacceptable.
- **Thin MCP App surface.** Today the app opens for *one* deck at a time and shows slide-level text editing. There's no deck picker, no soul panel, no asset view, no reader for document decks, no comments. Every interaction leaves the app and returns to chat.
- **No active-session concept.** Nothing in the system knows "the user is currently working on deck `brand-handbook` with soul `cozy-premium`," so every tool call needs the reference argued from scratch.

v4 fixes those by deepening the MCP App — extending it into a complete workspace (decks, souls, assets, comments, editor state) — and by adding the handful of tools that expose the same data to the agent. The agent and the app talk to the same service layer through the same MCP transport.

---

## 2. Scope

### 2.1 In scope

1. **Human-readable slugs** for decks and souls. UUIDs remain canonical; tools accept either. Backend concern only.
2. **Workspace routes inside the MCP App.** Extend `app/src/routes/` from just-editor to a full shell:
   - Decks list with slugs and format badges.
   - Deck page (extended Editor route) with live-updating preview (slide thumbnails for slide decks, paginated preview for document decks), soul badge, asset shortcuts, comment drawer.
   - Souls list + Soul Artifact Panel (tokens, recipes, style guide, approval status).
   - Asset library grouped by scope (soul / deck / global) and role (logo / content).
3. **Structured inline editing.** Extend the existing `data-edit-id` + revision-hash model to:
   - Text nodes (already prototyped via `apply_text_edit`).
   - Soul-level token overrides (e.g., accent color swap, spacing bump).
   - Chrome + TOC config on document decks.
   - Section kind + break-hint toggles.
   - Each persists through Stage 1 validation before the store is written.
4. **Comment / Marker layer.** User drops pins on slides / sections / specific `data-edit-id` elements. Comments are structured objects the agent reads via a new `list_comments` tool on the next turn.
5. **App-side asset upload.** A new **app-only** tool (`upload_asset_from_app`) that the MCP App calls via the bridge, with base64 bytes. Because app-only tools are not visible to the LLM, the binary never enters the agent's context transcript. Agent learns about the asset on its next turn via `list_assets` or a summary.
6. **Active-session context.** The MCP App declares "active deck" / "active soul" through `editorService`; a new `get_session` tool lets the agent ask the server what the user is currently working on instead of requiring the ref in every prompt.

### 2.2 Explicitly out of scope

1. **A standalone web UI.** No `/ui/*` routes, no REST. Everything user-facing lives in the MCP App.
2. **Server-sent events / push transports.** MCP already has a push mechanism: the host fires `onhostcontextchanged` after tool calls. v4 uses that. No SSE, no WebSocket.
3. **Mid-generation streaming.** Updates are visible on tool-call completion, not during.
4. **Free-form contenteditable HTML editor.** Editing is structured via `data-edit-id` / typed fields. The agent stays the sole authority for layout and DOM.
5. **Real-time multi-user collab.** Single user at a time per deck; revision-hash concurrency stays.
6. **Stage 2 validation on every user edit.** Stage 2 (Playwright render-truth) runs at export only.
7. **Auth, multi-tenant, or public hosting.** Local dev tool model continues.
8. **Mobile-optimized UI.** MCP App runs in Claude Desktop / other MCP-Apps-capable hosts; we follow whatever they support.

---

## 3. What already exists (do not rebuild)

| Component | Path | Status |
|---|---|---|
| MCP transports (stdio + HTTP) | `src/index.ts` | Both work. v4 does not change them. |
| MCP App bundle | `app/` (DeckEditorApp, routes/Decks, routes/Editor, routes/Export, lib/SlideCanvas, lib/PagePreview, lib/IssueList, lib/bridge, stores/deck) | Single-file bundle at `build/app/index.html`, served as `ui://deck-editor/index.html`. Extended, not replaced. |
| MCP App open tool | `src/tools/app/open-deck-editor.tool.ts` | Opens the panel with initial `editor_state`. v4 gains siblings (`open_workspace` — opens to the decks list). |
| Text-edit loop | `src/tools/app/apply-text-edit.tool.ts` | App-only tool. Revision-hash optimistic concurrency, `SlideRevisionConflictError` conflict branch, returns refreshed state. **This is the template for every v4 mutation tool.** |
| Editor state service | `container.editorService.getEditorState` / `applyTextEdit` | Extends to cover decks list, souls, assets, comments. |
| `data-edit-id` attribute | Emitted on text nodes by composers | v4 adds it to more node types and uses it as the comment target identifier. |
| Asset store + `asset://UUID` refs | `src/types/asset.ts`, resolver at render/export | v4 only adds an app-only upload path, reusing the existing store. |
| File stores | `src/storage/*` | Swap in-memory ↔ persisted via `persistDir`. v4 relies on persistence for cross-session comments and slugs. |
| Playwright pipeline | `src/domain/rendering/*` | Reused for live thumbnails and deck reader. |

**Implication:** v4 is *more MCP tools*, *more MCP App routes*, *one new backend concept (comments)*, *slugs*. No new transports, no REST, no event bus required for correctness.

---

## 4. Architecture

### 4.1 Data flow (unchanged shape, deepened)

```
┌──────────────────────────────────────────────────────────────┐
│  LLM / Agent (Claude Desktop, Claude Code, custom clients)   │
│                                                              │
│     calls model-visible tools                                │
│     ▼                                                        │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  MCP transport (stdio OR http-as-mcp)                │    │
│  └──────────┬────────────────────────────────┬──────────┘    │
│             │                                │               │
│             ▼                                ▼               │
│   ┌──────────────────┐            ┌──────────────────┐       │
│   │  MCP Server      │            │  MCP App bundle  │       │
│   │  (tools/         │◄──bridge──►│  (app/ Svelte    │       │
│   │   resources/     │   (app-    │   SPA, served as │       │
│   │   prompts)       │   only     │   ui://...       │       │
│   └────────┬─────────┘   tools)   └──────────────────┘       │
│            ▼                                                 │
│   ┌──────────────────┐                                       │
│   │ ServiceContainer │  (existing)                           │
│   │  deckService     │                                       │
│   │  soulService     │                                       │
│   │  sectionService  │                                       │
│   │  editorService   │                                       │
│   │  assetService    │                                       │
│   │  commentService  │  (new in v4)                          │
│   │  validationSvc   │                                       │
│   └─────┬────────────┘                                       │
│         ▼                                                    │
│      File stores (unchanged + comment-store new)             │
└──────────────────────────────────────────────────────────────┘
```

Both the agent and the MCP App exercise the same service layer through the same transport. The MCP App is a privileged client (it can call app-only tools); otherwise it has no special access.

### 4.2 Push / refresh model

MCP App updates come from two sources — both already part of MCP Apps:

1. **Tool-call results.** When the agent finishes a model-visible tool call, the host delivers the result to the app via `ontoolresult`. The app refetches affected state (e.g., `get_editor_state`) and re-renders.
2. **Host context change.** `onhostcontextchanged` fires when the host signals a context shift. The app refreshes top-level state.

No SSE. No WebSocket. No long-polling. If the MCP protocol grows explicit server-initiated push later, we adopt it then; until then, the tool-completion boundary is when the user sees new content, and that matches the user's mental model ("the agent finished writing slide 3, now I can see it").

### 4.3 Optional internal EventBus

Service methods may publish typed events to an in-process EventBus (`src/infrastructure/event-bus.ts`, new, internal only). Current consumers: zero. Future consumers: logging sinks, replay buffers for dev, cross-service invalidation. **No external subscribers, no public API.** If it doesn't pay its way in Wave 1, we cut it.

---

## 5. Identity & slugs

### 5.1 Slug field

Decks and Souls gain a `slug: string` field on the stored object.

- Auto-derived: lowercase ASCII kebab-case of `title` / `name`.
- Collision resolved by numeric suffix (`-2`, `-3`, ...), searched at create time.
- Immutable once assigned. Renaming the title does not change the slug. Explicit `change_slug` is a v4.1 concern.

Two in-memory indexes rebuilt at boot by scanning the stores:
- `slugToDeckId: Map<string, DeckId>`
- `slugToSoulId: Map<string, SoulId>`

### 5.2 Tool surface change

A new resolver helper (`src/tools/_shared/ref-resolver.ts`) accepts either a UUID or a slug and returns the canonical ID. Every tool that today takes `deck_id` / `soul_id` gains a sibling `*_ref` field:

- `deck_ref` / `soul_ref` — accepts UUID or slug.
- `deck_id` / `soul_id` — continue to work for one release cycle, marked "accepts UUID only; prefer `*_ref`".

Tool outputs return both `id` and `slug` so agents can use whichever they prefer. No breaking change.

---

## 6. Data model additions

### 6.1 `Comment` (new)

```ts
interface Comment {
  id: CommentId;                // new brand
  deckId: DeckId;
  target:
    | { kind: 'slide'; slideId: SlideId }
    | { kind: 'section'; sectionId: SectionId }
    | { kind: 'element'; containerId: string; editId: string };  // data-edit-id
  author: 'user' | 'agent';
  kind: 'revision' | 'question' | 'approval' | 'note';
  body: string;                  // plain text; rendered as markdown-lite in the app
  createdAt: ISOTimestamp;
  resolvedAt?: ISOTimestamp;
  resolvedBy?: 'user' | 'agent';
}
```

Stored in a new `ICommentStore` (`comments/<comment-id>.json`). Queried by `deckId`. Plain-text body is sanitized at write time — no HTML, no scripts.

### 6.2 Session / active workspace context

Extends `editorService` rather than introducing a separate Session type. The existing `getEditorState` already tracks a selected deck / slide. v4 generalises it to also cover `activeSoulId` and workflow hints, and adds a model-visible `get_session` tool that returns the light-weight view.

```ts
interface SessionView {
  activeDeck?: { id: DeckId; slug: string; title: string; authoringModel: AuthoringModel };
  activeSoul?: { id: SoulId; slug: string; name: string; status: 'draft'|'approved'|'archived' };
  activeWorkflow?: 'create-presentation' | 'create-document' | null;
  openPanels: string[];  // which app routes are currently open; informational
}
```

In-memory only. If the MCP App reloads, the state is re-declared by the app on startup.

### 6.3 Slug backfill

On first boot after v4 lands, each existing deck / soul without a slug gets one derived from its title/name. Runs inside the file stores' boot path; idempotent.

### 6.4 No changes to

`Slide`, `Section`, `DesignSoul.layers`, `Asset`, `Revision`, `LayoutRecipe` are untouched.

---

## 7. Tool surface changes

All new tools follow existing conventions: Zod-validated inputs, snake_case I/O, structured-response shape, `handleToolError` wrapping.

### 7.1 New model-visible tools

| Tool | Purpose |
|---|---|
| `list_decks` | Lightweight deck list with slugs, formats, authoring models. Currently missing — users rely on external memory. |
| `list_comments` | Return unresolved comments for a deck (optionally filtered by target kind). **Agent's primary feedback channel.** |
| `add_comment` | Let the agent pin a note itself (e.g., "I couldn't fit this table; user, please decide"). |
| `resolve_comment` | Mark a comment resolved; optionally attach a reply. |
| `get_session` | Fetch the active-session view. Agent uses this to avoid re-asking "which deck?". |

### 7.2 New app-only tools (bridge-called by the MCP App)

| Tool | Purpose |
|---|---|
| `upload_asset_from_app` | Accepts base64 + metadata from the app. Binary never hits the LLM transcript because app-only tools are not visible to the model. Returns the `asset://UUID` ref. |
| `set_active_workspace` | App tells the server what the user is focused on (active deck/soul/workflow). Backs `get_session`. |
| `apply_token_override` | Tweak a single soul-layer token (e.g., accent color) and recompile tokens + recipes. Extends the `apply_text_edit` revision-hash pattern. |
| `apply_block_edit` | Mutate a structured block (section kind, break-hints, chrome config). Same pattern. |
| `add_comment_from_app` | Variant of `add_comment` that includes UI context (viewUUID, scroll position snapshot) for forensics. |

App-only visibility is already supported in the codebase — see `apply_text_edit` (`visibility: ['app']`).

### 7.3 Changed model-visible tools

- Every tool taking `deck_id` / `soul_id` accepts `deck_ref` / `soul_ref`.
- `get_deck_summary` + `list_design_souls` outputs gain `slug`.
- `upload_asset` (existing, agent-visible) gets a stronger description: "Prefer uploading through the MCP App, which uses `upload_asset_from_app` and keeps the binary out of this conversation's context. Use this tool only when the app isn't open."
- `open_deck_editor` response mentions the workspace route, not just the deck slide.

### 7.4 Deprecated / removed

Nothing removed in v4. Soft deprecations (still functional): `deck_id` / `soul_id` in favor of `*_ref`; agent-visible `upload_asset` for large files.

---

## 8. MCP App surface

### 8.1 New routes

Shipped inside `app/src/routes/`:

- `Workspace.svelte` (was: `Decks.svelte` extended) — decks list + global navigation shell (sidebar: Decks / Souls / Assets / Comments).
- `Editor.svelte` (existing, extended) — deck page with live-updating preview, comment drawer, asset shortcuts, soul badge.
- `Souls.svelte` (new) — souls list with status + slug + created/approved dates.
- `SoulPanel.svelte` (new) — Soul Artifact Panel: token swatches, recipe previews, style guide markdown, approval toggle.
- `Assets.svelte` (new) — asset library grouped by scope + role; per-asset preview; upload button (calls `upload_asset_from_app`).

Routing already exists in `DeckEditorApp.svelte`; v4 extends it.

### 8.2 New shared primitives

Under `app/src/lib/`:

- `CommentDrawer.svelte` + `CommentPin.svelte` (new).
- `TokenSwatch.svelte` + `RecipePreview.svelte` (new, for the soul panel).
- `AssetCard.svelte` + `AssetUploader.svelte` (new).

`SlideCanvas.svelte`, `PagePreview.svelte`, `IssueList.svelte`, `FormatBadge.svelte` are reused unchanged.

### 8.3 Shipping order (within the v4 cycle)

- **Phase A — Reader + navigation (MVP):** Workspace + Souls + SoulPanel + Assets (read-only). Extended Editor with live preview but no new edit types beyond what exists today. Solves "I can't see what the agent is doing" for both souls and decks.
- **Phase B — Structured editing:** `apply_token_override`, `apply_block_edit`, chrome/TOC form; editing UI for souls and document decks.
- **Phase C — Comments:** CommentPin + CommentDrawer in Editor; comment tools wired into `onboarding` and workflow prompts so agents check comments each turn.
- **Phase D — Asset upload UX:** AssetUploader component + `upload_asset_from_app` + flows from deck/soul pages.

Phase A alone is the MVP cutoff; the rest deepens collaboration but each is independently shippable.

---

## 9. App-side asset upload (no new HTTP surface)

### 9.1 Why it's safe from the context-bloat concern

App-only tools are routed through the MCP bridge **between the app and the server**, not through the LLM's tool-use transcript. Base64 payloads pass over the app-bridge JSON-RPC and never become part of the agent's context. The agent sees only the resulting `asset://UUID` ref surfaced on its next relevant tool call (`list_assets`, `get_deck_summary` with `include_assets: true`, or the summary line in the response body).

This is the same mechanism that already keeps `apply_text_edit`'s back-and-forth off the LLM's transcript.

### 9.2 Transport bandwidth

Expected asset sizes: logos (~50–800 KB), supporting images (~1–3 MB). Well within both stdio (Claude Desktop has handled multi-MB responses in practice) and HTTP-transport bridge capacities. Hard cap in validation: 5 MB per asset.

If we ever need to push past that, we revisit with a narrow "chunked upload via the bridge" tool. No out-of-band HTTP.

### 9.3 Metadata

```
upload_asset_from_app input:
  data_base64: string
  mime_type:   'image/png' | 'image/jpeg' | 'image/svg+xml' | 'image/webp'
  scope:       { type: 'soul'; soul_ref } | { type: 'deck'; deck_ref } | { type: 'global' }
  role:        'logo' | 'content'
  label:       string (optional human hint)
```

Response includes `asset_id`, `ref`, and the scope record. Emits an internal `asset.uploaded` event (EventBus, if kept) and is visible to the agent on its next `list_assets`.

---

## 10. Concurrency & validation

### 10.1 Revision-hash model (unchanged)

User edits go through `apply_text_edit`-style flows: `expected_revision_hash` on input, `SlideRevisionConflictError` when stale, full refreshed state on success. v4 applies the same shape to `apply_token_override` and `apply_block_edit`.

### 10.2 Stage 1 gate on every user-initiated mutation

Every user edit runs Stage 1 validation **before** the store writes. If it fails, the user gets issues inline in the app; the mutation never persists. The agent, waking up on its next turn, never sees a broken state.

### 10.3 Stage 2 remains export-only

Playwright-backed render-truth is too slow (~2–5 s) to gate every edit. The reader auto-refreshes thumbnails after each Stage 1 pass. If a structural problem only surfaces at export time, the user drops a comment and the agent handles it.

### 10.4 Thumbnail debouncing

Live thumbnails are rendered server-side on demand (reusing the existing Playwright pipeline). To avoid thrashing during rapid edits:
- Server-side debounce: 500 ms after the last relevant mutation.
- Cached by `revisionHash` — no re-render if nothing changed.
- Request the thumbnail via a new app-only tool `get_thumbnail(slide_ref | section_ref)` returning base64 PNG.

---

## 11. Security

- Single-user, local dev-tool model continues.
- Comments stored as plain text; renderer escapes HTML; no inline JS.
- No auth surface added in v4. If someone exposes the HTTP transport publicly, MCP host-level controls are their responsibility.
- App-only tools: not visible to the LLM, but not secret — they run on the same server. Treat them as privileged UX, not a security boundary.

---

## 12. Migration & compat

- Fully additive. v3 decks (both models) load and work unchanged.
- On first v4 boot: slug backfill for decks + souls (idempotent); empty comment store created.
- No schema version bumps visible to agents. No config migration.
- MCP App loads in Claude Desktop and any other MCP-Apps-capable host; falls back gracefully if the host doesn't support MCP Apps (the `open_deck_editor` tool already checks via `getMcpAppsSupport`).
- Agents written against v3 continue to work. v4 adds optional input fields; nothing mandatory changed.

---

## 13. Rollout waves (proposed)

| Wave | Content | Shape |
|---|---|---|
| **Wave 0** — contract | This spec. Lock slug rules, `Comment` shape, tool signatures, app route list. | me, serial |
| **Wave 1** — backend foundations | Slug backfill, `list_decks`, `list_comments` / `add_comment` / `resolve_comment`, `get_session`, `commentService`, `commentStore`, `ref-resolver`. No app changes. Tests. | 1–2 worktrees |
| **Wave 2** — workspace shell + reader (Phase A MVP) | Workspace/Souls/SoulPanel/Assets routes, extended Editor, shared primitives. Wires to existing tools; no new edit types. | 2 worktrees, disjoint routes |
| **Wave 3** — structured editing (Phase B) | `apply_token_override`, `apply_block_edit`, chrome/TOC form, edit UI for souls + document decks. Stage 1 gate on every mutation. | 2 worktrees |
| **Wave 4** — comments (Phase C) | CommentPin + CommentDrawer, `add_comment_from_app`, prompt updates so agents check `list_comments` each turn. | 1 worktree |
| **Wave 5** — asset upload UX (Phase D) | AssetUploader, `upload_asset_from_app`, flows from deck/soul pages. | 1 worktree |
| **Wave 6** — polish | Docs, end-to-end demo script (`scripts/v4-demo.mts`), `pengui://docs/collaboration` resource, README update. | me, serial |

Each wave ships independently to `main`. Wave 2 is the MVP cutoff; Waves 3–5 deepen collaboration.

---

## 14. Open questions

1. **Cadence for agents reading comments.** Do we rely on the agent calling `list_comments` only when the user asks, or bake it into onboarding + workflow prompts as "check comments each turn before writing"? Likely the latter. Document in prompts in Wave 4.
2. **SoulPanel editability vs read-only.** In Wave 2 the panel is read-only; Wave 3 adds token-override editing. Confirm that order.
3. **Active-workspace per-host vs per-session.** If the user opens two Claude windows pointed at the same server, what does `get_session` return? v4: "last setter wins" with a log line. Revisit if it bites.
4. **`change_slug` tool.** Deliberately excluded in v4. If users want to rename, they re-create; slug-change with redirect records is v4.1.
5. **Thumbnail cache size.** Cache by revision-hash in memory; evict LRU when exceeding N (default 200). Revisit if the app gets slow.
6. **Comment target granularity.** v4 targets: slide / section / element-by-`data-edit-id`. Do we also want region-based (bounding box on a figure)? Probably v4.1 — it needs a coordinate system that's stable across re-renders.
7. **EventBus payoff.** If Wave 1 doesn't produce a compelling internal consumer, we cut it before merging.

---

## 15. Non-goals to re-emphasise

- Standalone web UI. The MCP App is it.
- REST endpoints. v4 adds zero.
- Mid-generation token streaming.
- Rich-text / contenteditable HTML editing.
- Multi-user real-time cursors.
- Mobile / responsive UI.
- Auth, tenancy, public hosting.
- Deep v3 composer changes.

If any of those becomes must-have, they are v4.1+ discussions.

---

## 16. One-page summary for anyone joining mid-cycle

- v4 **deepens the MCP App**. It is not a web UI project.
- **No new HTTP or REST surface.** Everything user-facing is a route inside the existing Svelte bundle.
- **Slugs** replace UUIDs in everyday interaction (UUIDs stay canonical).
- **Comments** are the between-turn feedback channel: user pins a note → agent reads via `list_comments` on next turn.
- **App-only `upload_asset_from_app`** keeps binary out of the agent's transcript — same mechanism `apply_text_edit` already uses.
- **Structured editing only** — text nodes, tokens, chrome fields. Agent stays authoritative for layout.
- **Stage 1 gates every user edit.** Stage 2 stays at export.
- **Phase A (workspace + reader)** is the MVP and solves 80% of the visible pain.
- v4 is **additive**; v3 behavior is unchanged.

---

## Appendix A — Terminology delta from v3

- **Workspace:** the full MCP App shell (Decks / Souls / Assets / Comments + the Editor).
- **Soul Artifact Panel:** dedicated MCP App route showing a Soul's tokens, recipes, style guide.
- **Comment / Marker:** structured pin the user (or agent) attaches to a slide/section/element, read between turns.
- **Slug:** human-readable ID derived from title/name; not a replacement for the UUID.
- **App-only tool:** MCP tool with `visibility: ['app']`; called via the bridge, invisible to the LLM.

---

## Appendix B — Affected files (first-order estimate)

New:
- `src/infrastructure/event-bus.ts` (optional; cut if no consumer).
- `src/storage/comment-store.ts` (+ file-backed variant).
- `src/domain/comments/comment-service.ts`.
- `src/types/comment.ts`.
- `src/tools/_shared/ref-resolver.ts`.
- `src/tools/decks/list-decks.tool.ts`.
- `src/tools/comments/{list,add,resolve}-comment.tool.ts`.
- `src/tools/comments/add-comment-from-app.tool.ts` (app-only).
- `src/tools/session/get-session.tool.ts`.
- `src/tools/app/set-active-workspace.tool.ts` (app-only).
- `src/tools/app/upload-asset-from-app.tool.ts` (app-only).
- `src/tools/app/apply-token-override.tool.ts` (app-only).
- `src/tools/app/apply-block-edit.tool.ts` (app-only).
- `src/tools/app/get-thumbnail.tool.ts` (app-only).
- `src/resources/collaboration.resource.ts`.
- `app/src/routes/{Workspace,Souls,SoulPanel,Assets}.svelte` (and extended `Editor.svelte`).
- `app/src/lib/{CommentDrawer,CommentPin,TokenSwatch,RecipePreview,AssetCard,AssetUploader}.svelte`.
- `scripts/v4-demo.mts`.

Changed:
- `src/types/deck.ts`, `src/types/design-soul.ts` — add `slug`.
- `src/storage/file-*-store.ts` — slug backfill on boot.
- `src/domain/editor/editor-service.ts` — generalise to cover decks list, souls list, assets list, session view.
- All tools taking `deck_id` / `soul_id` — accept `*_ref` too.
- `src/prompts/onboarding.prompt.ts` + workflow prompts — "check comments each turn" guidance.
- `app/src/DeckEditorApp.svelte` + `app/src/lib/bridge.ts` — shell navigation + new app-only tool plumbing.

Unchanged: composers, exporters, Stage 1 / Stage 2 validation engines, storage interfaces, transport layer. **v4 is a thicker MCP App + a handful of tools — not a platform shift.**
