/**
 * Flow connector glyph catalog for the v4.17 `flow` node.
 *
 * Each connector is an inline 24×24 SVG primitive — same shape as the
 * v4.13 lucide icons and v4.16 preset ornaments. `currentColor` for
 * stroke/fill so the parent CSS sets the connector tint via a soul
 * token (`color: var(--color-text-muted)` by default).
 *
 * The horizontal arrow / arrow_dashed glyphs point right; the
 * `.pengui-flow-vertical > .pengui-flow-connector` CSS rotates them
 * 90° to point down. Cycle and plus glyphs are orientation-agnostic.
 */

import type { FlowConnector } from '../nodes.js';

const SVG_OPEN =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
  'fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const SVG_CLOSE = '</svg>';

const PATHS: Record<FlowConnector, string> = {
  // Solid arrow pointing right — the default sequential connector.
  arrow:
    '<path d="M5 12h14"/><path d="m13 5 7 7-7 7"/>',

  // Dashed arrow — soft / proposed step. Same head, dashed shaft.
  arrow_dashed:
    '<path stroke-dasharray="4 3" d="M5 12h14"/><path d="m13 5 7 7-7 7"/>',

  // Cycle / return arrow — used after the last step in a cycle flow
  // to communicate "wraps back to the start" without literally drawing
  // a curved bezier between the steps. The glyph is a curved arrow
  // that bends back left, reading as "loop" at a glance.
  cycle:
    '<path d="M21 7H8a4 4 0 0 0-4 4v0a4 4 0 0 0 4 4h12"/><path d="m11 19-4-4 4-4"/>',

  // Plus glyph — additive composition. Centred 14×14 cross.
  plus:
    '<path d="M12 5v14"/><path d="M5 12h14"/>',
};

export function getConnectorSvg(name: FlowConnector): string {
  const path = PATHS[name];
  if (!path) throw new Error(`Unknown flow connector: ${String(name)}`);
  return `${SVG_OPEN}${path}${SVG_CLOSE}`;
}

export function listConnectorNames(): FlowConnector[] {
  return Object.keys(PATHS) as FlowConnector[];
}
