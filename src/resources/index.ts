/**
 * MCP Resources for Pengui Slides.
 *
 * Exposes long-form documentation as pengui:// resources so that LLM agents
 * can read the system manual, slide format spec, validation rules, etc.
 * on demand — without bloating every tool description.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerChartsAndDiagramsResource } from './print-charts-and-diagrams.resource.js';
import { registerPrintModeResource } from './print-mode.resource.js';
import { registerDocumentModeResource } from './document-mode.resource.js';
import { registerCollaborationResource } from './collaboration.resource.js';
import { registerSlideIRSchemaResource } from './slide-ir.resource.js';

/* ------------------------------------------------------------------ */
/*  Content                                                           */
/* ------------------------------------------------------------------ */

const OVERVIEW = `# Pengui Slides — System Overview

Pengui Slides is an MCP server that lets LLM agents create branded decks and print
documents. **As of v4.5, agents author SlideIR / SectionIR — structured node trees,
not raw HTML.** The server compiles IR to HTML deterministically using the deck's
Design Soul tokens. Two authoring models live inside it; pick the right one FIRST.

## The two authoring models

| \`authoringModel\` | Default for | You author | Exports |
|-------------------|-------------|------------|---------|
| \`"slides"\` | \`slides_16_9\` (and legacy print, opt-in) | A \`slide_ir\` tree (hero / prose / image / callout / two_column nodes) per slide. The server compiles to a 1920×1080 (or print-sized) HTML page using soul tokens. | \`export_pptx\`, \`export_pdf\`, \`export_html\`, \`export_google_slides\`, \`render_preview\` |
| \`"document"\` | \`print_a4_portrait\`, \`print_letter_portrait\` (v3 default) | A \`section_ir\` tree per content block. The server compiles to a single \`<section class="pengui-section pengui-{kind}">\` fragment. The exporter composes sections into one flowing HTML document and lets Chromium paginate. | \`export_pdf\` only |

\`create_deck\` picks the default model from the \`format\` argument; pass
\`authoring_model\` explicitly to override. After creation, call
\`get_deck_summary\` — the \`authoringModel\` field tells you whether to use
slide verbs or section verbs.

## Core Concepts

| Concept | What it is |
|---------|-----------|
| **Design Soul** | A complete visual identity (colors, typography, spacing, shapes, depth, components, motion). Generates ~73 CSS custom-property tokens, 6 slide recipes, and 11 print recipes. Shared across both authoring models. |
| **Deck** | An ordered collection of slides **or** sections tied to one Design Soul, with a \`format\` and an \`authoringModel\`. |
| **SlideIR / SectionIR** | The agent-authored source of truth. A tree of nodes (hero, prose, image, callout, two_column) referencing soul tokens by SEMANTIC role (\`background: "accent"\` → \`var(--color-accent-primary)\`). Fetch \`pengui://schema/slide-ir\` for the grammar. |
| **Slide / Section HTML** | The COMPILED snapshot. Stored alongside the IR for the App, exporters, and validators. Do NOT edit \`html\` directly — mutate the IR and let the server recompile. |
| **Asset** | An uploaded image (PNG, SVG, JPEG). Referenced from IR by id (\`asset_id: "uuid"\`); the server resolves to data URIs at render/export time. |
| **Recipe** | A validated layout template (HTML). Inspirational reference only — agents author via IR, not by copying recipe HTML. v4.6+ will add IR-native recipes. |
| **Validation** | Runs automatically on add/update. Slide validator (Stage 1 + 2) for slide-model; Section Stage 1 for each fragment + Document Stage 2 at export for document-model. Produces a 0–1 style score. |

## Pick-your-path workflow

**Slide-model deck (slides_16_9, or legacy print with \`authoring_model: "slides"\`):**
\`\`\`
1. register_design_soul   → draft soul
2. approve_design_soul    → generates tokens + recipes
3. upload_asset (×N)      → asset_id refs (use in IR image nodes)
4. create_deck            → slide-model deck
5. (optional) read pengui://schema/slide-ir for the IR node grammar
6. add_slide (×N)         → pass slide_ir + metadata; server compiles
7. export_pptx / export_pdf / export_html / export_google_slides
\`\`\`

**Document-model deck (print_a4_portrait / print_letter_portrait, v3 default):**
\`\`\`
1. register_design_soul   → draft soul
2. approve_design_soul    → generates tokens + recipes
3. upload_asset (×N)      → asset_id refs
4. create_deck { format: 'print_a4_portrait' }   → document-model deck (automatic)
5. update_document_meta   → (optional) running chrome + TOC config
6. (optional) read pengui://schema/slide-ir for the IR node grammar (sections share it)
7. add_section (×N)       → pass section_ir + kind + metadata; server compiles
8. export_pdf             → document composed, paginated by Chromium
\`\`\`

## Key Rules

- **Author IR, not HTML.** \`add_slide\` / \`update_slide\` take \`slide_ir\`;
  \`add_section\` / \`update_section\` take \`section_ir\`. The compiled HTML
  is a derived snapshot — mutate IR and let the server recompile.
- **Choose the right verbs for the model.** Slide verbs reject document-model
  decks with \`WRONG_AUTHORING_MODEL\`, naming the right tool. Section verbs
  mirror.
- **Token references are SEMANTIC, not literal.** A node says \`background: "accent"\`;
  the compiler emits \`var(--color-accent-primary)\`. Agents never write hex.
- **Validate IR shape before submitting.** \`validate_slide_ir\` /
  \`validate_section_ir\` give Zod-level shape errors without storage side effects.
- **Images flow by id.** Upload via \`upload_asset\`, get an asset id, reference
  it from an IR \`image\` node's \`asset_id\` field.
- **(v4.6) For targeted edits, use \`apply_slide_node_edit\` /
  \`apply_section_node_edit\`.** Replace one node by structural path
  (e.g. \`["body", 0]\` or \`["body", 2, "right", 1]\`) without resubmitting
  the full IR. Cheaper than full updates for small fixes.
- **(v4.6) Reuse layouts via \`apply_recipe\`.** Recipes captured from
  IR-authored slides carry \`ir\`; \`apply_recipe { deck_id, recipe_id }\`
  instantiates the recipe IR as a new slide.
- **(v4.6) Token overrides cascade.** \`apply_token_override\` recompiles
  every IR slide on every deck linked to the soul, so the App preview and
  exports update automatically.

## Where to go next

- \`pengui://schema/slide-ir\` — JSON Schema for the IR node grammar (the contract)
- \`pengui://docs/document-mode\` — continuous-document authoring guide (document-model decks)
- \`pengui://docs/design-souls\` — the 7 layers + every CSS token they emit
- \`pengui://docs/validation\` — all lints, scoring, tips for score 1.0
- \`pengui://docs/assets\` — upload & reference images
- \`pengui://docs/workflows\` — step-by-step guides for each path
- \`pengui://docs/slide-format\` — (legacy) the HTML the compiler emits, for debugging
`;

