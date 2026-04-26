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
  color: var(--color-accent-primary);
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
`;
}
