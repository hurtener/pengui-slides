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

/* v4.22 — inline <code> emitted by RichText (run.code === true). Mono
 * font + preserve whitespace so embedded newlines survive instead of
 * collapsing to spaces. Standalone code spans get a subtle chip-y
 * surface so they read as code; code inside a <pre> (Phase B
 * code_block) inherits the block's styling and skips the chip. */
code {
  font-family: var(--font-mono);
  font-size: 0.92em;
  white-space: pre-wrap;
  word-break: break-word;
}
:not(pre) > code {
  padding: 0 var(--space-xs);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, currentColor 6%, transparent);
}

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

/* v4.22 — pengui-code-block. Block-level code primitive (SQL, TS,
 * JSON, log excerpts). Whitespace preserved verbatim, mono font,
 * horizontal overflow scrolls inside the block instead of pushing past
 * the slide bounds. Optional language badge anchors top-right. */
.pengui-code-block {
  position: relative;
  display: block;
  margin: 0;
  padding: var(--space-md) var(--space-lg);
  border-radius: var(--radius-md);
  /* Theme-agnostic background: a subtle wash of the text color over
   * canvas. On dark souls (white-on-near-black text) this yields a
   * faint lighter panel; on light souls (dark-on-white text) it
   * yields a faint darker panel. Either way the inner text reads. */
  background: color-mix(in srgb, var(--color-text-default) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--color-text-default) 12%, transparent);
  overflow: hidden;
}
.pengui-code-block > pre {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.88em;
  line-height: 1.5;
  color: var(--color-text-default);
  white-space: pre;
  overflow-x: auto;
  /* Inline <code> inside the <pre> gets the parent's whitespace +
   * font; the inline rule above adds a chip background which we don't
   * want here. The :not(pre) > code selector above already excludes
   * this case, so nothing more is needed. */
}
.pengui-code-block > pre > code {
  background: transparent;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
}
.pengui-code-block-language {
  position: absolute;
  top: var(--space-sm);
  right: var(--space-md);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-accent-primary) 14%, transparent);
  color: var(--color-accent-primary);
  font-family: var(--font-mono);
  font-size: var(--text-caption);
  font-weight: var(--weight-bold);
  letter-spacing: 0.08em;
  line-height: 1;
  pointer-events: none;
}
.pengui-code-block-caption {
  margin: var(--space-sm) 0 0 0;
  font-family: var(--font-body);
  font-size: var(--text-caption);
  color: var(--color-text-muted);
}

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

/* v4.19.1 — horizontal body layout. Cards opt in via body_layout: 'row'
 * for chip rows / horizontal pipelines (BRONZE/SILVER/GOLD chip strip,
 * workspace dot row, bottom-legend mini-chips). */
.pengui-card-body-row {
  flex-direction: row !important;
  flex-wrap: wrap;
  align-items: center;
}

/* v4.21 — horizontal card layout. Icon goes to the LEFT of the body
 * (instead of stacked above). Body retains its own flex direction
 * (default column → title and caption stack vertically beside the icon).
 * Used by AI Platform agent rows: '[icon] [title \n caption]'. */