const SLIDE_FORMAT = `# Slide HTML Format — Compiler Output Reference

> **v4.5 note:** Agents author **SlideIR**, not HTML. The server compiles IR
> to the HTML described below. This doc is preserved for debugging the
> compiler output, validating exported \`.html\` files, and as a reference
> for what \`slide.html\` looks like when read via \`get_slide\`. To author
> a slide, use \`add_slide\` with \`slide_ir\`; fetch \`pengui://schema/slide-ir\`
> for the IR grammar.

Every slide is a **standalone HTML document** emitted by the compiler.
The server stores, validates, and renders them independently.

## 🔸 First: pick the right dimensions for your deck's format

A deck's \`format\` (set at \`create_deck\` time) determines the required \`.slide\` dimensions.
A slide HTML authored for the wrong format fails the safe-area validation.

| Deck format              | \`.slide\` width × height | Safe-area inset | Export surface          |
|--------------------------|--------------------------|-----------------|-------------------------|
| \`slides_16_9\` (default) | **1920 × 1080 px**       | 48 px           | PPTX / PDF / HTML / GS  |
| \`print_a4_portrait\`     | **1240 × 1754 px**       | 96 px           | PDF only                |
| \`print_letter_portrait\` | **1275 × 1650 px**       | 96 px           | PDF only                |

**If your deck is a print format**, the canonical template below uses slide dimensions —
substitute the print values and read the print authoring guide at
\`pengui://docs/print-mode\` before building content. Diagrams and charts for print decks
are documented at \`pengui://docs/charts-and-diagrams\`.

## Canonical Structure

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    /* 1. Soul CSS tokens — ALL of them, every slide */
    :root {
      --color-canvas: #1D1D1B;
      --color-surface: #2A2A28;
      /* ... all ~73 tokens from the soul ... */
    }

    /* 2. Base reset — note body/html are declared explicitly because
       the universal "*" selector (specificity 0) does not override the
       browser UA stylesheet's body { margin: 8px } rule. */
    html, body { margin: 0; padding: 0; }
    * { box-sizing: border-box; }

    /* 3. Slide container — REQUIRED dimensions */
    .slide {
      width: 1920px;
      height: 1080px;
      padding: var(--space-safe-area);
      background: var(--color-canvas);
      color: var(--color-text-primary);
      font-family: var(--font-body);
      font-size: var(--text-body);
      font-weight: var(--weight-normal);
      line-height: var(--line-height-body);
      letter-spacing: var(--letter-spacing-body);
      overflow: hidden;
      position: relative;
    }

    /* 4. Utility classes (optional — from soul's utility CSS) */
    /* 5. Custom per-slide styles (use var() for ALL values) */
  </style>
</head>
<body>
  <!-- @slide-meta {"layout":"title-slide","title":"My Title"} -->
  <div class="slide">
    <!-- Slide content here -->
  </div>
</body>
</html>
\`\`\`

## Mandatory Elements

| Element | Why | Validation check |
|---------|-----|-----------------|
| \`<!DOCTYPE html>\` | Must be the very first thing | structural-check-doctype (error) |
| \`<!-- @slide-meta {...} -->\` | Valid JSON with at least \`layout\` and \`title\` | structural-check-meta-missing/invalid (error) |
| \`<div class="slide">\` | Root visual container | structural-check-root-container (error) |
| \`.slide { width: Wpx; height: Hpx }\` | Frame dimensions — W/H come from the deck's format (see table above) | safe-area-check (warning) — names the deck format in the error message |
| \`.slide { padding: var(--space-safe-area) }\` | Safe-area inset via token (not a literal) | safe-area-check (error) |
| \`.slide { position: relative }\` | Required. Makes the slide a positioned ancestor so any absolutely-positioned child (\`position: absolute\` with \`left/top/right/bottom\`) resolves against the slide's padding box. Missing it is a silent layout failure — absolute children escape up to \`<html>\` and fill the viewport, triggering confusing overflow errors that can't be fixed from inside the .slide CSS. | safe-area-check (error) — names the missing property in the message |
| \`:root { ... }\` with all soul tokens | Token definitions for var() references | Needed for tokens to resolve |
| \`html, body { margin: 0; padding: 0 }\` | Required. The universal selector \`* { margin: 0 }\` has specificity 0 and does NOT override the browser UA stylesheet's \`body { margin: 8px }\` (specificity 1). Explicit \`html, body\` wins. Without this the slide renders offset by 8px from the viewport origin. | (renderer correctness; not a hard lint) |

## What NOT to Do

- ❌ Use \`<section>\` as root — must be \`<div class="slide">\`
- ❌ Omit the DOCTYPE — validation will fail
- ❌ Use literal hex colors (\`#FD312E\`) — use \`var(--color-accent-primary)\`
- ❌ Use literal spacing (\`24px\`) for padding/margin/gap — use \`var(--space-lg)\`
- ❌ Link to Google Fonts or any external URL — network-isolation error
- ❌ Put raw base64 in img src — upload via \`upload_asset\`, use the \`asset://UUID\` ref
- ❌ Omit the \`@slide-meta\` comment — the server injects it, but the JSON must be valid
- ❌ Drop \`position: relative\` from .slide — absolutely-positioned descendants break
- ❌ Rely on \`* { margin: 0 }\` alone for body reset — declare \`html, body\` explicitly

## Common Pitfalls

Two non-obvious CSS gotchas that waste cycles when discovered at validation time.
Both are fixed in the canonical template above; this section exists so that a model
paraphrasing the template (not copying it verbatim) knows which lines are load-bearing.

### 1. \`.slide\` needs \`position: relative\`

Any child you position with \`position: absolute; left/top/right/bottom: ...\` resolves
against the nearest positioned ancestor. If \`.slide\` is not positioned, the child
walks up the tree until it hits \`<html>\` — and now its \`top: 96px\` is measured from
the page origin, not from the slide's padding box. Symptom: your absolutely-positioned
wrapper reports bounds like \`[0, 0, 1240, 1754]\` instead of sitting inside the safe
area. The fix is one line: \`.slide { position: relative }\`.

### 2. \`html, body { margin: 0 }\` — the universal \`*\` selector doesn't help

\`* { margin: 0; padding: 0; box-sizing: border-box }\` is a fine reset for ordinary
elements but CSS specificity has a gotcha: \`*\` has specificity 0, and the browser UA
stylesheet includes \`body { margin: 8px }\` (specificity 1). The type selector beats
the universal selector, so without an explicit \`html, body { margin: 0 }\` rule the
slide renders 8px off. Declare both — \`html, body { margin: 0; padding: 0 }\` — and
keep \`* { box-sizing: border-box }\` separately.

## Images in Slides

Upload images first with \`upload_asset\`, which returns a ref like \`asset://c4b8887d-...\`.
Use that ref in your HTML:

\`\`\`html
<img src="asset://c4b8887d-fedd-4c27-89ad-2aa8875f7d3b" class="logo">
\`\`\`

At render/export time the server replaces \`asset://\` refs with \`data:\` URIs automatically.
The LLM never sees or handles the base64 data.
`;

