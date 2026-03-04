/**
 * MCP Resources for Pengui Slides.
 *
 * Exposes long-form documentation as pengui:// resources so that LLM agents
 * can read the system manual, slide format spec, validation rules, etc.
 * on demand — without bloating every tool description.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/* ------------------------------------------------------------------ */
/*  Content                                                           */
/* ------------------------------------------------------------------ */

const OVERVIEW = `# Pengui Slides — System Overview

Pengui Slides is an MCP server that lets LLM agents create branded slide decks.

## Core Concepts

| Concept | What it is |
|---------|-----------|
| **Design Soul** | A complete visual identity (colors, typography, spacing, shapes, depth, components, motion). Generates ~73 CSS custom-property tokens and 6 layout recipes. |
| **Deck** | An ordered collection of slides tied to one Design Soul. |
| **Slide** | A self-contained HTML document (1920×1080 px) carrying its own \`<style>\` block with all soul tokens. |
| **Asset** | An uploaded image (PNG, SVG, JPEG). Referenced in slide HTML as \`asset://UUID\` — never as raw base64. |
| **Recipe** | A validated layout template (title-slide, two-column, metrics, features-grid, closing-cta, blank-themed). |
| **Validation** | Two-stage pipeline (static lint + render-truth) producing a 0–1 style score. |

## Typical Workflow

\`\`\`
1. register_design_soul  → creates a draft soul
2. approve_design_soul   → generates CSS tokens + 6 recipes
3. upload_asset           → store logo / content images, get asset://UUID refs
4. create_deck            → empty deck linked to the soul
5. add_slide (×N)         → each slide is self-contained HTML; validated automatically
6. export_pptx / export_pdf / export_html → final output
\`\`\`

## Key Rules

- **Every slide must include ALL soul CSS tokens** in its own \`<style>\` block.
  Slides are rendered in isolation — there is no shared stylesheet.
- **Never use literal colors or spacing values.** Use \`var(--token)\` everywhere.
  The validation pipeline rejects \`#hex\`, \`rgb()\`, and literal \`px\` values for
  spacing properties.
- **Never reference external URLs.** No Google Fonts, no CDN links, no remote images.
  Everything must be self-contained. Use \`asset://UUID\` for images.
- **The slide frame is exactly 1920×1080 px.** The \`.slide\` container must declare
  \`width: 1920px; height: 1080px\`.
`;

