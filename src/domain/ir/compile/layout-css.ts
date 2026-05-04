/**
 * Layout CSS — emits the stylesheet that styles every IR-emitted
 * `pengui-*` class using Soul tokens (var() references throughout).
 *
 * Same stylesheet text is used by both slide-mode and section-mode
 * compilation. Slide mode wraps with the .slide rules (canvas size +
 * safe-area + reset) on top; section mode skips those (the document
 * composer applies them at the page level).
 *
 * Token references are SOUL-NEUTRAL: this stylesheet does not name a
 * specific soul. Plug any soul into the page and the same IR renders in
 * the new visual language.
 */

/** CSS for the per-node `pengui-*` classes. Stable across modes. */
export const NODE_CSS = `
.pengui-align-left { text-align: left; }
.pengui-align-center { text-align: center; }
.pengui-align-right { text-align: right; }

/* Inline text-color overrides — applied via <span class="pengui-text-*">
 * around a single RichText run. All semantic, all soul-token-driven. */
.pengui-text-accent { color: var(--color-accent-primary); }
.pengui-text-accent-alt { color: var(--color-accent-secondary); }
.pengui-text-accent-warm { color: var(--color-accent-warm); }
.pengui-text-success { color: var(--color-success); }
.pengui-text-warning { color: var(--color-warning); }
.pengui-text-error { color: var(--color-error); }
.pengui-text-info { color: var(--color-info); }
.pengui-text-muted { color: var(--color-text-muted); }
.pengui-text-inverse { color: var(--color-text-inverse); }

.pengui-hero {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
.pengui-hero-eyebrow {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-label);
  font-weight: var(--weight-medium);
  letter-spacing: var(--letter-spacing-heading);
  /* Use the cascade-aware muted token by default — accent-on-canvas fails
     contrast on warm/low-contrast souls. Agents who want accent eyebrows
     can wrap the eyebrow run in a color flag (any semantic role). */
  color: var(--color-text-muted);
  text-transform: uppercase;
}
.pengui-hero-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-hero);
  font-weight: var(--weight-bold);
  line-height: var(--line-height-heading);
  letter-spacing: var(--letter-spacing-heading);
  color: var(--color-text-default);
}
.pengui-hero-subtitle {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-h3);
  font-weight: var(--weight-normal);
  line-height: var(--line-height-body);
  color: var(--color-text-muted);
}

.pengui-prose {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-body);
  line-height: var(--line-height-body);
  color: var(--color-text-default);
}
.pengui-prose strong { font-weight: var(--weight-bold); }
.pengui-prose em { font-style: italic; }
.pengui-prose code {
  font-family: var(--font-mono);
  font-size: 0.92em;
  padding: 0 var(--space-xs);
  background: var(--color-surface-alt);
  border-radius: var(--radius-sm);
}
.pengui-prose a {
  color: var(--color-accent-primary);
  text-decoration: underline;
}

.pengui-image {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin: 0;
}
.pengui-image-contain img { object-fit: contain; }
.pengui-image-cover img { object-fit: cover; }
.pengui-image img {
  width: 100%;
  height: auto;
  border-radius: var(--radius-md);
}
.pengui-image-caption {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-caption);
  color: var(--color-text-muted);
}

/* v4.12: pengui-chart figure wraps the ECharts-rendered SVG. The SVG
   author at 800×480 with a viewBox; CSS scales it to the container's
   width and lets the height follow the aspect ratio. */
.pengui-chart {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin: 0;
  width: 100%;
}
.pengui-chart-svg,
.pengui-chart > svg {
  width: 100%;
  height: auto;
  max-width: 100%;
}
.pengui-chart-caption {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-caption);
  color: var(--color-text-secondary);
}

.pengui-callout {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  padding: var(--space-md) var(--space-lg);
  border-radius: var(--radius-md);
  border-left: 4px solid var(--color-accent-primary);
  background: var(--color-surface);
}
.pengui-callout-title {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-label);
  font-weight: var(--weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-heading);
  color: var(--color-text-default);
}
.pengui-callout-body {
  font-family: var(--font-body);
  font-size: var(--text-body);
  line-height: var(--line-height-body);
  color: var(--color-text-default);
}
.pengui-callout-note { border-left-color: var(--color-info); }
.pengui-callout-warning { border-left-color: var(--color-warning); }
.pengui-callout-tip { border-left-color: var(--color-success); }
.pengui-callout-important { border-left-color: var(--color-error); }

.pengui-heading {
  margin: 0;
  font-family: var(--font-display);
  font-weight: var(--weight-bold);
  line-height: var(--line-height-heading);
  letter-spacing: var(--letter-spacing-heading);
  color: var(--color-text-default);
}
.pengui-heading-1 { font-size: var(--text-h1); }
.pengui-heading-2 { font-size: var(--text-h2); }
.pengui-heading-3 { font-size: var(--text-h3); }
.pengui-heading-4 { font-size: var(--text-h3); font-weight: var(--weight-medium); }
.pengui-heading-5 { font-size: var(--text-body); font-weight: var(--weight-bold); text-transform: uppercase; letter-spacing: var(--letter-spacing-heading); }
.pengui-heading-6 { font-size: var(--text-label); font-weight: var(--weight-bold); text-transform: uppercase; letter-spacing: var(--letter-spacing-heading); color: var(--color-text-muted); }

.pengui-list {
  margin: 0;
  padding-left: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-family: var(--font-body);
  font-size: var(--text-body);
  line-height: var(--line-height-body);
  color: var(--color-text-default);
}
.pengui-list-bullet { list-style: disc; }
.pengui-list-numbered { list-style: decimal; }
.pengui-list-checklist {
  list-style: none;
  padding-left: 0;
}
.pengui-list-checklist .pengui-list-item {
  position: relative;
  padding-left: var(--space-lg);
}
.pengui-list-checklist .pengui-list-item::before {
  content: "\\2713";
  position: absolute;
  left: 0;
  color: var(--color-success);
  font-weight: var(--weight-bold);
}
.pengui-list-item { margin: 0; }
.pengui-list-item strong { font-weight: var(--weight-bold); }
.pengui-list-item em { font-style: italic; }
.pengui-list-item a { color: var(--color-accent-primary); text-decoration: underline; }

.pengui-divider {
  border: 0;
  border-top: var(--border-width) solid var(--color-border);
  margin: 0;
  width: 100%;
}
.pengui-divider-sm { margin: var(--space-sm) 0; }
.pengui-divider-md { margin: var(--space-md) 0; }
.pengui-divider-lg { margin: var(--space-lg) 0; }

.pengui-quote {
  margin: 0;
  padding: var(--space-md) var(--space-lg);
  border-left: 4px solid var(--color-accent-primary);
  background: var(--color-surface);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  border-radius: var(--radius-md);
}
.pengui-quote-body {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-h3);
  font-style: italic;
  line-height: var(--line-height-body);
  color: var(--color-text-default);
}
.pengui-quote-attribution {
  font-family: var(--font-body);
  font-size: var(--text-label);
  font-style: normal;
  color: var(--color-text-muted);
}
.pengui-quote-attribution::before { content: "— "; }

.pengui-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--font-body);
  font-size: var(--text-body);
  color: var(--color-text-default);
}
.pengui-table-caption {
  caption-side: top;
  text-align: left;
  font-size: var(--text-label);
  color: var(--color-text-muted);
  margin-bottom: var(--space-xs);
}
.pengui-table-th,
.pengui-table-td {
  padding: var(--space-sm) var(--space-md);
  text-align: left;
  border-bottom: var(--border-width) solid var(--color-border);
  vertical-align: top;
}
.pengui-table-th {
  font-weight: var(--weight-bold);
  font-size: var(--text-label);
  text-transform: uppercase;
  letter-spacing: var(--letter-spacing-heading);
  color: var(--color-text-muted);
  background: var(--color-surface);
}
.pengui-table tr:last-child .pengui-table-td { border-bottom: 0; }

.pengui-two-column {
  display: grid;
  align-items: stretch;
}
.pengui-two-column-1-1 { grid-template-columns: 1fr 1fr; }
.pengui-two-column-1-2 { grid-template-columns: 1fr 2fr; }
.pengui-two-column-2-1 { grid-template-columns: 2fr 1fr; }
.pengui-gap-sm { gap: var(--space-sm); }
.pengui-gap-md { gap: var(--space-md); }
.pengui-gap-lg { gap: var(--space-lg); }
.pengui-two-column-left,
.pengui-two-column-right {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  min-width: 0;
  justify-content: center;
}

.pengui-grid {
  display: grid;
  align-items: start;
}
.pengui-grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
.pengui-grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
.pengui-grid-cols-4 { grid-template-columns: repeat(4, 1fr); }
.pengui-grid-align-start { align-items: start; }
.pengui-grid-align-center { align-items: center; }
.pengui-grid-align-stretch { align-items: stretch; }
.pengui-grid-cell {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  min-width: 0;
}

/* v4.8 mode-specific nodes */

.pengui-toc {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  font-family: var(--font-body);
  color: var(--color-text-default);
}
.pengui-toc-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-h2);
  font-weight: var(--weight-bold);
  letter-spacing: var(--letter-spacing-heading);
  line-height: var(--line-height-heading);
  color: var(--color-text-default);
}
.pengui-toc-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
.pengui-toc-list li {
  display: flex;
  justify-content: space-between;
  gap: var(--space-md);
  font-size: var(--text-body);
  color: var(--color-text-default);
  border-bottom: 1px dotted var(--color-border);
  padding-bottom: var(--space-xs);
}
.pengui-toc-list a {
  color: var(--color-text-default);
  text-decoration: none;
}

.pengui-section-divider {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-md);
  padding: var(--space-xl) var(--space-lg);
  text-align: center;
}
.pengui-section-divider-label {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-h2);
  font-weight: var(--weight-bold);
  letter-spacing: var(--letter-spacing-heading);
  line-height: var(--line-height-heading);
  color: var(--color-text-default);
  text-transform: uppercase;
}
.pengui-section-divider-ornament {
  display: block;
}
.pengui-section-divider-ornament-rule {
  width: 96px;
  height: 0;
  border-top: 2px solid var(--color-accent-primary);
}
.pengui-section-divider-ornament-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-accent-primary);
}

.pengui-bibliography {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
.pengui-bibliography-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-h2);
  font-weight: var(--weight-bold);
  letter-spacing: var(--letter-spacing-heading);
  line-height: var(--line-height-heading);
  color: var(--color-text-default);
}
.pengui-bibliography-list {
  margin: 0;
  padding-left: var(--space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  font-family: var(--font-body);
  font-size: var(--text-body);
  line-height: var(--line-height-body);
  color: var(--color-text-default);
}
.pengui-bibliography-item {
  margin: 0;
}
.pengui-bibliography-item a {
  color: var(--color-accent-primary);
  text-decoration: underline;
}

.pengui-page-break {
  break-after: page;
  page-break-after: always;
  height: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
`;