const DESIGN_SOULS = `# Design Souls — Layer Reference

A Design Soul defines a complete visual identity through 7 layers.
When approved, ~73 CSS custom-property tokens and 6 layout recipes are generated.

## Layer Schemas

### 1. color
| Field | CSS Token | Description |
|-------|-----------|-------------|
| canvas | --color-canvas | Base canvas background |
| surface | --color-surface | Surface background |
| surfaceAlt | --color-surface-alt | Alternative surface |
| border | --color-border | Default border |
| textPrimary | --color-text-primary | Primary text |
| textSecondary | --color-text-secondary | Secondary text |
| textTertiary | --color-text-tertiary | Tertiary text |
| textInverse | --color-text-inverse | Inverse text |
| accentPrimary | --color-accent-primary | Primary accent |
| accentSecondary | --color-accent-secondary | Secondary accent |
| accentWarm | --color-accent-warm | Warm accent |
| success | --color-success | Semantic success |
| warning | --color-warning | Semantic warning |
| error | --color-error | Semantic error |
| info | --color-info | Semantic info |

### 2. typography
| Field | CSS Token |
|-------|-----------|
| fontDisplay | --font-display |
| fontBody | --font-body |
| fontMono | --font-mono |
| sizeHero | --text-hero |
| sizeH1 | --text-h1 |
| sizeH2 | --text-h2 |
| sizeH3 | --text-h3 |
| sizeBody | --text-body |
| sizeLabel | --text-label |
| sizeCaption | --text-caption |
| weightNormal | --weight-normal |
| weightMedium | --weight-medium |
| weightBold | --weight-bold |
| lineHeightHeading | --line-height-heading |
| lineHeightBody | --line-height-body |
| letterSpacingHeading | --letter-spacing-heading |
| letterSpacingBody | --letter-spacing-body |

### 3. spacing
| Field | CSS Token |
|-------|-----------|
| baseUnit | --space-base |
| xs | --space-xs |
| sm | --space-sm |
| md | --space-md |
| lg | --space-lg |
| xl | --space-xl |
| xxl | --space-xxl |
| xxxl | --space-xxxl |
| safeAreaInset | --space-safe-area |

### 4. shape
| Field | CSS Token |
|-------|-----------|
| none | --radius-none |
| sm | --radius-sm |
| md | --radius-md |
| lg | --radius-lg |
| xl | --radius-xl |
| full | --radius-full |
| buttonRadius | --radius-button |
| cardRadius | --radius-card |
| inputRadius | --radius-input |
| badgeRadius | --radius-badge |

### 5. depth
| Field | CSS Token |
|-------|-----------|
| shadowNone | --shadow-none |
| shadowSoft | --shadow-soft |
| shadowMedium | --shadow-medium |
| shadowElevated | --shadow-elevated |
| shadowInner | --shadow-inner |
| borderWidth | --border-width |
| borderOpacity | --border-opacity |

### 6. components
| Field | CSS Token |
|-------|-----------|
| cardPadding | --card-padding |
| cardShadow | --card-shadow |
| cardBorderWidth | --card-border-width |
| buttonPaddingX | --button-padding-x |
| buttonPaddingY | --button-padding-y |
| inputPaddingX | --input-padding-x |
| inputPaddingY | --input-padding-y |
| inputBorderWidth | --input-border-width |
| badgePaddingX | --badge-padding-x |
| badgePaddingY | --badge-padding-y |

### 7. motion
| Field | CSS Token | Note |
|-------|-----------|------|
| durationFast | --duration-fast | |
| durationNormal | --duration-normal | |
| durationSlow | --duration-slow | |
| easingDefault | --easing-default | |
| easingEmphasized | --easing-emphasized | |
| northStar | *(not a CSS token)* | Design voice statement |
| doRules | *(not a CSS token)* | Array of "do" rules |
| dontRules | *(not a CSS token)* | Array of "don't" rules |

## Approval & Recipes

After \`approve_design_soul\`, the server generates:
- **~73 CSS custom-property tokens** (all prefixed \`--\`)
- **6 built-in layout recipes**: title-slide, two-column, metrics, features-grid, closing-cta, blank-themed
- **~38 utility CSS classes** using \`var(--token)\` references

Use \`get_design_soul\` with \`include_recipes: true\` to see the generated HTML templates.
`;

