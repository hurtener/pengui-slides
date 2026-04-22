/**
 * Recipe Generator for Design Souls.
 *
 * Generates layout recipe HTML documents that use utility CSS classes
 * and inline HTML comments (instead of @slot markers). Each recipe is
 * a complete, working HTML page with example content that an LLM can
 * modify freely.
 *
 * ## Slide recipes (6)
 * Generated programmatically from inline body/style builders. The soul's
 * CSS tokens are injected into the `<style>` block.
 *
 * ## Print recipes (11)
 * Loaded from pre-authored HTML files in `templates/print/`. The soul's
 * CSS tokens are injected into the `:root { }` placeholder comment inside
 * each template's `<style>` block. This preserves the rich layout and
 * narrative already in each template while still giving each recipe the
 * soul's color, spacing, shape, and font tokens.
 *
 * Both recipe sets are always generated when `generateAll` is called.
 * The caller (soul-service / approve_soul tool) decides which to expose
 * based on the deck's format medium.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SoulId } from '../../types/common.js';
import type { LayoutRecipe } from '../../types/design-soul.js';
import type { Clock } from '../../infrastructure/clock.js';
import { generateTemplateId } from '../../infrastructure/id-generator.js';
import { generateUtilityCss } from './utility-css-generator.js';

// ── Print template loader ───────────────────────────────────────

/**
 * Resolve the `templates/print/` directory relative to this source file.
 * Works in both:
 * - vitest (source TypeScript): src/domain/souls/ → ../../../ = repo root
 * - compiled (build/domain/souls/): → ../../../ = repo root
 */
const TEMPLATES_PRINT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../templates/print',
);

// ── Recipe Metadata ─────────────────────────────────────────────

interface RecipeSpec {
  type: string;
  name: string;
  description: string;
  tags: string[];
  buildBody: () => string;
  buildStyles: () => string;
}

// ── HTML Constants ──────────────────────────────────────────────

const SLIDE_META = '<!-- @slide-meta -->';

const RESET_STYLES = `* {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }`;

const SLIDE_BASE_STYLES = `.slide {
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
    }`;

// ── Document Wrapper ────────────────────────────────────────────

