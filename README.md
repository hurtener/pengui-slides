# Pengui Slides

**HTML-first presentation and print-document generation with Design Soul constraint system.**

An MCP (Model Context Protocol) server that enables AI agents to generate beautiful, brand-consistent presentations _and_ printable PDF documents using HTML and CSS. The core insight: LLMs are exceptionally skilled at generating HTML/CSS but struggle with programmatic presentation APIs. By letting the LLM generate styled HTML and handling format conversion server-side, we achieve document quality that was previously impossible through direct PPTX or matplotlib-driven generation.

## Two output mediums

| Medium       | Format(s)                                              | Geometry              | Use cases                                    |
|--------------|--------------------------------------------------------|-----------------------|----------------------------------------------|
| **Slides**   | `slides_16_9` (default)                                | 1920×1080 landscape   | Presentations, pitch decks                   |
| **Print**    | `print_a4_portrait`, `print_letter_portrait`           | A4 / US Letter        | Study summaries, handouts, whitepapers       |

Both share Design Souls, asset pipeline, validation engine, and MCP App editor. Slide decks export to PPTX / PDF / HTML / Google Slides; print decks are PDF-only and include first-class inline-SVG diagrams and charts. See [`SPEC.md`](./SPEC.md) for the full v2.0 spec.

## How It Works

```
User Brief → LLM generates HTML/CSS → MCP validates against Design Soul → Render to PNG / PDF → Export
```

1. A **Design Soul** defines visual identity: colors, typography, spacing, shadows, components.
2. The LLM generates pages as self-contained HTML documents (1920×1080 for slides; 1240×1754 for A4; 1275×1650 for Letter) using the soul's CSS tokens.
3. The MCP server **validates** each page against the soul's constraints and format geometry, returning issues for self-correction.
4. On export, pages are rendered via Playwright and assembled into PPTX, PDF, or HTML.

For print decks, pages can opt into running headers + page numbers via a `<!-- @page-chrome {...} -->` directive; cross-page state resolves at export time.

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- A Chromium browser (installed automatically by Playwright on first render)

### Installation

```bash
npm install
npm run build
```

### Install Playwright browsers

```bash
npx playwright install chromium
```

### Running

**Stdio transport** (for MCP client integration):
```bash
npm start
```

**HTTP transport** (for remote/web access):
```bash
npm run start:http
# or with custom port
node build/index.js --transport http --port 8080
```

**Development mode** (with hot reload):
```bash
npm run dev
```

### Configuration

| Flag / Env Var | Default | Description |
|---|---|---|
| `--transport` / `PENGUI_TRANSPORT` | `stdio` | Transport mode: `stdio` or `http` |
| `--port` / `PENGUI_PORT` | `3000` | HTTP server port |
| `--host` / `PENGUI_HOST` | `127.0.0.1` | HTTP server host |
| `--persist-dir` / `PENGUI_PERSIST_DIR` | _(none)_ | Enable file-based persistence at this path |

## MCP Client Configuration

### Claude Desktop

Add to your `claude_desktop_config.json`:

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

Add to your `.claude/settings.json`:

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

With file persistence:

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

## Print Mode quickstart

```ts
// 1. Register + approve a soul as usual
// 2. Create the deck with a print format
create_deck({ soul_id, title: 'Exam summary', format: 'print_a4_portrait' })

// 3. Add pages using the print recipes (cover, toc, chapter_intro, content,
//    content_chart, content_diagram, compare, glossary, timeline, summary,
//    bibliography). Each page is self-contained HTML at 1240×1754.
// 4. Export to PDF
export_pdf({ deck_id })  // mode defaults to 'direct' for print
```

The LLM authors diagrams and charts as inline SVG styled with soul tokens. Templates for the tree/mind-map, flow, bar/line/pie charts, comparison matrix, and horizontal timeline live at the `pengui://docs/charts-and-diagrams` resource. A dedicated `create-print-document` MCP prompt walks an LLM through the full print workflow.

`export_pptx` and `export_google_slides` reject print decks with a `FORMAT_NOT_EXPORTABLE` error pointing to `export_pdf`.

## Tools (21)

### Design Soul Management