const VALIDATION = `# Validation — Checks and Scoring

Validation runs automatically on add/update. Two parallel pipelines exist, one per
authoring model. Always check \`authoringModel\` on \`get_deck_summary\` first.

## Slide-model pipeline

Runs on \`add_slide\` / \`update_slide\`. Callable directly via \`validate_slide\`
(pass \`deck_id\` so the checks use the deck's format geometry; without it the
defaults are \`slides_16_9\` at 1920×1080).

### Stage 1 — Static Lint (always runs)
| Check | Category | Severity | What it catches |
|-------|----------|----------|----------------|
| structural-check | structural | error | Missing DOCTYPE, missing/invalid @slide-meta, missing \`<div class="slide">\` |
| network-isolation | structural | error | Any \`http://\`, \`https://\`, or \`//\` URL in the HTML |
| safe-area-check | structural | error/warning | \`.slide\` missing the deck-format \`width\`/\`height\`, missing \`padding: var(--space-safe-area)\`, or missing \`position: relative\` |
| token-compliance | token | error | Literal hex/rgb/hsl colors in CSS (must use \`var(--color-*)\`) |
| spacing-compliance | spacing | warning | Literal px/rem/em values for padding/margin/gap (must use \`var(--space-*)\`) |
| font-compliance | typography | error | Font families not in soul's allowed list or CSS generic families |
| diagram-legibility | typography/token | warning | (print recipes \`content_chart\`/\`content_diagram\` only) SVG missing viewBox, literal px font-sizes, literal hex fills, missing legend on multi-series charts |

### Stage 2 — Render Truth (only when \`depth: "full"\`)
Uses Playwright at the deck's format geometry to render the slide, then checks:
| Check | Category | Severity | What it catches |
|-------|----------|----------|----------------|
| contrast-checker | contrast | error | WCAG 2.1 contrast ratio failures (4.5:1 normal, 3:1 large text) |
| overflow-detector | structural | warning | Elements overflowing the format frame |
| color-sampler | token | warning | Rendered colors not matching soul token values |
| legibility-check | contrast | error | Invisible text (opacity < 0.1, visibility:hidden, display:none) or font-size < 10px |

## Document-model pipeline

Runs on \`add_section\` / \`update_section\`. Callable directly via \`validate_section\`.
Disabled for document mode: \`safe-area-check\`, \`overflow-detector\`, slide-shaped
\`structural-check\` (they assume a fixed-size \`.slide\` container).

### Section Stage 1 — fast (always runs on add/update)
| Check | Category | Severity | What it catches |
|-------|----------|----------|----------------|
| fragment-contract | structural | error | Fragment is not a single \`<section class="pengui-section pengui-{kind}">\` root, or contains DOCTYPE / \`<html>\` / \`<head>\` / \`<body>\` / \`<script>\` / \`<link>\` / standalone \`<style>\` / \`:root\` tokens / fixed page-shaped dimensions |
| wrapper-class | structural | error | Keep-together kinds (figure, chart, diagram, callout, quote, image) missing the canonical \`.pengui-*\` class |
| section-shape | structural | error | Kind-specific shape failure (e.g. \`figure\` missing \`<figure>\`/\`<figcaption>\`, \`table\` missing \`<thead>\`/\`<tbody>\`) |
| token-compliance | token | error | Literal hex/rgb/hsl colors |
| spacing-compliance | spacing | warning | Literal px/rem/em in padding/margin/gap |
| font-compliance | typography | error | Fonts not in soul's allowed list |
| network-isolation | structural | error | External URLs |

### Document Stage 2 — render-truth (runs at \`export_pdf\` time)
Composes the full document, renders with Playwright, measures pagination:
| Check | Category | Severity | What it catches |
|-------|----------|----------|----------------|
| split-keep-together | structural | warning | Keep-together block (figure / chart / diagram / callout / quote / image) splits across a page boundary |
| orphan-heading | structural | warning | An H2/H3 ends up alone at the bottom of a page with no following body |
| contrast-checker | contrast | error | WCAG contrast failures (as in slide mode) |
| color-sampler | token | warning | Rendered colors not matching soul tokens |

## Scoring (shared by both pipelines)

| Category | Weight |
|----------|--------|
| Token compliance | 30% |
| Contrast accessibility | 25% |
| Typography | 15% |
| Spacing | 15% |
| Structural | 15% |

Deductions: **−0.20 per error**, **−0.05 per warning**, clamped to [0, 1] per category.
Overall score = weighted average of all categories. \`passed: true\` when \`errorCount === 0\`.

## Tips for Score 1.0

**Slide model:**
1. Include ALL soul CSS tokens in the \`:root { }\` block.
2. Use \`var(--color-*)\` for every color property.
3. Use \`var(--space-*)\` for every padding, margin, and gap.
4. Use only the soul's fonts (check \`allowedFonts\` from the soul).
5. Ensure \`.slide\` carries the right dimensions (from deck format), \`padding: var(--space-safe-area)\`, AND \`position: relative\`.
6. Declare \`html, body { margin: 0; padding: 0 }\` explicitly — the universal \`*\` selector won't override the UA stylesheet.
7. No external URLs — everything self-contained.
8. Ensure sufficient contrast between text and backgrounds.
9. Keep all content within the format's frame.

**Document model:**
1. Root is ONE \`<section class="pengui-section pengui-{kind}">\` element.
2. No DOCTYPE / html / head / body / script / link / standalone style / :root in the fragment.
3. Wrap keep-together content (figure/chart/diagram/callout/quote/image) in its canonical \`.pengui-*\` class so the universal \`break-inside: avoid\` rule applies.
4. Use \`<table><thead><tbody>\` for tabular data so the header repeats across pages.
5. Use \`var(--*)\` tokens, not literals. Don't re-declare tokens — the composer injects them once.
6. For page breaks, use \`break_hints\` on \`add_section\`, never filler content.
`;