const SLIDE_FORMAT = `# Slide HTML Format — Complete Reference

Every slide is a **standalone HTML document**. The LLM generates the full document
for each slide, and the server stores, validates, and renders them independently.

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

    /* 2. Base reset */
    * { margin: 0; padding: 0; box-sizing: border-box; }

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
| \`.slide { width:1920px; height:1080px }\` | Frame dimensions | safe-area-check (warning) |
| \`:root { ... }\` with all soul tokens | Token definitions for var() references | Needed for tokens to resolve |

## What NOT to Do

- ❌ Use \`<section>\` as root — must be \`<div class="slide">\`
- ❌ Omit the DOCTYPE — validation will fail
- ❌ Use literal hex colors (\`#FD312E\`) — use \`var(--color-accent-primary)\`
- ❌ Use literal spacing (\`24px\`) for padding/margin/gap — use \`var(--space-lg)\`
- ❌ Link to Google Fonts or any external URL — network-isolation error
- ❌ Put raw base64 in img src — upload via \`upload_asset\`, use the \`asset://UUID\` ref
- ❌ Omit the \`@slide-meta\` comment — the server injects it, but the JSON must be valid

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

Validation runs automatically on \`add_slide\` and \`update_slide\`.
You can also call \`validate_slide\` directly.

## Two Stages

### Stage 1 — Static Lint (always runs)
| Check | Category | Severity | What it catches |
|-------|----------|----------|----------------|
| structural-check | structural | error | Missing DOCTYPE, missing/invalid @slide-meta, missing \`<div class="slide">\` |
| network-isolation | structural | error | Any \`http://\`, \`https://\`, or \`//\` URL in the HTML |
| safe-area-check | structural | warning | \`.slide\` missing \`width:1920px\` or \`height:1080px\` |
| token-compliance | token | error | Literal hex/rgb/hsl colors in CSS (must use \`var(--color-*)\`) |
| spacing-compliance | spacing | warning | Literal px/rem/em values for padding/margin/gap (must use \`var(--space-*)\`) |
| font-compliance | typography | error | Font families not in soul's allowed list or CSS generic families |

### Stage 2 — Render Truth (only when \`depth: "full"\`)
Uses Playwright at 1920×1080 to render the slide, then checks:
| Check | Category | Severity | What it catches |
|-------|----------|----------|----------------|
| contrast-checker | contrast | error | WCAG 2.1 contrast ratio failures (4.5:1 normal, 3:1 large text) |
| overflow-detector | structural | warning | Elements overflowing the 1920×1080 frame |
| color-sampler | token | warning | Rendered colors not matching soul token values |
| legibility-check | contrast | error | Invisible text (opacity < 0.1, visibility:hidden, display:none) or font-size < 10px |

## Scoring

| Category | Weight |
|----------|--------|
| Token compliance | 30% |
| Contrast accessibility | 25% |
| Typography | 15% |
| Spacing | 15% |
| Structural | 15% |

Deductions: **−0.20 per error**, **−0.05 per warning**, clamped to [0, 1] per category.
Overall score = weighted average of all categories.

\`passed: true\` when \`errorCount === 0\`.

## Tips for Score 1.0

1. Include ALL soul CSS tokens in the \`:root { }\` block.
2. Use \`var(--color-*)\` for every color property.
3. Use \`var(--space-*)\` for every padding, margin, and gap.
4. Use only the soul's fonts (check \`allowedFonts\` from the soul).
5. Ensure \`.slide { width: 1920px; height: 1080px; }\`.
6. No external URLs — everything self-contained.
7. Ensure sufficient contrast between text and backgrounds.
8. Keep all content within the 1920×1080 frame.
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

## Workflow 1: Create a Full Presentation

\`\`\`
Step 1 — Register the Design Soul
  Tool: register_design_soul
  Input: name, description, all 7 layers (color, typography, spacing, shape, depth, components, motion)
  Result: soul in "draft" status with an ID

Step 2 — Approve the Soul
  Tool: approve_design_soul
  Input: soul_id
  Result: ~73 CSS tokens + 6 recipes generated

Step 3 — Upload Assets (optional)
  Tool: upload_asset (once per image)
  Input: name, filename, mime_type, scope, role, data_base64
  Result: asset_id + ref (asset://UUID) for each

Step 4 — Get the Soul's Style Guide
  Tool: get_design_soul
  Input: soul_id, include_recipes: true, include_style_guide: true
  Result: CSS tokens, utility classes, recipe HTML templates

Step 5 — Create a Deck
  Tool: create_deck
  Input: soul_id, title
  Result: deck_id

Step 6 — Add Slides
  Tool: add_slide (repeat for each slide)
  Input: deck_id, html (full HTML document with all tokens), metadata
  Result: slide_id, validation score
  IMPORTANT: Each slide must score 1.0 — fix and resubmit if it doesn't

Step 7 — Export
  Tool: export_pptx, export_pdf, or export_html
  Input: deck_id
  Result: file path to the exported output
\`\`\`

## Workflow 2: Add an Image to a Slide

\`\`\`
Step 1 — Upload the image
  Tool: upload_asset
  Input: name, filename, mime_type, scope: { type: "deck", deck_id: "..." }, role: "content", data_base64
  Result: ref = "asset://UUID"

Step 2 — Use the ref in slide HTML
  <img src="asset://UUID" style="width: var(--space-xxxl); border-radius: var(--radius-md);">

Step 3 — The server resolves refs at render/export time
  asset://UUID → data:image/png;base64,...
\`\`\`

## Workflow 3: Iterate on a Slide

\`\`\`
Step 1 — Add or update the slide
  Tool: add_slide or update_slide
  Result: validation results with score, issues list

Step 2 — If score < 1.0, read the issues
  Common fixes:
  - "literal color" → replace #hex with var(--color-*)
  - "literal spacing" → replace 24px with var(--space-lg)
  - "font not allowed" → use only fonts from the soul
  - "external URL" → remove CDN links, use asset:// for images
  - "missing DOCTYPE" → ensure <!DOCTYPE html> is first
  - "missing root container" → use <div class="slide">

Step 3 — Resubmit the fixed HTML
  Tool: update_slide with corrected HTML
  Repeat until score = 1.0
\`\`\`

## Workflow 4: Create a Custom Recipe

\`\`\`
Step 1 — Create a slide with your custom layout
  Tool: add_slide with the custom HTML
  Requirement: must pass validation (score 1.0)

Step 2 — Save as template
  Tool: save_as_template
  Input: slide_id, name, description, type, tags
  Result: new recipe added to the soul

Step 3 — Reuse
  The template appears in get_design_soul with include_recipes: true
\`\`\`
`;

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

export function registerAllResources(server: McpServer): void {
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