| Tool | Description |
|---|---|
| `register_design_soul` | Register a new Design Soul with 7 visual identity layers (color, typography, spacing, shape, depth, components, motion) |
| `approve_design_soul` | Approve a soul and auto-generate CSS tokens (~73), utility classes (~38), and 6 layout recipes |
| `list_design_souls` | List all registered souls with optional status filtering |
| `get_design_soul` | Retrieve a soul with optional layout recipes and style guide |
| `save_as_template` | Save a validated slide as a reusable layout recipe |

### Deck Management

| Tool | Description |
|---|---|
| `create_deck` | Create a new deck linked to a Design Soul |
| `add_slide` | Add a slide with HTML + metadata; auto-validates against soul constraints |
| `update_slide` | Update slide HTML/metadata; re-validates if HTML changed |
| `get_slide` | Retrieve a slide's HTML, metadata, and position |
| `remove_slide` | Remove a slide from the deck |
| `reorder_slides` | Reorder all slides in the deck |
| `get_deck_summary` | Lightweight deck overview without HTML bodies |

### Asset Management

| Tool | Description |
|---|---|
| `upload_asset` | Upload an image (PNG/SVG/JPEG), receive an `asset://UUID` reference |
| `list_assets` | List assets with optional scope/role filtering |
| `get_asset` | Retrieve asset metadata |
| `delete_asset` | Delete an asset |

### Validation

| Tool | Description |
|---|---|
| `validate_slide` | Two-stage validation: static lint (~50ms) and render-truth analysis via Playwright |

### Export

| Tool | Description |
|---|---|
| `render_preview` | Generate slide thumbnails (480x270) |
| `export_pptx` | Export as PowerPoint (.pptx) with configurable resolution and format |
| `export_pdf` | Export as PDF (image-based or direct HTML rendering) |
| `export_html` | Export as self-contained HTML with keyboard navigation |

## Resources & Prompts

### MCP Resources (10)

Documentation available at `pengui://docs/{name}`:

| Resource | Description |
|---|---|
| `overview` | Core concepts, workflow, and key rules |
| `slide-format` | Complete HTML structure reference |
| `design-souls` | 7-layer schema with all CSS token mappings |
| `validation` | Two-stage pipeline, scoring weights, tips |
| `assets` | Image management system and workflow |
| `css-utilities` | ~38 generated utility CSS classes |
| `recipes` | 6 built-in layout templates |
| `workflows` | Step-by-step guides for common tasks |
| `print-mode` | Print authoring guide: A4 / Letter recipe index, page-chrome directive reference |
| `charts-and-diagrams` | Inline-SVG templates for tree / mind-map, flow, bar / line / pie charts, timeline |

### MCP Prompts (5)

| Prompt | Description |
|---|---|
| `onboarding` | First-time orientation with core concepts |
| `create-presentation` | Full workflow guide with customizable parameters |
| `design-soul-guide` | How to craft a thorough Design Soul |
| `slide-html-quickref` | Copy-paste-ready HTML template with checklist |
| `create-print-document` | Print-mode workflow: soul → A4/Letter deck → cover/TOC/chapters/diagrams → PDF export |

## Design Soul System

A Design Soul defines the complete visual identity of a presentation through 7 layers:

| Layer | What It Defines |
|---|---|
| **Color Language** | Canvas, surface, border, text colors, accent system, semantic colors |
| **Typography** | Font families (display, body, mono), size scale, weights, line heights |
| **Spacing** | Base unit, scale (xs through xxxl), safe area inset |
| **Shape** | Corner radius signatures (sm, md, lg, full), per-component radius |
| **Depth & Shadow** | Shadow definitions (soft, medium, elevated), border width/opacity |
| **Components** | Card, button, input, badge padding and styling tokens |
| **Motion & Tone** | Transition durations, easing curves, do/don't rules, north star sentence |

When a soul is approved, the server generates:
- **~73 CSS custom properties** (e.g., `--color-canvas`, `--text-h1`, `--space-md`, `--radius-card`)
- **~38 utility CSS classes** (layout, typography, cards, etc.)
- **6 layout recipes** (title slide, two-column, metrics, features grid, closing CTA, blank themed)
- **LLM-consumable style guide**

### Token-Only CSS Enforcement

All visual properties in slide HTML must reference Design Soul tokens via CSS custom properties. Arbitrary literal values are rejected by the validator:

