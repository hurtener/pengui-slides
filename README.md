# Pengui Slides

**An MCP server with a first-class MCP App for AI-driven slide and print-document creation.**

Agents author **structured IR** (`SlideIR` / `SectionIR`); the server validates, compiles to HTML using a Design Soul's tokens, and exports to PPTX, PDF, HTML, or Google Slides. The companion **MCP App** (Svelte 5 SPA, embedded in Claude Desktop / other MCP-Apps-capable hosts) gives the user a live preview, direct manipulation, comments, and asset uploads — all without ever leaving the conversation.

The project's north star is **v5.0 = WYSIWYG**. v4.x is the path: each release deepens the App and tightens the agent ↔ user loop. This README is the on-ramp; [`SPEC.md`](./SPEC.md) is the canonical specification.

## Two output mediums

| Medium    | Format(s)                                              | Authoring model | Geometry          | Exports                     |
|-----------|--------------------------------------------------------|-----------------|-------------------|-----------------------------|
| **Slides** | `slides_16_9` (default)                               | `slides`        | 1920 × 1080       | PPTX · PDF · HTML · Google Slides |
| **Print** | `print_a4_portrait`, `print_letter_portrait`           | `document`      | A4 / US Letter    | PDF only                    |

Both share Design Souls, asset pipeline, validation engine, and the MCP App.

## How it works

```
Agent writes IR → MCP server validates + compiles to HTML → Playwright renders → Export
                          ↑                                          ↓
                          └──── App reads + mutates IR ─── Live preview ──┐
                                                                          ↓
                                                       User edits / drops comments
```

1. Define a **Design Soul** (color, typography, spacing, shape, depth, components, motion).
2. The agent creates a deck and authors slides/sections as IR — `hero`, `heading`, `prose`, `list`, `quote`, `callout`, `image`, `divider`, `table`, `two_column`, `grid` (+ doc-only `toc`, `bibliography`, `page_break`, `section_divider`).
3. The server compiles the IR into self-contained HTML using the soul's CSS tokens and the deck's format geometry.
4. The user opens the **MCP App** to preview, drop comments, edit text inline, insert / morph / move blocks directly on the canvas, or upload assets from disk.
5. On export, Playwright renders pages and assembles into the target format.

For the full architecture, IR schema, validation gates, and v5.0 trajectory, see [`SPEC.md`](./SPEC.md).

## Quick start

### Prerequisites

- Node.js ≥ 20
- Chromium (installed by Playwright)

### Install + build

```bash
npm install
npx playwright install chromium
npm run build
```

### Run

```bash
# Stdio transport (Claude Desktop, Claude Code, most MCP hosts)
npm start

# HTTP transport (remote / web hosts)
npm run start:http
node build/index.js --transport http --port 8080

# Dev mode (hot reload)
npm run dev
```

### Configuration

| Flag / env var                            | Default     | Purpose                                       |
|-------------------------------------------|-------------|-----------------------------------------------|
| `--transport` / `PENGUI_TRANSPORT`        | `stdio`     | `stdio` or `http`                             |
| `--port` / `PENGUI_PORT`                  | `3000`      | HTTP port                                     |
| `--host` / `PENGUI_HOST`                  | `127.0.0.1` | HTTP host                                     |
| `--persist-dir` / `PENGUI_PERSIST_DIR`    | _(none)_    | Enable file-backed JSON persistence at this path |

## MCP client configuration

### Claude Desktop

`claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "pengui-slides": {
      "command": "node",
      "args": ["/path/to/pengui-slides/build/index.js"]
    }
  }
}
```

### Claude Code

`.claude/settings.json`:

```json
{
  "mcpServers": {
    "pengui-slides": {
      "command": "node",
      "args": ["/path/to/pengui-slides/build/index.js"]
    }
  }
}
```

With persistence:

```json
{
  "mcpServers": {
    "pengui-slides": {
      "command": "node",
      "args": ["/path/to/pengui-slides/build/index.js", "--persist-dir", "./pengui-data"]
    }
  }
}
```

The MCP App opens automatically when the agent calls `open_deck_editor` and the host supports MCP Apps. Both Claude Desktop and Claude Code do.

## Authoring models

`create_deck` picks the default authoring model from `format`. Once chosen, the deck shape is fixed.

- **`slides`** (default for `slides_16_9`) — every slide is a `slide_ir` tree compiled to a single 1920×1080 HTML document. Page boundaries are explicit.
- **`document`** (default for print formats) — every section is a `section_ir` tree. The `DocumentComposer` concatenates sections into one HTML document; Chromium paginates at export time. Doc-only IR nodes (`toc`, `bibliography`, `page_break`) live here.

Pass `authoring_model` explicitly to override the default. After creation, `get_deck_summary` tells you which verbs to use.

## A typical agent flow

```ts
// 1. Register and approve a soul (or reuse an existing one)
register_design_soul({ name: 'Cozy Premium', layers: { … } })
approve_design_soul({ soul_ref: 'cozy-premium' })

// 2. Create a deck
create_deck({ soul_ref: 'cozy-premium', title: 'Q3 Review', format: 'slides_16_9' })
// → returns { deck_id, slug: 'q3-review', authoringModel: 'slides' }

// 3. Add slides as IR (no HTML)
add_slide({
  deck_ref: 'q3-review',
  slide_ir: {
    layout: 'default',
    background: 'canvas',
    body: [
      { type: 'hero', title: [{ text: 'Q3 Review' }], eyebrow: [{ text: 'FY25' }] },
      { type: 'two_column', ratio: '1:1',
        left:  [{ type: 'prose', body: [{ text: 'Highlights …' }] }],
        right: [{ type: 'image', asset_id: 'logo-uuid' }],
      },
    ],
  },
})

// 4. Open the App so the user can preview + tweak
open_deck_editor({ deck_ref: 'q3-review' })

// 5. Read user comments between turns
list_comments({ deck_ref: 'q3-review', resolved: false })

// 6. Validate + export
validate_deck_for_export({ deck_ref: 'q3-review' })
export_pptx({ deck_ref: 'q3-review' })
```