.pengui-card-layout-horizontal {
  flex-direction: row;
  align-items: flex-start;
  gap: var(--space-md);
}
.pengui-card-layout-horizontal .pengui-card-icon {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
}
.pengui-card-layout-horizontal .pengui-card-body {
  flex: 1 1 auto;
  min-width: 0;
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

/* v4.19 — fill variants. tint = soft wash of the accent color (good
 * for category cards: BRONZE/SILVER/GOLD); solid = full accent fill
 * with inverse text (good for SOLUTION-style chips). The accent rules
 * above set color: ACCENT — so the wash uses currentColor with low
 * opacity via color-mix when supported, falling back to the accent. */
.pengui-card-fill-tint {
  background: color-mix(in srgb, currentColor 12%, transparent);
  border-color: color-mix(in srgb, currentColor 24%, transparent);
}
.pengui-card-fill-solid {
  border-color: transparent;
}
/* v4.21 — fill:solid background must bind to the accent token directly,
 * NOT currentColor. The 'color: inverse' cascade rule below resets color
 * to white before 'background: currentColor' would resolve, producing
 * white-on-white. Compound selectors per accent fix this deterministically. */
.pengui-card-accent-accent.pengui-card-fill-solid      { background: var(--color-accent-primary); }
.pengui-card-accent-accent-alt.pengui-card-fill-solid  { background: var(--color-accent-secondary); }
.pengui-card-accent-accent-warm.pengui-card-fill-solid { background: var(--color-accent-warm); }
.pengui-card-accent-success.pengui-card-fill-solid     { background: var(--color-success); }
.pengui-card-accent-warning.pengui-card-fill-solid     { background: var(--color-warning); }
.pengui-card-accent-error.pengui-card-fill-solid       { background: var(--color-error); }
.pengui-card-accent-info.pengui-card-fill-solid        { background: var(--color-info); }
.pengui-card-accent-muted.pengui-card-fill-solid       { background: var(--color-text-muted); }
.pengui-card-accent-inverse.pengui-card-fill-solid     { background: var(--color-text-inverse); }
/* Cascade inverse text into ALL descendants (not just > * children) so
 * the text inside .pengui-card-body — which resets color to default —
 * also flips to inverse. Selector specificity beats .pengui-card-body
 * which carries the same default-color reset. */
.pengui-card-fill-solid,
.pengui-card-fill-solid .pengui-card-body,
.pengui-card-fill-solid .pengui-card-body * {
  color: var(--color-text-inverse);
}

/* v4.19 — border-style variants. dashed for architecture-diagram
 * containers; none removes the outline entirely (paired with a fill
 * variant the visual still reads). */
.pengui-card-border-dashed {
  border-style: dashed;
  border-width: 2px;
  border-top-width: 2px;
}
.pengui-card-border-none {
  border-color: transparent;
  border-top-color: transparent;
}

/* v4.19 — chip / pill primitive. Inline-flex so it sits next to text
 * in headings or chains horizontally inside a flow row. */
.pengui-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: var(--text-caption);
  font-weight: var(--weight-medium);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  line-height: 1;
  white-space: nowrap;
  vertical-align: middle;
  color: var(--color-accent-primary);
  /* v4.20 — chips inside a column flexbox would stretch to full width
   * by default. align-self: flex-start keeps them content-fit. */
  align-self: flex-start;
  max-width: max-content;
}
.pengui-chip-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: currentColor;
  display: inline-block;
}
.pengui-chip-label {
  color: inherit;
}

/* Per-accent color cascade — same naming as pengui-card-accent-*. */
.pengui-chip-accent-accent      { color: var(--color-accent-primary); }
.pengui-chip-accent-accent-alt  { color: var(--color-accent-secondary); }
.pengui-chip-accent-accent-warm { color: var(--color-accent-warm); }
.pengui-chip-accent-success     { color: var(--color-success); }
.pengui-chip-accent-warning     { color: var(--color-warning); }
.pengui-chip-accent-error       { color: var(--color-error); }
.pengui-chip-accent-info        { color: var(--color-info); }
.pengui-chip-accent-muted       { color: var(--color-text-muted); }
.pengui-chip-accent-inverse     { color: var(--color-text-inverse); }

/* Tone variants — wash, solid, outline. */
.pengui-chip-tone-tint {
  background: color-mix(in srgb, currentColor 14%, transparent);
}
.pengui-chip-tone-solid {
  background: currentColor;
}
.pengui-chip-tone-solid .pengui-chip-label {
  color: var(--color-text-inverse);
}
.pengui-chip-tone-solid .pengui-chip-dot {
  background: var(--color-text-inverse);
}
.pengui-chip-tone-outline {
  background: transparent;
  border: 1px solid currentColor;
}

/* v4.20 — chip size scale. xs for compact dots; lg for prominent
 * brand pills (SOLUTION, Databricks·Unity Catalog header). Padding
 * uses spacing tokens; non-token sizes (dot widths in px) escape the
 * lint via the dot/glyph rule path which the lint exempts. */