function wrapDocument(cssTokens: string, utilityCss: string, extraStyles: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    ${cssTokens}

    ${RESET_STYLES}

    ${SLIDE_BASE_STYLES}

    /* ── Utility CSS Library ─────────────── */
    ${utilityCss}

    /* ── Recipe-specific styles ──────────── */
    ${extraStyles}
  </style>
</head>
<body>
  ${SLIDE_META}
  <div class="slide">
    ${body}
  </div>
</body>
</html>`;
}

// ── Recipe Builders ─────────────────────────────────────────────

// ---- Title Slide ----

function titleSlideBody(): string {
  return `<!-- Title Slide: Center a bold statement. Adjust freely — add/remove elements as needed. -->
    <div class="flex-center flex-col full-height" style="text-align: center;">
      <!-- Category label (optional) — swap text or remove entirely -->
      <div class="label text-accent" style="margin-bottom: var(--space-md);">Product Launch</div>
      <!-- Hero title — the main statement -->
      <h1 class="text-hero" style="max-width: 80%; margin-bottom: var(--space-lg);">The Future of Presentations</h1>
      <!-- Subtitle — supporting context -->
      <p class="text-h3 text-secondary" style="max-width: 60%; margin-bottom: var(--space-xxl);">A compelling subtitle that sets the context for what's ahead.</p>
    </div>
    <!-- Bottom bar (optional) — author, date, or branding -->
    <div class="flex-between" style="position: absolute; bottom: var(--space-safe-area); left: var(--space-safe-area); right: var(--space-safe-area);">
      <span class="caption">Author Name</span>
      <span class="caption">March 2026</span>
    </div>`;
}

function titleSlideStyles(): string {
  return '';
}

// ---- Two Column ----

function twoColumnBody(): string {
  return `<!-- Two-Column: Left text (60%), right visual (40%). Adjust ratio via flex-basis. -->
    <div style="display: flex; gap: var(--space-xl); height: 100%;">
      <!-- Left column — text content -->
      <div class="flex-col" style="flex: 0 0 60%; justify-content: center;">
        <!-- Section label (optional) — categorize this slide -->
        <div class="label text-accent" style="margin-bottom: var(--space-sm);">Overview</div>
        <!-- Main heading -->
        <h2 class="text-h1" style="margin-bottom: var(--space-md);">Main Heading Goes Here</h2>
        <!-- Description — expand or split into bullet points -->
        <p class="text-secondary" style="line-height: var(--line-height-body); max-width: 90%;">A detailed description that explains this section of the presentation. This area supports longer-form text content and can be restructured as needed.</p>
      </div>
      <!-- Right column — visual area. Replace with image, chart, card group, etc. -->
      <div class="flex-center" style="flex: 0 0 calc(40% - var(--space-xl));">
        <div class="card" style="width: 100%; height: 80%; display: flex; align-items: center; justify-content: center;">
          <!-- Replace this placeholder with your visual content -->
          <span class="label text-secondary">Content Area</span>
        </div>
      </div>
    </div>`;
}

function twoColumnStyles(): string {
  return '';
}

// ---- Metrics ----

function metricsBody(): string {
  return `<!-- Metrics Dashboard: Header + 3-column grid of metric cards. Add/remove cards as needed. -->
    <!-- Section header -->
    <div class="section-header">
      <div class="label text-accent" style="margin-bottom: var(--space-sm);">Metrics</div>
      <h2 class="text-h2">Key Performance Indicators</h2>
    </div>
    <!-- Metric cards — duplicate or remove cards; the grid adapts -->
    <div class="grid-3">
      <!-- Metric card 1 -->
      <div class="card flex-col" style="justify-content: center;">
        <!-- Big number — use .text-accent for emphasis -->
        <div class="text-hero text-accent" style="margin-bottom: var(--space-xs);">99%</div>
        <div class="text-h3" style="margin-bottom: var(--space-xs);">Uptime</div>
        <p class="text-secondary">Consistent reliability across all services throughout the quarter.</p>
      </div>
      <!-- Metric card 2 -->
      <div class="card flex-col" style="justify-content: center;">
        <div class="text-hero text-accent" style="margin-bottom: var(--space-xs);">2.5x</div>
        <div class="text-h3" style="margin-bottom: var(--space-xs);">Growth Rate</div>
        <p class="text-secondary">Year-over-year revenue growth exceeding projections.</p>
      </div>
      <!-- Metric card 3 -->
      <div class="card flex-col" style="justify-content: center;">
        <div class="text-hero text-accent" style="margin-bottom: var(--space-xs);">10M+</div>
        <div class="text-h3" style="margin-bottom: var(--space-xs);">Active Users</div>
        <p class="text-secondary">Monthly active users across all platforms combined.</p>
      </div>
    </div>`;
}

function metricsStyles(): string {
  return '';
}

// ---- Features Grid ----

function featuresGridBody(): string {
  return `<!-- Features Grid: Header + 3-column grid of feature cards with icons. Add/remove cards freely. -->
    <!-- Section header -->
    <div class="section-header">
      <div class="label text-accent" style="margin-bottom: var(--space-sm);">Features</div>
      <h2 class="text-h2">What We Offer</h2>
    </div>
    <!-- Feature cards — each has icon, title, description, badge -->
    <div class="grid-3">
      <!-- Feature card 1 -->
      <div class="card flex-col gap-sm">
        <!-- Icon container — replace emoji/symbol with any icon -->
        <div class="icon-container">&hearts;</div>
        <div class="text-h3">Feature One</div>
        <p class="text-secondary">A short description of this feature and the value it provides to users.</p>
        <span class="badge">Core</span>
      </div>
      <!-- Feature card 2 -->
      <div class="card flex-col gap-sm">
        <div class="icon-container">&starf;</div>
        <div class="text-h3">Feature Two</div>
        <p class="text-secondary">A short description of this feature and the value it provides to users.</p>
        <span class="badge">New</span>
      </div>
      <!-- Feature card 3 -->
      <div class="card flex-col gap-sm">
        <div class="icon-container">&rarr;</div>
        <div class="text-h3">Feature Three</div>
        <p class="text-secondary">A short description of this feature and the value it provides to users.</p>
        <span class="badge">Popular</span>
      </div>
    </div>`;
}

function featuresGridStyles(): string {
  return '';
}

// ---- Closing CTA ----

function closingCtaBody(): string {
  return `<!-- Closing CTA: Centered call-to-action with heading, description, and buttons. -->
    <div class="flex-center flex-col full-height" style="text-align: center;">
      <!-- Icon or decorative element (optional) — remove if not needed -->
      <div style="width: var(--space-xxl); height: var(--space-xxl); border-radius: var(--radius-full); background: var(--color-surface-alt); display: flex; align-items: center; justify-content: center; font-size: var(--text-h1); color: var(--color-accent-primary); margin-bottom: var(--space-lg);">&rarr;</div>
      <!-- Main heading -->
      <h2 class="text-h1" style="margin-bottom: var(--space-md);">Ready to Get Started?</h2>
      <!-- Description — keep concise for a closing slide -->
      <p class="text-secondary" style="max-width: 60%; margin-bottom: var(--space-xl); line-height: var(--line-height-body);">Take the next step and see how we can help you achieve your goals. Our team is ready to support you.</p>
      <!-- Button row — adjust, add, or remove buttons -->
      <div style="display: flex; gap: var(--space-md);">
        <button class="btn btn-primary">Get Started</button>
        <button class="btn btn-secondary">Learn More</button>
      </div>
    </div>`;
}

function closingCtaStyles(): string {
  return '';
}

// ---- Blank Themed ----

function blankThemedBody(): string {
  return `<!-- Blank Themed: Empty canvas with theme applied. Add any content using utility classes. -->
    <!-- Page number (optional) — reposition or remove -->
    <div class="caption" style="position: absolute; bottom: var(--space-md); right: var(--space-safe-area); font-family: var(--font-mono);">1</div>`;
}

function blankThemedStyles(): string {
  return '';
}

// ── Recipe Specifications ───────────────────────────────────────

const RECIPE_SPECS: RecipeSpec[] = [
  {
    type: 'title-slide',
    name: 'Title Slide',
    description: 'Centered layout with category label, hero title, subtitle, and bottom bar for author/date. Ideal for opening slides and section breaks.',
    tags: ['opening', 'hero', 'centered', 'introduction'],
    buildStyles: titleSlideStyles,
    buildBody: titleSlideBody,
  },
  {
    type: 'two-column',
    name: 'Two Column',
    description: '60/40 flex split with section label, heading, and description on the left, and a visual content area on the right. Great for text-plus-image layouts.',
    tags: ['split', 'text-image', 'content', 'overview'],
    buildStyles: twoColumnStyles,
    buildBody: twoColumnBody,
  },
  {
    type: 'metrics',
    name: 'Metrics Dashboard',
    description: 'Section header followed by a 3-column grid of metric cards, each with a big number, label, and description. Perfect for KPIs and data highlights.',
    tags: ['data', 'numbers', 'kpi', 'dashboard', 'cards'],
    buildStyles: metricsStyles,
    buildBody: metricsBody,
  },
  {
    type: 'features-grid',
    name: 'Features Grid',
    description: 'Section header with a 3-column grid of feature cards, each containing an icon, title, description, and badge tag. Ideal for product features and service offerings.',
    tags: ['features', 'grid', 'cards', 'icons', 'product'],
    buildStyles: featuresGridStyles,
    buildBody: featuresGridBody,
  },
  {
    type: 'closing-cta',
    name: 'Closing CTA',
    description: 'Vertically centered call-to-action with icon, heading, description, and primary/secondary buttons. Use for closing slides and next-step prompts.',
    tags: ['closing', 'cta', 'action', 'centered', 'ending'],
    buildStyles: closingCtaStyles,
    buildBody: closingCtaBody,
  },
  {
    type: 'blank-themed',
    name: 'Blank Themed',
    description: 'Empty slide container with only the CSS theme applied and an optional page number. Use as a starting point for fully custom layouts.',
    tags: ['blank', 'minimal', 'custom', 'freeform'],
    buildStyles: blankThemedStyles,
    buildBody: blankThemedBody,
  },
];

// ── Print recipe specifications ─────────────────────────────────

interface PrintRecipeSpec {
  filename: string;
  type: string;
  name: string;
  description: string;
  tags: string[];
}

const PRINT_RECIPE_SPECS: PrintRecipeSpec[] = [
  {
    filename: 'cover.html',
    type: 'cover',
    name: 'Print Cover Page',
    description: 'Title page for a print document: deck title, subtitle, author, date, and a soul-themed decorative stripe.',
    tags: ['cover', 'title', 'opening', 'print'],
  },
  {
    filename: 'toc.html',
    type: 'toc',
    name: 'Table of Contents',
    description: 'Table of contents with numbered entries and dotted leaders to page numbers. Supports sub-entries.',
    tags: ['toc', 'navigation', 'index', 'print'],
  },
  {
    filename: 'chapter-intro.html',
    type: 'chapter_intro',
    name: 'Chapter Introduction',
    description: 'Chapter opener with a large chapter number, chapter title, one-paragraph overview, and optional learning objectives.',
    tags: ['chapter', 'opener', 'section', 'intro', 'print'],
  },
  {
    filename: 'content.html',
    type: 'content',
    name: 'Content Page',
    description: 'Generic text page with heading, body paragraphs, subheadings, bullet lists, and an optional sidebar callout.',
    tags: ['content', 'text', 'body', 'sidebar', 'print'],
  },
  {
    filename: 'content-chart.html',
    type: 'content_chart',
    name: 'Content + Chart',
    description: 'Content page with heading, body text, and an inline SVG bar chart. Soul tokens style the chart colors.',
    tags: ['chart', 'data', 'bar-chart', 'visualization', 'print'],
  },
  {
    filename: 'content-diagram.html',
    type: 'content_diagram',
    name: 'Content + Diagram',
    description: 'Content page with heading, body text, and an inline SVG three-node flow diagram.',
    tags: ['diagram', 'flow', 'process', 'visualization', 'print'],
  },
  {
    filename: 'compare.html',
    type: 'compare',
    name: 'Two-Column Comparison',
    description: 'Side-by-side A vs B comparison with column headers, bulleted lists, and an optional summary verdict.',
    tags: ['compare', 'versus', 'two-column', 'contrast', 'print'],
  },
  {
    filename: 'glossary.html',
    type: 'glossary',
    name: 'Glossary',
    description: 'Term–definition list with bolded terms, dash separators, and optional alphabetical section breaks.',
    tags: ['glossary', 'definitions', 'terms', 'reference', 'print'],
  },
  {
    filename: 'timeline.html',
    type: 'timeline',
    name: 'Timeline',
    description: 'Horizontal timeline with six labeled events alternating above and below the axis. Soul tokens color the nodes.',
    tags: ['timeline', 'history', 'chronology', 'events', 'print'],
  },
  {
    filename: 'summary.html',
    type: 'summary',
    name: 'Summary',
    description: 'Closing page with a numbered key-takeaways list and an optional pull-quote block.',
    tags: ['summary', 'conclusion', 'takeaways', 'closing', 'print'],
  },
  {
    filename: 'bibliography.html',
    type: 'bibliography',
    name: 'Bibliography',
    description: 'Numbered reference list in APA-like format with authors, year, title, source, and optional DOI.',
    tags: ['bibliography', 'references', 'citations', 'sources', 'print'],
  },
];

/**
 * Inject the soul's CSS tokens into a print template HTML string.
 *
 * Each print template contains a sentinel `:root {}` block:
 *
 *   ```css
 *   :root {
 *     /* Soul tokens are injected here by the recipe generator *\/
 *   }
 *   ```
 *
 * This function replaces that entire sentinel `:root { ... }` block (including
 * its braces) with the full `cssTokens` string from the token generator, which
 * includes both the slide-scale `:root {}` block and the print-override
 * `[data-pengui-medium="print"] {}` block. The template's own CSS rules
 * (below the sentinel) are preserved unchanged.
 */
function injectTokensIntoPrintTemplate(templateHtml: string, cssTokens: string): string {
  // Match the sentinel :root block that contains only the injection comment.
  // The regex uses a non-greedy match between :root { and } so it captures
  // only the sentinel block, not the first real CSS rule's closing brace.
  const SENTINEL_RE = /:root\s*\{[^}]*\/\*\s*Soul tokens are injected here by the recipe generator\s*\*\/[^}]*\}/;
  return templateHtml.replace(SENTINEL_RE, cssTokens);
}

