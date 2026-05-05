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

/* v4.12: pengui-chart figure wraps the ECharts-rendered SVG, authored
   at 800x480 with a viewBox. v4.14.6: the figure becomes a flex child
   that takes available vertical space (handled by .slide rules below);
   the SVG fills the figure with width:100% + height:100% and lets its
   own preserveAspectRatio="xMidYMid meet" handle ratio fitting. Without
   this, the SVG's intrinsic aspect ratio (width:100%, height:auto)
   pushed the figure past the slide bottom into the chrome footer when
   the body had any sibling text content. */
.pengui-chart {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin: 0;
  width: 100%;
  min-height: 0;
}
.pengui-chart-svg,
.pengui-chart > svg {
  width: 100%;
  height: 100%;
  max-width: 100%;
  /* Take available space within the chart figure; without flex:1 the
     SVG sizes to its viewBox intrinsic and the figcaption pushes the
     SVG past container bounds. */
  flex: 1 1 auto;
  min-height: 0;
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

/* v4.13: pengui-card — presentational wrapper around inner leaves with
   optional accent (top-border tint + icon color). The accent class drives
   BOTH the border tint AND the icon color via the parent color rule
   (the icon SVG uses currentColor). Default (no accent class) gets a
   neutral top-border in --color-border so the card still reads as a
   card without coloring noise. */
.pengui-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-lg);
  background: var(--color-surface);
  border: var(--border-width) solid var(--color-border);
  border-top-width: 3px;
  border-top-color: var(--color-border);
  border-radius: var(--radius-lg);
  /* color is the icon tint anchor — accent rules below override per role */
  color: var(--color-accent-primary);
}
.pengui-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  width: 32px;
  height: 32px;
  /* SVG inherits via currentColor — see icons.ts */
}
.pengui-card-icon > svg {
  width: 100%;
  height: 100%;
}
.pengui-card-eyebrow {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-label);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
}
.pengui-card-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  /* Reset the card's accent color so inner text uses the cascade default,
     not the accent (which is reserved for the icon + accent flourishes). */
  color: var(--color-text-default);
}
/* Per-accent overrides — each rule sets BOTH the border tint and the
   icon-anchor color so the card reads as one coherent semantic unit.
   The class names mirror the TextColor enum (underscore → hyphen). */
.pengui-card-accent-accent      { border-top-color: var(--color-accent-primary);   color: var(--color-accent-primary); }
.pengui-card-accent-accent-alt  { border-top-color: var(--color-accent-secondary); color: var(--color-accent-secondary); }
.pengui-card-accent-accent-warm { border-top-color: var(--color-accent-warm);      color: var(--color-accent-warm); }
.pengui-card-accent-success     { border-top-color: var(--color-success);          color: var(--color-success); }
.pengui-card-accent-warning     { border-top-color: var(--color-warning);          color: var(--color-warning); }
.pengui-card-accent-error       { border-top-color: var(--color-error);            color: var(--color-error); }
.pengui-card-accent-info        { border-top-color: var(--color-info);             color: var(--color-info); }
.pengui-card-accent-muted       { border-top-color: var(--color-text-muted);       color: var(--color-text-muted); }
.pengui-card-accent-inverse     { border-top-color: var(--color-text-inverse);     color: var(--color-text-inverse); }

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

/* v4.14 — slide chrome (deck-level header/footer regions). The chrome
   row uses CSS Grid with three tracks (1fr auto 1fr) so left/right
   anchor to the edges and a center slot truly centers regardless of
   what's in left/right. Empty slot cells still occupy their grid track
   so layout stays stable across slides with different chrome content.

   The header gets a hairline divider below; the footer gets one above.
   Both use --color-border so they tone down on dark/low-contrast souls.
   Padding values use the soul's space scale, not literal px. */
.pengui-chrome-header,
.pengui-chrome-footer {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--space-md);
  width: 100%;
}
.pengui-chrome-header {
  padding-bottom: var(--space-sm);
  border-bottom: var(--border-width) solid var(--color-border);
}
.pengui-chrome-footer {
  padding-top: var(--space-sm);
  border-top: var(--border-width) solid var(--color-border);
}
.pengui-chrome-slot {
  display: flex;
  align-items: center;
  min-width: 0;
}
.pengui-chrome-slot-left   { justify-self: start;  justify-content: flex-start; }
.pengui-chrome-slot-center { justify-self: center; justify-content: center; }
.pengui-chrome-slot-right  { justify-self: end;    justify-content: flex-end; }
.pengui-chrome-logo {
  display: block;
  width: auto;
  /* Prevent the asset's intrinsic ratio from stretching when the slot
     gets squeezed. The size classes below set a fixed height. */
  object-fit: contain;
}
.pengui-chrome-logo-sm { height: 24px; }
.pengui-chrome-logo-md { height: 32px; }
.pengui-chrome-logo-lg { height: 44px; }
.pengui-chrome-text {
  font-family: var(--font-mono);
  font-size: var(--text-label);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
}
.pengui-chrome-page-number {
  font-family: var(--font-mono);
  font-size: var(--text-label);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
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
/* v4.14.6: chart figures absorb available vertical space so the SVG
   height tracks what's left after sibling content (heading, caption,
   prose). Without this, the chart's natural aspect-ratio height bled
   past the slide bottom into the chrome footer. */
.slide > .pengui-chart {
  flex: 1 1 auto;
  min-height: 0;
}

/* v4.14: slide chrome alters the .slide flex layout. With chrome,
   header/main/footer stack naturally — the slide stops centering its
   direct children (which would push header and footer apart) and the
   <main class="pengui-chrome-body"> wrapper takes over the centering
   responsibility for the body content. */
.slide.pengui-has-chrome {
  justify-content: stretch;
  /* Chrome wants its own gap between header/body/footer rather than
     the wide --space-lg slide gap (which leaves too much air between
     the header divider and the first body element). */
  gap: var(--space-md);
}
.slide.pengui-has-chrome > .pengui-chrome-body {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  justify-content: center;
  min-height: 0;
}
.slide.pengui-has-chrome > .pengui-chrome-body > .pengui-two-column,
.slide.pengui-has-chrome > .pengui-chrome-body > .pengui-grid,
.slide.pengui-has-chrome > .pengui-chrome-body > .pengui-chart {
  flex: 1 1 auto;
  min-height: 0;
}
`;
}