const ASSETS = `# Asset System — Image Management

## Overview

The asset system lets you upload images (logos, photos, charts) and reference them
in slide HTML using lightweight \`asset://UUID\` refs. The server resolves refs to
\`data:\` URIs only at the render/export boundary.

## Workflow

\`\`\`
1. upload_asset → returns { asset_id, ref: "asset://UUID" }
2. Use ref in HTML: <img src="asset://UUID" class="logo">
3. On export/render: server replaces asset://UUID → data:image/png;base64,...
\`\`\`

## Supported Formats

| MIME Type | Extension |
|-----------|-----------|
| image/png | .png |
| image/svg+xml | .svg |
| image/jpeg | .jpg, .jpeg |

## Scoping

Assets have a scope that controls visibility:
- **soul** — Logo tied to a design soul (available for all decks using that soul)
- **deck** — Content image for a specific deck
- **global** — Available everywhere

## Roles

- **logo** — Brand marks. Usually scoped to a soul.
- **content** — Photos, illustrations, charts. Usually scoped to a deck.

## Important

- The LLM never sees or handles base64 data — only the \`asset://UUID\` ref.
- The ref is a lightweight string safe for the LLM's context window.
- \`list_assets\` and \`get_asset\` return metadata + ref only, never binary.
- \`upload_asset\` accepts base64 as input and returns the ref for future use.
`;