/** Slide-mode wrapper CSS: page reset + .slide canvas sized to the
 *  format geometry + safe-area padding. Section mode does not include
 *  this — the document composer owns page sizing.
 *
 *  The format's `safeAreaInsetPx` overrides the soul-declared
 *  `--space-safe-area` token at the slide level. Without this, formats
 *  whose required inset is larger than the soul default (e.g. print A4
 *  needs 96px but a slides-tuned soul declares 48px) fail the
 *  overflow-detector at Stage 2. The token reference still satisfies
 *  the safe-area-check Stage 1 lint. */
export function buildSlideRootCss(widthPx: number, heightPx: number, safeAreaInsetPx: number): string {
  return `
:root {
  --space-safe-area: ${safeAreaInsetPx}px;
  --color-text-default: var(--color-text-primary);
  --color-text-muted: var(--color-text-secondary);
}
html, body { margin: 0; padding: 0; }
* { box-sizing: border-box; }
body {
  font-family: var(--font-body);
  color: var(--color-text-default);
  background: var(--color-canvas);
}
.slide {
  position: relative;
  width: ${widthPx}px;
  height: ${heightPx}px;
  padding: var(--space-safe-area);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  background: var(--color-canvas);
  justify-content: center;
}
.slide.pengui-bg-canvas { background: var(--color-canvas); }
.slide.pengui-bg-surface { background: var(--color-surface); }
.slide.pengui-bg-surface-alt { background: var(--color-surface-alt); }
.slide.pengui-bg-accent {
  background: var(--color-accent-primary);
  --color-text-default: var(--color-text-inverse);
  --color-text-muted: var(--color-text-inverse);
}
.slide.pengui-layout-centered {
  align-items: center;
  text-align: center;
}
.slide > .pengui-two-column {
  flex: 1 1 auto;
  min-height: 0;
}
.slide > .pengui-grid {
  flex: 1 1 auto;
  min-height: 0;
}
`;
}
