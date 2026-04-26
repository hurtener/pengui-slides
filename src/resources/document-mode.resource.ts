/**
 * MCP Resource: pengui://docs/document-mode
 *
 * Authoring guide for the continuous-document (v3) print pipeline. Explains
 * the shift from page-bound slides to flowing Section blocks, the fragment
 * contract, the canonical wrapper classes, break hints, and validation.
 *
 * URI: pengui://docs/document-mode
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerResourceEntry } from './registry.js';

const RESOURCE_URI = 'pengui://docs/document-mode';

const CONTENT = `# Document Mode — Continuous-Document Authoring Guide

Print decks in Pengui Slides v3 are **continuous documents**, not stacks of page-sized slides. You author a linear list of **sections** (content blocks); the exporter composes them into one flowing HTML document and lets Chromium paginate naturally.

---

## Why the shift

The v2 "slide-per-page" model forced the model to fit content into page-sized boxes before seeing how it actually flowed. Even strong models wasted turns measuring paragraphs, trimming lines, and shrinking figures — not writing. Tiny edits shifted page boundaries unpredictably and restarted the whole overflow churn.

Continuous mode puts pagination back where it belongs: in the exporter's rendering engine. You write meaningful, long-form content with natural semantics (headings, paragraphs, figures, tables); Chromium splits pages intelligently with universal break rules the composer emits for you.

---

## Workflow

\`\`\`
1. register_design_soul → approve_design_soul → create_deck { format: 'print_a4_portrait' }
       └─ authoringModel auto-set to 'document' (override with authoringModel: 'slides' for legacy v2 flow)
2. get_design_soul → include_recipes: true (fetch block recipes from templates/document/)
3. update_document_meta { chrome: {...}, toc: {...} }   (optional; configures running chrome + TOC)
4. add_section (×N)   sections are CONTENT BLOCKS, not pages
5. export_pdf
\`\`\`

---

## Section kinds

| kind | Purpose | Break default |
|---|---|---|
| \`cover\` | Title page / hero. | full-page, no chrome, break-after: page |
| \`chapter_header\` | Chapter opener. | full-page, no chrome, break-after: page |
| \`toc\` | Table of contents (auto-generated if fragment is empty). | break-after: page |
| \`prose\` | Flowing paragraphs + H2/H3 + bullets. | may split across pages |
| \`figure\` | SVG/img with \`<figcaption>\`. | **keep-together** |
| \`chart\` | Inline SVG chart (bar/line/pie) with axes. | **keep-together** |
| \`diagram\` | Inline SVG mind-map / tree / flow. | **keep-together** |
| \`table\` | \`<table>\` with \`<thead>\`/\`<tbody>\`. | **splits; header repeats** |
| \`callout\` | Boxed note/tip/warning. | **keep-together** |
| \`comparison\` | Two-column A vs B block. | may split |
| \`glossary\` | \`<dl>\` definition list. | may split |
| \`bibliography\` | Numbered \`<ol>\` of refs. | may split |
| \`quote\` | Pull-quote with attribution. | **keep-together** |
| \`image\` | Raster image with caption. | **keep-together** |

**Keep-together** kinds are guarded by a universal \`break-inside: avoid\` rule targeting the canonical wrapper class (\`.pengui-figure\`, \`.pengui-chart\`, \`.pengui-diagram\`, \`.pengui-callout\`, \`.pengui-quote\`, \`.pengui-image\`). The class MUST be present in the fragment — Section Stage 1 enforces this.

---

## The fragment contract — CRITICAL

A section's HTML is a FRAGMENT, not a full document. It **MUST**:

1. Have a single root: \`<section class="pengui-section pengui-{kind}">…</section>\`.
2. **NOT** contain \`<!DOCTYPE>\`, \`<html>\`, \`<head>\`, \`<body>\`, \`<script>\`, or \`<link>\`.
3. **NOT** contain standalone \`<style>\` tags. Recipe CSS is registered once at compose time; use inline \`style="…"\` on elements only as a last resort.
4. **NOT** declare \`:root { ... }\` custom properties. Soul tokens are injected once by the composer.
5. **NOT** set page-shaped dimensions (\`width: 1240px\`, \`height: 1754px\`, \`overflow: hidden\`) on the root wrapper.
6. Wrap keep-together content in canonical classes (\`pengui-figure\`, \`pengui-chart\`, etc.).

**Do NOT emit a \`<!-- @section-meta -->\` comment yourself.** The server always injects it from the metadata struct when persisting — on add, update, and reorder. Hand-written comments are stripped and replaced.

Everything is enforced by Section Stage 1 lints — errors surface in one turn. In v4.5 the section HTML is compiled from \`section_ir\`, so the canonical wrapper is always emitted; structural lints firing on stored fragments mean the SectionIR needs adjustment via \`update_section\`.

---

## Break hints

When the kind's default isn't right, pass \`break_hints\` on \`add_section\`:

\`\`\`json
{
  "break_hints": {
    "break_before": "page" | "auto" | "avoid",
    "break_after":  "page" | "auto" | "avoid",
    "keep_together": true | false,
    "full_page":     true | false
  }
}
\`\`\`

- \`full_page: true\` ⇒ the section fills a whole page (min-height: 100vh minus margins) and forces a break after. Chrome is suppressed.
- \`keep_together: true\` ⇒ emits \`break-inside: avoid\` on the wrapper. Combine with the canonical kind wrapper class for best results.

---

## Running chrome

Configure once at the deck level via \`update_document_meta\`:

\`\`\`json
{
  "meta": {
    "chrome": {
      "runningTitle": "My Handbook",
      "pageNumber": true,
      "footerAlign": "right",
      "hide": false
    }
  }
}
\`\`\`

Full-page sections (cover, chapter_header, or any section with \`full_page: true\`) suppress chrome automatically. Per-section overrides live in \`metadata.chromeOverrides\`:

\`\`\`json
{
  "metadata": {
    "chromeOverrides": {
      "runningTitle": "Chapter 2 — Techniques",
      "hide": false,
      "resetPageCounter": false
    }
  }
}
\`\`\`

Running titles change per chapter via named \`@page\` contexts the composer emits automatically.

---

## TOC auto-generation

Configure in \`documentMeta.toc\`:

\`\`\`json
{
  "toc": {
    "maxDepth": 2,
    "includeKinds": ["chapter_header"]
  }
}
\`\`\`

Add a section with \`kind: "toc"\` and an **empty fragment body** (just the wrapper). The composer walks all \`chapter_header\` sections and fills in the \`<ol>\` with page numbers (\`target-counter(url(#sec-N), page)\`).

---

## Validation

- **Section Stage 1** runs on every \`add_section\` / \`update_section\`. Fragment contract, wrapper-class presence, figure/table shape, token/font compliance, network isolation. Fast (<100ms). Response includes a \`validation\` block with \`passed\`, \`error_count\`, \`warning_count\`, and \`issues[]\` — **always inspect it before moving to the next section**. Callable standalone via \`validate_section\`.
- **Document Stage 2** runs at export. Composes the full document, renders in Playwright, measures each keep-together block against page boundaries, flags splits. Reports page count. Not callable directly — it always runs as part of \`export_pdf\`.

Disabled for document mode: \`safe-area-check\`, \`overflow-detector\`, slide-shaped \`structural-check\` — they assume a fixed-size \`.slide\` container.

---

## Repairing sections

In v4.5 the section HTML fragment is compiled from \`section_ir\` — the source of truth. To fix any structural issue, call \`update_section\` with a corrected \`section_ir\`. The compiler always emits exactly one \`<section class="pengui-section pengui-{kind}">\` root with the canonical wrapper class, so most structural lints disappear automatically once the IR is well-formed.

Use \`validate_section_ir\` to schema-check a candidate IR before sending it to \`update_section\`. Use \`validate_section\` to run the full Stage 1 lint pipeline (token compliance, kind shape, etc.).

The \`@section-meta\` comment is **always** injected by the server from the stored metadata struct — never emit it and never edit it by hand. It re-embeds automatically on add / update / reorder.

---

## Example: add a figure section (v4.5 IR-first)

\`\`\`json
{
  "deck_id": "deck_abc",
  "kind": "figure",
  "section_ir": {
    "body": [
      { "type": "image", "asset_id": "uuid-from-upload_asset",
        "caption": [{ "text": "Figure 3.1 — Orbital resonance in the Jovian system." }] }
    ]
  },
  "metadata": {
    "title": "Fig 3.1",
    "narrative": "Illustrates the 1:2:4 resonance between Io, Europa, and Ganymede.",
    "tags": ["figure", "astronomy"]
  },
  "break_hints": { "keep_together": true }
}
\`\`\`

The compiler emits the canonical \`<section class="pengui-section pengui-figure">\`
fragment with the image and caption inside. The composer wraps it with
\`data-kind="figure"\`, applies \`break-inside: avoid\` on \`.pengui-figure\`,
and inserts it into the continuous document. Chromium paginates around it.

Fetch \`pengui://schema/slide-ir\` for the full IR node grammar — sections share
the same node union (hero / heading / prose / list / image / callout / quote /
table / divider / two_column).

---

## Do NOT

- Copy soul CSS tokens into every section's \`<style>\` block (they're injected once).
- Set \`width: 1240px\` or \`height: 1754px\` on the section wrapper.
- Use \`.slide\` as the root class (that's the v2 page-bound convention).
- Replace \`var(--*)\` token references with hex literals to "fix" token-compliance warnings — the warning means the soul didn't declare that token, not that var() is broken.
- Try to force a page break by adding empty filler. Use \`break_hints.break_before: "page"\` instead.

---

## Legacy v2 per-slide print decks

Still supported via \`authoringModel: 'slides'\` on \`create_deck\`. Not recommended for new work. See \`pengui://docs/print-mode\` for the legacy flow. The migration script \`scripts/migrate-legacy-print-deck.ts\` converts an existing slide-per-page print deck to continuous-document mode.
`;

export function registerDocumentModeResource(server: McpServer): void {
  registerResourceEntry(server, {
    uri: RESOURCE_URI,
    name: 'document-mode',
    mimeType: 'text/markdown',
    description:
      'Guide for authoring print decks as continuous flowing documents (Sections) in Pengui Slides v3.',
    getText: () => CONTENT,
  });
}