// ── Recipe Generator Class ──────────────────────────────────────

export class RecipeGenerator {
  /**
   * Generate all 6 slide layout recipes for a given soul.
   *
   * Each recipe is a complete HTML document that includes:
   * 1. CSS tokens (:root { ... })
   * 2. Reset styles
   * 3. Slide base styles (1920×1080)
   * 4. The full utility CSS library
   * 5. Any per-recipe extra styles (minimal — most styling via utility classes)
   * 6. The body with inline HTML comments explaining flexibility
   *
   * @param soulId - The ID of the soul these recipes belong to
   * @param cssTokens - The full CSS block (root + print scope) from token-generator
   * @param clock - Clock for timestamp generation
   * @returns Array of 6 LayoutRecipe objects with source: 'built-in'
   */
  generateAll(soulId: SoulId, cssTokens: string, clock: Clock): LayoutRecipe[] {
    const utilityCss = generateUtilityCss();
    const now = clock.now();

    return RECIPE_SPECS.map((spec) => ({
      id: generateTemplateId(),
      soulId,
      type: spec.type,
      name: spec.name,
      description: spec.description,
      tags: spec.tags,
      source: 'built-in' as const,
      html: wrapDocument(cssTokens, utilityCss, spec.buildStyles(), spec.buildBody()),
      createdAt: now,
    }));
  }

