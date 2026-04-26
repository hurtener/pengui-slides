/**
 * MCP Resource: pengui://docs/collaboration
 *
 * Long-form authoring guide for the v4 human-agent collaboration surface:
 * slugs, comments, sessions, app-only tools, and the between-turn feedback
 * loop. Surfaced to agents on demand so tool descriptions stay tight.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerResourceEntry } from './registry.js';

const RESOURCE_URI = 'pengui://docs/collaboration';

const CONTENT = `# Collaboration Surface — v4 Guide

Pengui Slides v4 adds a first-class human-agent collaboration surface on top of
the existing authoring pipelines. The *MCP App* (the Svelte editor served at
\`ui://deck-editor/index.html\`) is the user's workspace; you, the agent, keep
working through MCP tools. Both sides talk to the same service layer.

---

## Slugs: humans don't remember UUIDs

Every deck and soul carries a \`slug\` — a short kebab-case handle derived from
the title/name at creation and backfilled lazily for pre-v4 records. Slugs are
immutable.

- \`list_decks\` and \`list_design_souls\` return both \`id\` and \`slug\`.
- Every tool that takes \`deck_id\` or \`soul_id\` accepts EITHER the UUID or the
  slug. You don't need to switch between them.
- Reply to the user using the slug, not the UUID. "brand-handbook-2026" is easy
  to remember; \`6f4c1d2e-9a3b-4b2e-9f0e-1d4a8c1c2f6b\` is not.

---

## Session: "which deck are you on?"

The MCP App declares the user's focus via the app-only \`set_active_workspace\`
tool. You can read it with **\`get_session\`** (model-visible).

\`\`\`
get_session →
{
  "active_deck": { "id": "...", "slug": "brand-handbook", "title": "...", "format": "print_a4_portrait", "authoring_model": "document" },
  "active_soul": { "id": "...", "slug": "cozy-premium", "name": "...", "status": "approved" },
  "active_workflow": "create-document" | "create-presentation",
  "open_panels": ["editor"]
}
\`\`\`

All fields are optional. Missing means "the app hasn't declared one" — ask the
user or fall back to \`list_decks\` / \`list_design_souls\`. The session resets
on server restart or when the app disconnects.

Call \`get_session\` early on every turn that begins with an ambiguous
"work on my deck" / "tweak the soul" request.

---

## Comments: the between-turn feedback channel

Users drop pins on slides / sections / specific \`data-edit-id\` elements in the
MCP App. These are **structured** objects — not freeform chat — that you read on
your next turn.

### Read queue at turn start

\`\`\`
list_comments(deck_id) →
{
  "deck_id": "...",
  "comment_count": 2,
  "comments": [
    {
      "id": "...",
      "target": { "kind": "slide", "slide_id": "..." },
      "author": "user",
      "kind": "revision",
      "body": "Make the title 10% larger",
      "created_at": "..."
    },
    ...
  ]
}
\`\`\`

Default filter is \`resolved: "unresolved"\` — the live work queue. Pass
\`resolved: "all"\` for history.

### Kind semantics

| Kind | Meaning | Your action |
|------|---------|-------------|
| \`revision\` | User wants a change | Apply the edit, then \`resolve_comment\` with a short note. |
| \`question\` | User is asking for clarification | Reply in chat; if you act on the answer, resolve. |
| \`approval\` | User is signing off on content | Read-only acknowledgement; resolve if the user asks. |
| \`note\` | Freeform observation | Read-only unless the user explicitly asks for action. |

### Pin your own questions

Instead of interrupting with prose ("Should I use red or blue for the callout?")
when the decision can wait, pin a question with \`add_comment\`:

\`\`\`
add_comment({
  deck_id: "brand-handbook",
  target: { kind: "slide", slide_id: "..." },
  kind: "question",
  body: "Callout color — red for urgency or brand blue for calm? Please pick."
})
\`\`\`

The user sees it the next time they open the deck in the app.

### Resolve when addressed

\`\`\`
resolve_comment({
  comment_id: "...",
  resolution_note: "Title is now 22pt. Looks good at standing distance."
})
\`\`\`

Short resolution notes give the user a quick "what changed" when they review.

---

## App-only tools (agent-invisible)

Six tools have \`visibility: ['app']\` — they are called by the MCP App via the
bridge and **never appear in your transcript**. You do NOT call these; they
exist so the user's actions don't bloat your context.

- \`set_active_workspace\` — app declares active deck/soul/workflow.
- \`upload_asset_from_app\` — user uploads a logo; binary stays app-side. You
  see the resulting \`asset://UUID\` ref on your next \`list_assets\` call.
- \`apply_token_override\` — user tweaks a single soul token (e.g. accent color).
  Regenerates tokens + recipes.
- \`apply_block_edit\` — user changes a section kind, break hints, or deck
  chrome config.
- \`get_thumbnail\` — UI asks the server for a slide/section preview.
- \`add_comment_from_app\` — user drops a pin via the app's pin tool.

You learn about app-driven changes the same way as manual changes: next call to
\`list_comments\`, \`get_deck_summary\`, \`list_assets\`, or \`get_design_soul\`
reflects the current state.

---

## Between-turn loop

Each turn on a deck:

1. **Listen:** \`get_session\` to learn context; \`list_comments\` to pick up
   work left for you.
2. **Act:** Apply edits via the existing slide/section verbs (still the agent's
   primary authoring surface).
3. **Respond:** \`resolve_comment\` on items you addressed; \`add_comment\`
   on questions you want to pin.
4. **Export when asked:** \`export_pdf\` / \`export_pptx\` / \`export_html\` /
   \`export_google_slides\` (format-dependent) when the deck is ready.

No streaming, no mid-turn interruption. The user works in the app while you
work via MCP; both see the same state.

---

## What has NOT changed

- The two authoring models (slides vs document) and their verbs.
- The Design Soul system and its 7 layers.
- The validation pipeline (Section Stage 1, Slide Stage 1 + 2, Document Stage 2
  at export).
- Asset \`asset://\` refs and scoping.
- Export paths.

v4 is additive on top of v3 — nothing you learned before needs to be unlearned.
`;

export function registerCollaborationResource(server: McpServer): void {
  registerResourceEntry(server, {
    uri: RESOURCE_URI,
    name: 'collaboration',
    mimeType: 'text/markdown',
    description:
      'How v4 collaboration works: slugs, sessions, comments, app-only tools, and the between-turn feedback loop.',
    getText: () => CONTENT,
  });
}
