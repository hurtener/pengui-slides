/**
 * chart-resolver — render-boundary helper that swaps the placeholder
 * `<svg class="pengui-chart-svg">` body inside chart figures for real
 * ECharts-rendered SVG.
 *
 * Compile (`renderChart` in `node-renderers.ts`) is synchronous and
 * soul-agnostic: it emits a placeholder SVG plus a base64-encoded
 * `data-pengui-chart-spec` attribute carrying the structural payload.
 * This resolver walks those figures, builds a soul-aware ECharts theme,
 * renders the real SVG, applies the hex→var post-pass, and replaces the
 * placeholder.
 *
 * Sync — wraps the sync `renderChartToSvg`. Mirrors `resolveAssetRefs`'s
 * shape (run once at the boundary that has access to the soul) but stays
 * sync because ECharts is loaded via `createRequire` inside the renderer.
 */

import type { SoulLayers } from '../../types/design-soul.js';
import { buildEChartsTheme, buildHexToVarMap } from '../souls/chart-theme-bridge.js';
import {
  renderChartToSvg,
  applyHexToVarSwap,
  type ChartSpec,
} from './chart-renderer.js';
import { ChartTypeSchema } from '../ir/nodes.js';

/**
 * Replace every `data-pengui-chart-spec` placeholder figure in `html`
 * with a real ECharts-rendered SVG figure body. Unknown / malformed
 * spec attributes are left untouched (the placeholder figure stays).
 *
 * The resolver is a pure regex pass keyed on the figure shape produced
 * by `renderChart` — no DOM parser. The shape is stable because the
 * compiler is the only emitter.
 */
export function resolveChartRefs(html: string, layers: SoulLayers): string {
  if (!html.includes('data-pengui-chart-spec=')) return html;

  const theme = buildEChartsTheme(layers);
  const hexToVar = buildHexToVarMap(layers);

  // Match <figure …data-pengui-chart-spec="…">…</figure> non-greedily.
  // Figures don't nest, so this is unambiguous.
  const figureRe = /<figure\b([^>]*?)data-pengui-chart-spec="([^"]+)"([^>]*)>([\s\S]*?)<\/figure>/g;
  return html.replace(figureRe, (full, attrsBefore: string, specB64: string, attrsAfter: string, inner: string) => {
    const spec = decodeSpec(specB64);
    if (!spec) return full;
    let svg: string;
    try {
      svg = renderChartToSvg(spec, theme);
    } catch {
      return full;
    }
    const themed = applyHexToVarSwap(svg, hexToVar);
    // Replace the placeholder <svg> inside the figure with the rendered SVG;
    // keep any sibling caption (<figcaption>).
    const newInner = inner.replace(/<svg\b[\s\S]*?<\/svg>/, themed);
    return `<figure${attrsBefore}data-pengui-chart-spec="${specB64}"${attrsAfter}>${newInner}</figure>`;
  });
}

function decodeSpec(b64: string): ChartSpec | null {
  let json: string;
  try {
    json = Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  // Cheap structural check — full validation already happened at IR landing.
  if (!ChartTypeSchema.safeParse(obj.chart_type).success) return null;
  if (!Array.isArray(obj.data)) return null;
  return obj as unknown as ChartSpec;
}