  /**
   * Generate all 11 print layout recipes for a given soul.
   *
   * Each recipe is loaded from a pre-authored HTML file in `templates/print/`.
   * The soul's CSS tokens are injected into the template's `:root {}` placeholder.
   * The resulting HTML is a self-contained A4-portrait document (1240×1754 px)
   * that the LLM can modify as a starting point.
   *
   * @param soulId - The ID of the soul these recipes belong to
   * @param cssTokens - The full CSS block (root + print scope) from token-generator
   * @param clock - Clock for timestamp generation
   * @returns Array of 11 LayoutRecipe objects with source: 'built-in'
   */
  generatePrintAll(soulId: SoulId, cssTokens: string, clock: Clock): LayoutRecipe[] {
    const now = clock.now();

    return PRINT_RECIPE_SPECS.map((spec) => {
      const templatePath = path.join(TEMPLATES_PRINT_DIR, spec.filename);
      const rawHtml = fs.readFileSync(templatePath, 'utf-8');
      const html = injectTokensIntoPrintTemplate(rawHtml, cssTokens);

      return {
        id: generateTemplateId(),
        soulId,
        type: spec.type,
        name: spec.name,
        description: spec.description,
        tags: spec.tags,
        source: 'built-in' as const,
        html,
        createdAt: now,
      };
    });
  }
}