.pengui-chip-size-xs {
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--text-caption);
  letter-spacing: 0.08em;
}
.pengui-chip-size-sm {
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--text-caption);
}
.pengui-chip-size-md {
  padding: var(--space-sm) var(--space-md);
  font-size: var(--text-label);
}
.pengui-chip-size-lg {
  padding: var(--space-sm) var(--space-lg);
  font-size: var(--text-body);
  letter-spacing: 0.04em;
}

/* v4.20 — card size variants. compact halves the padding for nested
 * mini-cards; large doubles it for top-level callouts. */
.pengui-card-size-compact {
  padding: var(--space-sm) var(--space-md);
}
.pengui-card-size-large {
  padding: var(--space-xl);
}

/* v4.20 — card elevation. raised lifts the card off the slide bg with
 * a soft drop shadow (the outer canvas card on architecture diagrams).
 * Shadow color is derived from --color-text-default via color-mix so the
 * lift adapts to dark souls without any literal color escaping the token
 * lint. */
.pengui-card-elevation-raised {
  box-shadow:
    0 6px 24px color-mix(in srgb, var(--color-text-default) 8%, transparent),
    0 2px 6px color-mix(in srgb, var(--color-text-default) 6%, transparent);
}

/* v4.20 — card with header pill. Adds extra top padding so the
 * absolutely-positioned pill sits inside the card's snap bbox. */
.pengui-card-has-header-pill {
  position: relative;
  padding-top: calc(var(--space-lg) + var(--space-sm));
}
.pengui-card-header-pill {
  position: absolute;
  top: calc(var(--space-sm) * -1);
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-full);
  font-family: var(--font-mono);
  font-size: var(--text-caption);
  font-weight: var(--weight-bold);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  line-height: 1;
  white-space: nowrap;
  z-index: 2;
}
.pengui-card-header-pill-align-left   { left: var(--space-md); }
.pengui-card-header-pill-align-center { left: 50%; transform: translateX(-50%); }
.pengui-card-header-pill-align-right  { right: var(--space-md); }
.pengui-card-header-pill-icon { display: inline-flex; align-items: center; }
.pengui-card-header-pill-icon > svg { width: 14px; height: 14px; }
/* Header pill accent + tone — mirror chip rules. */
.pengui-card-header-pill-accent-accent      { color: var(--color-accent-primary); }
.pengui-card-header-pill-accent-accent-alt  { color: var(--color-accent-secondary); }
.pengui-card-header-pill-accent-accent-warm { color: var(--color-accent-warm); }
.pengui-card-header-pill-accent-success     { color: var(--color-success); }
.pengui-card-header-pill-accent-warning     { color: var(--color-warning); }
.pengui-card-header-pill-accent-info        { color: var(--color-info); }
.pengui-card-header-pill-accent-muted       { color: var(--color-text-muted); }
.pengui-card-header-pill-accent-inverse     { color: var(--color-text-inverse); }
.pengui-card-header-pill-tone-solid {
  background: currentColor;
}
.pengui-card-header-pill-tone-solid .pengui-card-header-pill-label,
.pengui-card-header-pill-tone-solid .pengui-card-header-pill-icon {
  color: var(--color-text-inverse);
}
.pengui-card-header-pill-tone-tint {
  background: color-mix(in srgb, currentColor 18%, transparent);
}
.pengui-card-header-pill-tone-outline {
  background: var(--color-canvas);
  border: 1px solid currentColor;
}

/* v4.20 — arrow leaf. Inline-flex, glyph + optional caption beneath. */
.pengui-arrow {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  flex: 0 0 auto;
  color: var(--color-text-muted);
  align-self: center;
}
.pengui-arrow-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.pengui-arrow-glyph > svg {
  width: 28px;
  height: 28px;
}
.pengui-arrow-label {
  font-family: var(--font-mono);
  font-size: var(--text-caption);
  font-weight: var(--weight-bold);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: inherit;
  white-space: nowrap;
}
.pengui-arrow-direction-left  > .pengui-arrow-glyph > svg { transform: rotate(180deg); }
.pengui-arrow-direction-up    > .pengui-arrow-glyph > svg { transform: rotate(-90deg); }
.pengui-arrow-direction-down  > .pengui-arrow-glyph > svg { transform: rotate(90deg); }
/* Arrow accent cascade — same naming as chip. */
.pengui-arrow-accent-accent      { color: var(--color-accent-primary); }
.pengui-arrow-accent-accent-alt  { color: var(--color-accent-secondary); }
.pengui-arrow-accent-accent-warm { color: var(--color-accent-warm); }
.pengui-arrow-accent-success     { color: var(--color-success); }
.pengui-arrow-accent-warning     { color: var(--color-warning); }
.pengui-arrow-accent-error       { color: var(--color-error); }
.pengui-arrow-accent-info        { color: var(--color-info); }
.pengui-arrow-accent-muted       { color: var(--color-text-muted); }
.pengui-arrow-accent-inverse     { color: var(--color-text-inverse); }