For prose-heavy content, `compile_markdown` lets the agent emit markdown once and have the server compile it directly into IR — no second-pass rewrite.

## Tools, resources, prompts

As of v4.11:

- **~56 model-visible tools** + 8 app-only tools, organised into Decks · Slides/Sections (CRUD) · IR structural ops (`insert_*_node`, `move_*_node`, `duplicate_*_node`, `remove_*_node`) · IR field-level edits (`apply_*_node_edit`, `apply_*_field_edit`) · Souls · Assets · Comments · Validation · Export · Session.
- **13 doc resources** at `pengui://docs/*` covering overview, slide format, design souls, validation, assets, css utilities, recipes, workflows, print mode, document mode, charts & diagrams, collaboration. Plus the IR schema at `pengui://schema/slide-ir` (Zod → JSON Schema with notes).
- **6 prompts**: `onboarding`, `create-presentation`, `create-document`, `create-print-document`, `design-soul-guide`, `slide-html-quickref`.

Full inventory and signatures in [`SPEC.md` §10–11](./SPEC.md).

## Design Soul

A Soul defines the complete visual identity:

| Layer            | Defines                                                                  |
|------------------|--------------------------------------------------------------------------|
| Color Language   | Canvas, surface, border, text, accent, semantic colors                   |
| Typography       | Font families, scale, weights, line heights                              |
| Spacing          | Base unit + scale (xs–xxxl), safe-area inset                             |
| Shape            | Corner radius signatures, per-component radius                           |
| Depth & Shadow   | Shadow definitions, border width/opacity                                 |
| Components       | Card, button, input, badge tokens                                        |
| Motion & Tone    | Transition curves, do/don't rules, north-star sentence                   |

Approval generates ~73 CSS custom properties, ~38 utility classes, layout recipes for both authoring models, and an LLM-consumable style guide. **Token-only enforcement**: Stage 1 lint rejects literal hex / px values for visual properties, so the soul stays the only source of style truth.

`apply_token_override` (app-only) lets the user nudge a single token from the App; the cascade recompiles dependent decks automatically.

## Validation

Two stages, depth-gated:

- **Stage 1 — Static lint** (~50ms): token compliance, structural shape, network isolation, safe-area, doc-only-node-in-slide rejection. Runs on every IR write.
- **Stage 2 — Render truth** (~800ms): WCAG contrast, overflow + clipping, rendered color sampling, text legibility. Runs on `validate_*` tools and gates export via `validate_deck_for_export`.

Failed validation never persists — Stage 1 fires *before* the store writes, so the agent never wakes up to a broken state.

## Project structure

```
pengui-slides/
├── src/                # MCP server
│   ├── domain/
│   │   ├── ir/         # SlideIR/SectionIR schema, compile, ops, path-resolver
│   │   ├── decks/      # Deck + slide services
│   │   ├── documents/  # Section service + DocumentComposer
│   │   ├── souls/      # Lifecycle, token + recipe generation
│   │   ├── markdown/   # compile_markdown
│   │   ├── validation/ # Stage 1 (lint) + Stage 2 (Playwright)
│   │   ├── assets/     # Upload, resolve, lifecycle
│   │   ├── comments/   # Pin-mode comments
│   │   └── rendering/  # Playwright pool + exporters
│   ├── storage/        # In-memory + file stores
│   ├── tools/          # ~56 model-visible + 8 app-only
│   ├── resources/      # MCP docs + IR schema
│   └── prompts/        # MCP prompts
├── app/                # MCP App (Svelte 5 SPA, single-file bundle)
│   └── src/
│       ├── routes/     # DeckEditorApp, Editor, DocumentEditor, Workspace, …
│       ├── lib/        # bridge, structureBridge, NodeTypePicker, primitives
│       └── stores/     # Client-side state
├── tests/              # ~1190 vitest tests
├── docs/               # North Star, exploration notes
├── templates/          # Reference HTML recipes
└── scripts/            # Migration, e2e, build helpers
```

## Development

```bash
npm run typecheck       # tsc --noEmit
npm test                # build + vitest run
npm run test:watch      # vitest watch
npm run test:e2e        # scripts/e2e-section-flow.mjs
npm run lint            # eslint
npm run build:app       # Build the Svelte App bundle
npm run build:server    # Build the MCP server (regenerates src/build-info.ts)
npm run dev             # tsx --watch
```

## Tech stack

| Component             | Technology                                       |
|-----------------------|--------------------------------------------------|
| MCP server            | `@modelcontextprotocol/sdk` (TypeScript, Node ≥ 20) |
| MCP App               | Svelte 5 (`$state` runes), single-file bundle     |
| HTML rendering        | Playwright (Chromium)                             |
| PPTX assembly         | PptxGenJS                                         |
| HTML parsing          | Cheerio                                           |
| CSS processing        | PostCSS                                           |
| Schemas               | Zod (+ Zod → JSON Schema for the IR resource)    |
| Persistence           | In-memory (default) or file-backed JSON           |
| HTTP transport        | Express                                           |
| Tests                 | Vitest                                            |

## License

MIT
