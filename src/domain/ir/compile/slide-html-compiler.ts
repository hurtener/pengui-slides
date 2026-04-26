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
 * Pure / synchronous / deterministic. Asset URIs emit as `asset://UUID`
 * markers and are resolved post-compile by `resolveAssetRefs`.
 */

import type { DesignSoul } from '../../../types/design-soul.js';
import type { FormatGeometry } from '../../../types/format.js';
import type { SlideIR } from '../slide-ir.js';
import { renderNodeList } from './node-renderers.js';
import { NODE_CSS, buildSlideRootCss } from './layout-css.js';

export interface CompileSlideIRInput {
  ir: SlideIR;
  soul: Pick<DesignSoul, 'cssTokens'>;
  geometry: FormatGeometry;
}

export function compileSlideIRToHtml({ ir, soul, geometry }: CompileSlideIRInput): string {
  const layout = ir.layout ?? 'default';
  const background = ir.background ?? 'canvas';
  const backgroundClass = `pengui-bg-${background.replace(/_/g, '-')}`;
  const layoutClass = `pengui-layout-${layout}`;

  const css = [soul.cssTokens, buildSlideRootCss(geometry.widthPx, geometry.heightPx, geometry.safeAreaInsetPx), NODE_CSS]
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join('\n\n');

  const body = renderNodeList(ir.body);

  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    `<style>\n${css}\n</style>`,
    '</head>',
    '<body>',
    `<div class="slide ${backgroundClass} ${layoutClass}">`,
    body,
    '</div>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}