/* v4.20 — outer canvas card wrapper. Wraps slide body in a rounded
 * background container on top of the slide bg. Used for architecture
 * diagrams where all 3 columns sit inside one white card. */
.pengui-canvas {
  width: 100%;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  box-sizing: border-box;
}
/* Note: shadow rules use border-color tinting instead of box-shadow.
 * box-shadow on the .pengui-canvas div triggers the v4.7
 * unsupported-shadow background fallback (entire slide flattens to a
 * single image PNG, killing native editability). Border tinting gives
 * a similar visual lift without breaking the editable export. */
.pengui-canvas-shadow-soft     { border: 1px solid color-mix(in srgb, var(--color-text-default)  6%, transparent); }
.pengui-canvas-shadow-medium   { border: 1px solid color-mix(in srgb, var(--color-text-default) 10%, transparent); }
.pengui-canvas-shadow-elevated { border: 1px solid color-mix(in srgb, var(--color-text-default) 14%, transparent); }

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

/* ── v4.16 decoration node ──────────────────────────────────────
 *
 * Decorations sit absolutely-positioned inside the slide frame. The
 * anchor class picks which inset side(s) the offset CSS variables
 * (--pengui-deco-dx / --pengui-deco-dy) push from. Bleed anchors flip
 * those insets to negative so the shape extends past the slide edge —
 * the slide root opts into overflow:visible only when at least one
 * bleed decoration is present (handled at the .slide level via the
 * pengui-has-bleed class added by the CSS itself: any
 * .pengui-decoration-bleed descendant flips overflow on the parent).
 * For broad browser/Playwright support we use the :has() selector
 * (Chromium 105+, our Playwright version is way newer).
 *
 * Layer ordering:
 *   slide background        z-index 0  (the .slide background-color)
 *   decoration-background   z-index 1
 *   slide body content      z-index 10 (default — children of .slide)
 *   decoration-foreground   z-index 100
 *
 * The default offset CSS vars resolve to 0 so the SCSS-style
 * fallback works when the renderer omits them.
 */
.slide:has(.pengui-decoration-bleed) {
  overflow: visible;
}
.pengui-decoration {
  position: absolute;
  --pengui-deco-dx: 0px;
  --pengui-deco-dy: 0px;
  pointer-events: none;
  display: block;
}
.pengui-decoration > svg,
.pengui-decoration > img {
  width: 100%;
  height: 100%;
  display: block;
}
.pengui-decoration-background { z-index: 1; }
.pengui-decoration-foreground { z-index: 100; }

/* Body content carries z-index 10 to keep decoration layers stable
 * regardless of source order. Children of .slide that aren't
 * decorations get this implicitly via direct-child selector. */
.slide > :not(.pengui-decoration):not(.pengui-chrome-header):not(.pengui-chrome-footer) {
  position: relative;
  z-index: 10;
}

/* ── decoration anchors ─────────────────────────────────────────
 *
 * Anchor names map to an inset corner. The dx/dy offset variables
 * push the decoration toward the slide centre. Bleed anchors invert
 * those offsets to push past the slide edge (handled by the
 * pengui-decoration-bleed modifier below).
 */
