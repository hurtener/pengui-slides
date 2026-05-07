/**
 * compileSlideIRToHtml — turn a SlideIR into a complete slide HTML
 * document, ready to validate, render, and store.
 *
 * Emitted shape (sketch): a full <!DOCTYPE html> document whose <head>
 * carries a single <style> block (soul cssTokens + slide-root reset +
 * canvas geometry sized to the format + per-node pengui-* classes),
 * and whose <body> holds a single .slide root carrying background and
 * layout classes, containing the IR-rendered nodes in order.
 *
 * The @slide-meta comment is NOT injected here. The tool layer owns
 * the SlideMetadata struct (generatedAt, soulId, deckId, position,
 * revisionHash) and runs the existing MetadataEmbedder /
 * insertMetaComment pipeline on the compiled output.
 *
 * v4.14: optional `chrome` arg. When provided AND the slide does not
 * carry `chrome_override: 'hide'`, the body is wrapped with
 * `<header class="pengui-chrome-header">` + `<main
 * class="pengui-chrome-body">` + `<footer class="pengui-chrome-footer">`,
 * and the slide root gets the `pengui-has-chrome` class so CSS swaps
 * justification from centered to stretched. `slidePosition` /
 * `slideCount` feed the page-number slot kind.
 *
 * Pure / synchronous / deterministic. Asset URIs emit as `asset://UUID`
 * markers and are resolved post-compile by `resolveAssetRefs`.
 */

import type { DesignSoul } from '../../../types/design-soul.js';
import type { FormatGeometry } from '../../../types/format.js';
import type { SlideIR } from '../slide-ir.js';
import type { DeckChrome } from '../chrome.js';
import { renderNodeList } from './node-renderers.js';
import { renderChromeHeader, renderChromeFooter } from './chrome-renderer.js';
import { NODE_CSS, buildSlideRootCss } from './layout-css.js';

export interface CompileSlideIRInput {
  ir: SlideIR;
  soul: Pick<DesignSoul, 'cssTokens'>;
  geometry: FormatGeometry;
  /** v4.14: deck-level chrome to render around the slide body. The
   *  caller (deck-service) decides whether to pass chrome based on
   *  showOnCover + slide position; this function trusts the caller's
   *  decision and only checks SlideIR.chrome_override on top. */
  chrome?: DeckChrome;
  /** 1-indexed position for page-number slots. Required if `chrome` has
   *  a `page_number` slot; ignored otherwise. Defaults to 1. */
  slidePosition?: number;
  /** Total slide count for `'1/N'`-style page numbers. Defaults to 1. */
  slideCount?: number;
  /** v4.15: pre-built `@font-face` rules (data: URIs) for bundled fonts
   *  the soul references. Prepended verbatim to the slide stylesheet so
   *  Playwright renders text with the embedded TTF. Build with
   *  `buildFontFaceCss(soul)` from `domain/souls`. Empty / undefined →
   *  no @font-face block (system fonts only). */
  fontFaceCss?: string;
}

export function compileSlideIRToHtml({
  ir,
  soul,
  geometry,
  chrome,
  slidePosition,
  slideCount,
  fontFaceCss,
}: CompileSlideIRInput): string {
  const layout = ir.layout ?? 'default';
  const background = ir.background ?? 'canvas';
  const backgroundClass = `pengui-bg-${background.replace(/_/g, '-')}`;
  const layoutClass = `pengui-layout-${layout}`;
  // v4.19 — explicit CSS color override wins over the semantic role.
  // Inline-style on the slide root so the rasterized PNG and the
  // editable PPTX walker both see the same canvas color.
  const backgroundStyle = ir.background_color
    ? ` style="background:${ir.background_color}"`
    : '';

  // v4.14 chrome decision: per-slide override beats deck setting.
  const renderChrome =
    chrome !== undefined && ir.chrome_override !== 'hide';
  const chromeClass = renderChrome ? ' pengui-has-chrome' : '';

  const css = [
    fontFaceCss,
    soul.cssTokens,
    buildSlideRootCss(geometry.widthPx, geometry.heightPx, geometry.safeAreaInsetPx),
    NODE_CSS,
  ]
    .map((s) => (s ?? '').trim())
    .filter((s) => s.length > 0)
    .join('\n\n');

  const rawBody = renderNodeList(ir.body);

  // v4.20 — outer canvas card wrapper. When SlideIR.canvas is set, wrap
  // the body in a rounded card sitting on the slide bg. Used by
  // architecture diagrams (Consolidated Semantic Layer reference).
  let body = rawBody;
  if (ir.canvas) {
    const styleParts: string[] = [];
    if (ir.canvas.background) styleParts.push(`background:${ir.canvas.background}`);
    if (ir.canvas.padding) styleParts.push(`padding:${ir.canvas.padding}`);
    else styleParts.push('padding:var(--space-xl)');
    if (ir.canvas.radius) styleParts.push(`border-radius:${ir.canvas.radius}`);
    else styleParts.push('border-radius:var(--radius-lg)');
    const shadowClass = ir.canvas.shadow && ir.canvas.shadow !== 'none'
      ? ` pengui-canvas-shadow-${ir.canvas.shadow}`
      : '';
    body = `<div class="pengui-canvas${shadowClass}" style="${styleParts.join(';')}">${rawBody}</div>`;
  }

  // Wrap body in <main class="pengui-chrome-body"> when chrome is
  // active so the body gets its own flex container that justify-content:
  // center can target — without this, the slide's own justify-content
  // pushes header/footer apart from each other and the body floats at
  // top. The wrapper absorbs the centering responsibility.
  const wrappedBody = renderChrome
    ? `<main class="pengui-chrome-body">${body}</main>`
    : body;

  const headerHtml = renderChrome
    ? renderChromeHeader(chrome, {
        slidePosition: slidePosition ?? 1,
        slideCount: slideCount ?? 1,
      })
    : '';
  const footerHtml = renderChrome
    ? renderChromeFooter(chrome, {
        slidePosition: slidePosition ?? 1,
        slideCount: slideCount ?? 1,
      })
    : '';

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    `<style>\n${css}\n</style>`,
    '</head>',
    '<body>',
    `<div class="slide ${backgroundClass} ${layoutClass}${chromeClass}"${backgroundStyle}>`,
    headerHtml,
    wrappedBody,
    footerHtml,
    '</div>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