const CSS_UTILITIES = `# CSS Utility Classes

When a Design Soul is approved, ~38 utility CSS classes are generated.
All values use \`var(--token)\` — no hardcoded values.

Include these in your slide's \`<style>\` block (they're part of the soul's utility CSS).

## Layout
| Class | Effect |
|-------|--------|
| .grid-2 | 2-column grid, gap: var(--space-lg) |
| .grid-3 | 3-column grid, gap: var(--space-lg) |
| .grid-4 | 4-column grid, gap: var(--space-lg) |
| .flex-center | Flex centered (both axes) |
| .flex-col | Flex column |
| .flex-between | Flex space-between |
| .full-height | height: 100% |

## Cards
| Class | Effect |
|-------|--------|
| .card | Surface bg, border, soft shadow, card padding/radius |
| .card-glass | Glassmorphism (60% surface + backdrop-filter blur) |
| .card-elevated | Elevated shadow |

## Typography
| Class | Effect |
|-------|--------|
| .text-hero | Display font, hero size, bold |
| .text-h1 | Display font, h1 size, bold |
| .text-h2 | Display font, h2 size, bold |
| .text-h3 | Display font, h3 size, medium weight |
| .label | Mono font, label size, uppercase |
| .caption | Caption size, tertiary color |
| .text-accent | Accent-primary color |
| .text-secondary | Secondary text color |
| .text-inverse | Inverse text color |

## Backgrounds
| Class | Effect |
|-------|--------|
| .bg-canvas | Canvas background |
| .bg-surface | Surface background |
| .bg-surface-alt | Alt surface background |
| .bg-dark | Dark bg with inverse text |
| .bg-accent | Accent bg with inverse text |

## Decorative
| Class | Effect |
|-------|--------|
| .gradient-blob | Radial gradient blob (pseudo-element) |
| .glass | Backdrop blur + translucent surface |
| .decorative-dots | Dot-pattern overlay (pseudo-element) |

## Components
| Class | Effect |
|-------|--------|
| .badge | Small label with accent color on surface-alt bg |
| .pill | Rounded pill badge |
| .btn | Base button styles |
| .btn-primary | Accent bg, inverse text |
| .btn-secondary | Surface bg, bordered |
| .icon-container | Centered icon box |

## Spacing
| Class | Effect |
|-------|--------|
| .section-header | margin-bottom: var(--space-xl) |
| .gap-sm | gap: var(--space-sm) |
| .gap-md | gap: var(--space-md) |
| .gap-lg | gap: var(--space-lg) |
`;

const RECIPES = `# Built-in Layout Recipes

When a Design Soul is approved, 6 layout recipes are generated automatically.
Each recipe is a complete, validated HTML template using the soul's tokens.

## Recipe Types

### 1. title-slide
Centered layout with category label, hero title, subtitle, and bottom bar.
**Tags:** opening, hero, centered, introduction
**Use for:** Opening slides, section dividers.

### 2. two-column
60/40 flex split — heading + description left, visual area right.
**Tags:** split, text-image, content, overview
**Use for:** Text-plus-image layouts, feature explanations.

### 3. metrics
Section header + 3-column grid of metric cards (big number + label + description).
**Tags:** data, numbers, kpi, dashboard, cards
**Use for:** KPIs, statistics, data highlights.

### 4. features-grid
Section header + 3-column grid of feature cards (icon + title + description + badge).
**Tags:** features, grid, cards, icons, product
**Use for:** Product features, service offerings, benefits lists.

### 5. closing-cta
Vertically centered call-to-action with icon, heading, description, and buttons.
**Tags:** closing, cta, action, centered, ending
**Use for:** Closing slides, next-step prompts.

### 6. blank-themed
Empty slide container with CSS theme applied and optional page number.
**Tags:** blank, minimal, custom, freeform
**Use for:** Fully custom layouts that don't fit other recipes.

## How to Use Recipes

1. \`get_design_soul\` with \`include_recipes: true\` to see all recipe HTML.
2. Use a recipe as a starting point — modify content while keeping the structure.
3. Or create original layouts: just ensure all validation rules pass.
4. \`save_as_template\` to save your own validated slides as custom recipes.
`;