.pengui-decoration-anchor-top-left      { top: var(--pengui-deco-dy); left: var(--pengui-deco-dx); }
.pengui-decoration-anchor-top-center    { top: var(--pengui-deco-dy); left: 50%; transform: translateX(-50%); }
.pengui-decoration-anchor-top-right     { top: var(--pengui-deco-dy); right: var(--pengui-deco-dx); }
.pengui-decoration-anchor-middle-left   { top: 50%; left: var(--pengui-deco-dx); transform: translateY(-50%); }
.pengui-decoration-anchor-middle-center { top: 50%; left: 50%; transform: translate(-50%, -50%); }
.pengui-decoration-anchor-middle-right  { top: 50%; right: var(--pengui-deco-dx); transform: translateY(-50%); }
.pengui-decoration-anchor-bottom-left   { bottom: var(--pengui-deco-dy); left: var(--pengui-deco-dx); }
.pengui-decoration-anchor-bottom-center { bottom: var(--pengui-deco-dy); left: 50%; transform: translateX(-50%); }
.pengui-decoration-anchor-bottom-right  { bottom: var(--pengui-deco-dy); right: var(--pengui-deco-dx); }

/* Bleed anchors push the decoration past the slide edge. The CSS uses
 * negative insets so half/most of the decoration sits outside the
 * canvas (Galici slide 3 glow rings, PM Top Concerns "C" mark). The
 * dx/dy offsets ADD to the bleed: a positive dx pulls the decoration
 * back toward the slide centre. */
.pengui-decoration-anchor-bleed-left         { top: 50%; left: 0; transform: translate(calc(-50% + var(--pengui-deco-dx)), -50%); }
.pengui-decoration-anchor-bleed-right        { top: 50%; right: 0; transform: translate(calc(50% - var(--pengui-deco-dx)), -50%); }
.pengui-decoration-anchor-bleed-top          { top: 0; left: 50%; transform: translate(-50%, calc(-50% + var(--pengui-deco-dy))); }
.pengui-decoration-anchor-bleed-bottom       { bottom: 0; left: 50%; transform: translate(-50%, calc(50% - var(--pengui-deco-dy))); }
.pengui-decoration-anchor-bleed-top-left     { top: 0; left: 0; transform: translate(calc(-50% + var(--pengui-deco-dx)), calc(-50% + var(--pengui-deco-dy))); }
.pengui-decoration-anchor-bleed-top-right    { top: 0; right: 0; transform: translate(calc(50% - var(--pengui-deco-dx)), calc(-50% + var(--pengui-deco-dy))); }
.pengui-decoration-anchor-bleed-bottom-left  { bottom: 0; left: 0; transform: translate(calc(-50% + var(--pengui-deco-dx)), calc(50% - var(--pengui-deco-dy))); }
.pengui-decoration-anchor-bleed-bottom-right { bottom: 0; right: 0; transform: translate(calc(50% - var(--pengui-deco-dx)), calc(50% - var(--pengui-deco-dy))); }

/* ── v4.16 image frame chrome ───────────────────────────────────
 *
 * Frames wrap the <img> in device chrome. The chrome elements (titlebar,
 * traffic lights, status bar, etc.) are styled via CSS — no extra raster
 * assets. The image sits in .pengui-frame-content with object-fit
 * cover so the frame interior fills cleanly.
 *
 * Each frame variant declares its own padding + bezel + decorations
 * via its scoped class. The figure itself stays in the body flow; only
 * the inner chrome is positioned. */
.pengui-image-framed { background: transparent; padding: 0; }
.pengui-image-framed > .pengui-frame { width: 100%; height: 100%; display: block; position: relative; }
.pengui-frame-content { width: 100%; height: 100%; overflow: hidden; }
.pengui-frame-content > img { width: 100%; height: 100%; display: block; object-fit: cover; }

/* Browser frame: titlebar with traffic-light dots + URL bar pill. */
.pengui-frame-browser {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-surface);
  /* No box-shadow: the html→SlideDocument compiler flips any element with
   * a shadow to the slide-background fallback (it can't reproduce CSS
   * box-shadow as a native PPTX shape). The 1px border + neutral surface
   * fill carries enough definition without a shadow. */
}
.pengui-frame-browser > .pengui-frame-titlebar {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm);
  background: var(--color-surface-alt);
  border-bottom: 1px solid var(--color-border);
}
.pengui-frame-browser .pengui-frame-dot {
  width: 12px;
  height: 12px;
  border-radius: 9999px;
  display: inline-block;
}
.pengui-frame-browser .pengui-frame-dot-close { background: var(--color-error); }
.pengui-frame-browser .pengui-frame-dot-min   { background: var(--color-warning); }
.pengui-frame-browser .pengui-frame-dot-max   { background: var(--color-success); }
.pengui-frame-browser .pengui-frame-urlbar {
  flex: 1 1 auto;
  height: 18px;
  background: var(--color-canvas);
  border-radius: 9999px;
  margin-left: var(--space-md);
  border: 1px solid var(--color-border);
}