```css
/* Allowed - references soul tokens */
.card {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  padding: var(--space-lg) var(--space-md);
  box-shadow: var(--shadow-soft);
}

/* Rejected - literal values bypass the soul */
.card {
  background: #F3EDE4;
  border-radius: 22px;
  padding: 36px 32px;
}
```

## Validation Engine

Two-stage validation ensures brand consistency:

**Stage 1 - Static Lint** (~50ms per slide):
- Token compliance (colors, spacing, fonts reference `var(--token)`)
- Structural checks (DOCTYPE, metadata block, root container)
- Network isolation (no external URLs)
- Safe area compliance (1920x1080 with 48px inset)

**Stage 2 - Render Truth** (~800ms per slide, opt-in):
- WCAG contrast ratio verification
- Overflow and clipping detection
- Rendered color sampling against token values
- Text legibility verification

**Scoring**: Weighted composite (tokens 30%, contrast 25%, typography 15%, spacing 15%, structural 15%). Slides pass when error count is zero; the style score (0.0-1.0) drives iterative improvement.

## Slide HTML Contract

Every slide must be a self-contained HTML document:

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    :root {
      --color-canvas: #FAF7F2;
      --color-surface: #FFFFFF;
      /* ... all soul tokens ... */
    }
    /* Slide styles using var(--token) only */
  </style>
</head>
<body>
  <!-- @slide-meta {"title": "...", "type": "...", "narrative": "...", "key_points": [...], "tags": [...]} -->
  <div class="slide" style="width: 1920px; height: 1080px; overflow: hidden;">
    <!-- Slide content -->
  </div>
</body>
</html>
```

**Rules:**
- No external network dependencies (fonts, CDNs, scripts)
- No JavaScript required for layout
- Fixed 1920x1080 root container with 48px safe area inset
- All visual values via CSS custom properties
- Metadata block required as `<!-- @slide-meta {...} -->` comment

## Asset System

Images are managed through `asset://` references:

1. Upload via `upload_asset` with base64 data
2. Receive an `asset://UUID` reference
3. Use in slide HTML: `<img src="asset://UUID" />`
4. Server resolves to `data:image/*;base64,...` at render/export time

Assets can be scoped to a soul, a deck, or globally, and tagged with roles (`logo`, `content`).

## Project Structure

```
pengui-slides/
├── src/
│   ├── index.ts                    # CLI entry point (stdio/http)
│   ├── server.ts                   # MCP server factory
│   ├── container.ts                # Dependency injection
│   ├── config.ts                   # Configuration defaults
│   ├── types/                      # TypeScript type definitions
│   ├── domain/
│   │   ├── souls/                  # Soul lifecycle, token/recipe generation
│   │   ├── decks/                  # Deck & slide management, revision tracking
│   │   ├── validation/             # Two-stage validation pipeline
│   │   │   ├── stage1/             # Static lint checks
│   │   │   └── stage2/             # Playwright render-truth checks
│   │   ├── assets/                 # Asset upload, resolution, lifecycle
│   │   ├── metadata/               # Metadata parsing, embedding, export
│   │   └── rendering/              # Playwright rendering, browser pool, exporters
│   ├── storage/
│   │   ├── file/                   # File-based persistence (JSON)
│   │   └── memory/                 # In-memory persistence (Maps)
│   ├── tools/                      # MCP tool implementations (21 tools)
│   ├── resources/                  # MCP resource definitions (8 docs)
│   ├── prompts/                    # MCP prompt templates (4 prompts)
│   └── infrastructure/             # Logger, ID generation, hashing, clock
├── templates/                      # Reference layout templates (6)
├── docs/                           # Architecture documentation
├── output/                         # Rendered images and exports
├── package.json
└── tsconfig.json
```

## Development

```bash
# Type checking
npm run typecheck

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint
npm run lint

# Development server with hot reload
npm run dev
```

## Tech Stack

| Component | Technology |
|---|---|
| MCP Server | `@modelcontextprotocol/sdk` (TypeScript) |
| HTML Rendering | Playwright (Chromium) |
| PPTX Assembly | PptxGenJS |
| HTML Parsing | Cheerio |
| CSS Processing | PostCSS |
| Validation Schemas | Zod |
| Persistence | In-memory (default) or file-based (JSON) |
| HTTP Transport | Express |

## License

MIT