const WORKFLOWS = `# Workflows — Step-by-Step Guides

Which workflow you follow depends on the deck's \`authoringModel\`. For any
existing deck, call \`get_deck_summary\` first to see it.

## Workflow 1a: Create a Slide Presentation (slide-model)

Use for \`slides_16_9\` decks, or for legacy print decks opted into
\`authoring_model: "slides"\`.

\`\`\`
Step 1 — Register the Design Soul
  Tool: register_design_soul
  Input: name, description, all 7 layers
  Result: soul in "draft" status

Step 2 — Approve the Soul
  Tool: approve_design_soul
  Input: soul_id
  Result: ~73 CSS tokens + slide recipes + print recipes

Step 3 — Upload Assets (optional)
  Tool: upload_asset (once per image)
  Result: asset_id + ref (asset://UUID) for each

Step 4 — Get the Soul's Style Guide
  Tool: get_design_soul { include_recipes: true, include_style_guide: true }

Step 5 — Create a Deck
  Tool: create_deck { soul_id, title, format: "slides_16_9" }  // or a print
                                                                // format +
                                                                // authoring_model:
                                                                // "slides" for
                                                                // the legacy
                                                                // print flow
  Result: deck_id, authoringModel: "slides"

Step 6 — Add Slides (repeat per slide)
  Tool: add_slide
  Input: deck_id, slide_ir (a tree of nodes — see pengui://schema/slide-ir),
         metadata
  Result: slide_id, validation score, source_kind: "authored_ir"
  Tip: validate_slide_ir gives a fast schema check before submitting.
  IMPORTANT: Do not introduce new blocking issues while iterating.
  Fix pre-existing issues when requested or before export.

Step 7 — Export
  Tool: export_pptx, export_pdf, export_html, or export_google_slides
  Result: file path to the exported output
\`\`\`

## Workflow 1b: Create a Print Document (document-model, v3 default)

Use for \`print_a4_portrait\` and \`print_letter_portrait\` decks (the v3 default is
\`authoringModel: "document"\`). Read \`pengui://docs/document-mode\` first.

\`\`\`
Step 1 — Register + approve the Design Soul (same as 1a, Steps 1–4)

Step 5 — Create a Deck
  Tool: create_deck { soul_id, title, format: "print_a4_portrait" }
  Result: deck_id, authoringModel: "document" (automatic)

Step 6 — Configure document meta (optional but recommended)
  Tool: update_document_meta
  Input: deck_id, meta: { chrome: { runningTitle, pageNumber, footerAlign },
                          toc: { includeKinds: ["chapter_header"] } }
  Result: deck.documentMeta is set — running chrome + auto TOC active

Step 7 — Add Sections (repeat per content block)
  Tool: add_section
  Input: deck_id, kind, section_ir (a tree of nodes — see
         pengui://schema/slide-ir; sections share the slide IR grammar),
         metadata, break_hints (optional)
  Result: section_id, position, validation score
  Tip: validate_section_ir gives a fast schema check before submitting.
  Sections are content blocks, not pages. The composer paginates on export.

Step 8 — Export
  Tool: export_pdf  (only export supported for document decks)
  Result: paginated PDF with running chrome and keep-together guards applied
\`\`\`

## Workflow 2: Add an Image

Same shape in both models — only the reference site differs.

\`\`\`
Step 1 — Upload the image
  Tool: upload_asset
  Input: name, filename, mime_type,
         scope_type: "deck" | "soul" | "global",
         soul_id or deck_id (per scope),
         role: "logo" | "content",
         data_base64
  Result: ref = "asset://UUID"

Step 2 — Use the asset id in an IR image node
  Both models: { type: "image", asset_id: "UUID-from-step-1", caption? }
  The compiler emits <img src="asset://UUID" ...> automatically.

Step 3 — The server resolves refs at render/export time
  asset://UUID → data:image/png;base64,...
\`\`\`

## Workflow 3a: Iterate on a Slide (slide-model)

\`\`\`
Step 1 — add_slide or update_slide → validation results
Step 2 — Common fixes (most legacy lints don't apply to IR slides — the
         compiler emits canonical structure by construction):
  - "image asset not found" → upload_asset first, use the returned id
  - "schema validation: unknown node type" → fetch
    pengui://schema/slide-ir for the current node grammar
  - "two_column.left/right contains nested two_column" → flatten;
    v4.5 explicitly disallows recursion inside two_column
  - "rich text run has both bold and italic" → split into separate runs
Step 3 — Resubmit via update_slide. Or use validate_slide_ir for a
         schema-only pre-flight check (no storage side effects).
\`\`\`

## Workflow 3b: Iterate on a Section (document-model)

\`\`\`
Step 1 — add_section or update_section → validation results
Step 2 — Common fixes (most legacy fragment-contract lints don't fire on
         IR-compiled sections — the compiler always emits one canonical
         <section class="pengui-section pengui-{kind}"> root):
  - "schema validation: unknown node type" → fetch
    pengui://schema/slide-ir for the current node grammar
  - "image asset not found" → upload_asset first, use the returned id
  - "two_column.left/right contains nested two_column" → flatten
Step 3 — Resubmit via update_section. Or use validate_section_ir for a
         schema-only pre-flight check. Stage 2 (split-keep-together,
         orphan-heading) only runs at export_pdf time.
\`\`\`

## Workflow 4: Save a Slide as a Template (recipe)

\`\`\`
Step 1 — add_slide with valid IR → slide_id with passing validation
Step 2 — save_as_template → new HTML recipe on the soul (compiled snapshot)
Step 3 — get_design_soul { include_recipes: true } — the new recipe is there
\`\`\`

Note: in v4.5 \`save_as_template\` saves the slide's compiled HTML, not its IR.
That makes recipes useful as visual references but NOT as templates that
\`add_slide\` can consume directly (since add_slide takes IR). v4.6+ will
add IR-native recipe authoring.
`;

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