/* Phone frame: rounded device bezel + status bar + home indicator. */
.pengui-frame-phone {
  border: 8px solid var(--color-text-primary);
  border-radius: 32px;
  overflow: hidden;
  background: var(--color-text-primary);
  padding: 0;
  /* No box-shadow per editable-PPTX shadow constraint. */
}
.pengui-frame-phone > .pengui-frame-statusbar {
  height: 18px;
  background: var(--color-text-primary);
}
.pengui-frame-phone > .pengui-frame-content { background: var(--color-canvas); }
.pengui-frame-phone > .pengui-frame-home-indicator {
  height: 4px;
  width: 32%;
  background: var(--color-canvas);
  border-radius: 9999px;
  margin: var(--space-sm) auto;
  opacity: 0.85;
}

/* Desktop frame: monitor bezel + stand. */
.pengui-frame-desktop > .pengui-frame-bezel {
  border: 6px solid var(--color-text-primary);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-text-primary);
}
.pengui-frame-desktop > .pengui-frame-stand {
  width: 24%;
  height: 14px;
  background: var(--color-text-secondary);
  margin: 0 auto;
}
.pengui-frame-desktop > .pengui-frame-base {
  width: 40%;
  height: 4px;
  background: var(--color-text-primary);
  border-radius: 9999px;
  margin: 0 auto;
}

/* Laptop frame: lid + thin bottom keyboard tray. */
.pengui-frame-laptop > .pengui-frame-bezel {
  border: 6px solid var(--color-text-primary);
  border-top-left-radius: var(--radius-md);
  border-top-right-radius: var(--radius-md);
  overflow: hidden;
  background: var(--color-text-primary);
}
.pengui-frame-laptop > .pengui-frame-keyboard {
  height: 6px;
  background: var(--color-text-secondary);
  margin: 0 auto;
  width: 110%;
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
  margin-left: -5%;
}

/* ── v4.17 flow node ────────────────────────────────────────────
 *
 * Sequential pipeline visualization. The renderer emits an <ol> with
 * step pills + connector glyphs interleaved. Horizontal flows lay out
 * row-wise with inline connectors; vertical flows stack column-wise
 * with rotated connectors.
 *
 * Step pills mirror the v4.13 card pattern: 1px neutral border + 3px
 * soul-token top-border tint. No box-shadow per the v4.16 frame
 * learnings (planner flips shadowed elements to slide background).
 *
 * Connector glyphs ship from compile/connectors.ts as 24×24 inline
 * SVGs. The .pengui-flow-vertical row rotates the arrow / arrow_dashed
 * glyphs 90 degrees to point down — cycle and plus are
 * orientation-agnostic, no rotation applied.
 */
.pengui-flow {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: stretch;
  gap: var(--space-md);
  flex: 1 1 auto;
  min-height: 0;
}
.pengui-flow-horizontal { flex-direction: row; }
.pengui-flow-vertical   { flex-direction: column; }

.pengui-flow-step {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-top: 3px solid var(--color-text-muted);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  flex: 1 1 0;
  position: relative;
  min-width: 0;
}

.pengui-flow-step-icon { color: inherit; }
.pengui-flow-step-icon > svg {
  width: 24px;
  height: 24px;
}

.pengui-flow-step-badge {
  position: absolute;
  top: var(--space-sm);
  right: var(--space-sm);
  font-family: var(--font-mono);
  font-size: var(--text-caption);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}

.pengui-flow-step-label {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-h3);
  line-height: 1.25;
  color: var(--color-text-default);
}

/* Step accent — top-border tint + icon color, mirroring the v4.13
 * card accent pattern. */
.pengui-flow-step-accent-accent      { border-top-color: var(--color-accent-primary);   color: var(--color-accent-primary); }
.pengui-flow-step-accent-accent-alt  { border-top-color: var(--color-accent-secondary); color: var(--color-accent-secondary); }
.pengui-flow-step-accent-accent-warm { border-top-color: var(--color-accent-warm);      color: var(--color-accent-warm); }
.pengui-flow-step-accent-success     { border-top-color: var(--color-success);          color: var(--color-success); }
.pengui-flow-step-accent-warning     { border-top-color: var(--color-warning);          color: var(--color-warning); }
.pengui-flow-step-accent-error       { border-top-color: var(--color-error);            color: var(--color-error); }
.pengui-flow-step-accent-info        { border-top-color: var(--color-info);             color: var(--color-info); }
.pengui-flow-step-accent-muted       { border-top-color: var(--color-text-muted);       color: var(--color-text-muted); }
.pengui-flow-step-accent-inverse     { border-top-color: var(--color-text-inverse);     color: var(--color-text-inverse); }

/* Connector slot — fixed-size box that hosts the inline glyph. The
 * accent color uses --color-text-muted by default so the connector
 * reads as neutral; flows whose direction needs more emphasis can be
 * upgraded to use accent later via per-flow accent (deferred to v4.18+). */
.pengui-flow-connector {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 48px;
  color: var(--color-text-muted);
}
.pengui-flow-connector > svg {
  width: 100%;
  height: 100%;
  max-width: 32px;
  max-height: 32px;
}

/* Vertical flows: connector takes column width; rotate arrow glyphs
 * 90° so they point down. Cycle / plus glyphs stay un-rotated. */
.pengui-flow-vertical > .pengui-flow-connector {
  width: auto;
  height: 32px;
}
.pengui-flow-vertical > .pengui-flow-connector-glyph-arrow > svg,
.pengui-flow-vertical > .pengui-flow-connector-glyph-arrow_dashed > svg {
  transform: rotate(90deg);
}

/* Cycle's closing return-arrow inherits the cycle glyph (a U-bend
 * already pointing back toward start). The closing connector sits
 * AFTER the last step in horizontal flow — its left-pointing arrowhead
 * naturally reads as "loop back". For VERTICAL cycle flows we also
 * rotate the cycle glyph 90° so the U-bend opens upward (visual
 * "loop back to top"); without this the U-bend stays sideways and
 * looks wrong between vertically-stacked steps. */
.pengui-flow-vertical > .pengui-flow-connector-glyph-cycle > svg {
  transform: rotate(90deg);
}

/* ── v4.18 parity: document-mode section root ────────────────────
 *
 * Pre-v4.18 only the .slide root carried position:relative + bg/layout
 * + decoration-overflow rules. The document composer wraps each
 * SectionIR in a <section class="pengui-section ..."> that already
 * carries pengui-bg-* and pengui-section-LAYOUT classes from
 * compileSectionIRToHtml, but no CSS targeted them — so backgrounds,
 * centered layout, and decoration positioning were no-ops in A4 PDF.
 * These selectors close the slide/section parity gap for every
 * bimodal node (decoration, flow, card, framed image). */
.pengui-section {
  position: relative;
}
.pengui-section.pengui-bg-canvas      { background: var(--color-canvas); }
.pengui-section.pengui-bg-surface     { background: var(--color-surface); }
.pengui-section.pengui-bg-surface-alt { background: var(--color-surface-alt); }
.pengui-section.pengui-bg-accent {
  background: var(--color-accent-primary);
  --color-text-default: var(--color-text-inverse);
  --color-text-muted: var(--color-text-inverse);
}
.pengui-section.pengui-section-centered {
  text-align: center;
}
.pengui-section:has(.pengui-decoration-bleed) {
  overflow: visible;
}
/* Body content inside a section gets the same z-stacking as in slides
 * so foreground decorations layer above body and background ones
 * paint behind. Without this, source order alone determines z-order
 * and decoration layering breaks in document-mode. */
.pengui-section > :not(.pengui-decoration) {
  position: relative;
  z-index: 10;
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