export function registerAllResources(server: McpServer): void {
  registerChartsAndDiagramsResource(server);
  registerPrintModeResource(server);
  registerDocumentModeResource(server);
  registerCollaborationResource(server);
  registerSlideIRSchemaResource(server);
  server.registerResource('overview', 'pengui://docs/overview', {
    description: 'High-level overview of Pengui Slides: concepts, workflow, and key rules.',
    mimeType: 'text/markdown',
  }, () => ({
    contents: [{ uri: 'pengui://docs/overview', mimeType: 'text/markdown', text: OVERVIEW }],
  }));

  server.registerResource('slide-format', 'pengui://docs/slide-format', {
    description: 'Complete slide HTML format reference: canonical structure, mandatory elements, common mistakes.',
    mimeType: 'text/markdown',
  }, () => ({
    contents: [{ uri: 'pengui://docs/slide-format', mimeType: 'text/markdown', text: SLIDE_FORMAT }],
  }));

  server.registerResource('design-souls', 'pengui://docs/design-souls', {
    description: 'Design Soul layer schemas: all 7 layers, their fields, and the CSS tokens each generates.',
    mimeType: 'text/markdown',
  }, () => ({
    contents: [{ uri: 'pengui://docs/design-souls', mimeType: 'text/markdown', text: DESIGN_SOULS }],
  }));

  server.registerResource('validation', 'pengui://docs/validation', {
    description: 'Validation pipeline: all stage 1 and stage 2 checks, scoring weights, tips for score 1.0.',
    mimeType: 'text/markdown',
  }, () => ({
    contents: [{ uri: 'pengui://docs/validation', mimeType: 'text/markdown', text: VALIDATION }],
  }));

  server.registerResource('assets', 'pengui://docs/assets', {
    description: 'Asset system: upload images, get asset://UUID refs, how resolution works at render time.',
    mimeType: 'text/markdown',
  }, () => ({
    contents: [{ uri: 'pengui://docs/assets', mimeType: 'text/markdown', text: ASSETS }],
  }));

  server.registerResource('css-utilities', 'pengui://docs/css-utilities', {
    description: 'All ~38 utility CSS classes generated for a Design Soul: layout, cards, typography, backgrounds, components, spacing.',
    mimeType: 'text/markdown',
  }, () => ({
    contents: [{ uri: 'pengui://docs/css-utilities', mimeType: 'text/markdown', text: CSS_UTILITIES }],
  }));

  server.registerResource('recipes', 'pengui://docs/recipes', {
    description: 'The 6 built-in layout recipes: title-slide, two-column, metrics, features-grid, closing-cta, blank-themed.',
    mimeType: 'text/markdown',
  }, () => ({
    contents: [{ uri: 'pengui://docs/recipes', mimeType: 'text/markdown', text: RECIPES }],
  }));

  server.registerResource('workflows', 'pengui://docs/workflows', {
    description: 'Step-by-step workflows: create a presentation, add images, iterate on slides, create custom recipes.',
    mimeType: 'text/markdown',
  }, () => ({
    contents: [{ uri: 'pengui://docs/workflows', mimeType: 'text/markdown', text: WORKFLOWS }],
  }));
}
