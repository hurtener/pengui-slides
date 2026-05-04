/**
 * chart-renderer — server-side SVG chart rendering for v4.12 ChartNodes.
 *
 * Wraps Apache ECharts' SSR mode (`init(null, theme, { ssr: true })`)
 * to produce inline SVG without a DOM. The renderer is **pure**:
 * same `(spec, theme)` → byte-identical SVG, modulo a deterministic
 * post-pass that strips ECharts' per-process instance prefix
 * (`zr<N>-cls-<M>` → `zr-cls-<M>`) so multi-chart decks within a single
 * process stay stable across renders.
 *
 * ECharts is loaded lazily via `createRequire` so cold tools that never
 * touch charts don't pay the parse cost (~3 MB minified). The first
 * call after server boot pays a one-time load; subsequent calls reuse
 * the cached module.
 *
 * Native PPTX `c:chart` parts are explicitly out of scope for v4.12 —
 * the editable PPTX exporter consumes the SVG output via PNG
 * rasterisation, not via OOXML chart parts.
 */

import { createRequire } from 'node:module';
import type { ChartNode, ChartType } from '../ir/nodes.js';
import type { EChartsTheme } from '../souls/chart-theme-bridge.js';

const require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let echartsModule: any | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadEcharts(): any {
  if (!echartsModule) {
    echartsModule = require('echarts');
  }
  return echartsModule;
}

// ── Public surface ──────────────────────────────────────────────

/** The structural payload extracted from a ChartNode. Same shape as
 *  what `renderChart` in `node-renderers.ts` base64-encodes into the
 *  `data-pengui-chart-spec` attribute. */
export interface ChartSpec {
  chart_type: ChartType;
  data: Array<Array<number | string>>;
  series_labels?: string[];
  category_labels?: string[];
  x_axis_title?: string;
  y_axis_title?: string;
  show_legend?: boolean;
  show_grid?: boolean;
  value_format?: 'number' | 'percent' | 'currency' | 'compact';
}

export const CHART_RENDER_WIDTH = 800;
export const CHART_RENDER_HEIGHT = 480;

/** Render a chart spec to SVG. Pure on `(spec, theme)`. */
export function renderChartToSvg(spec: ChartSpec, theme: EChartsTheme): string {
  const echarts = loadEcharts();
  const option = buildEChartsOption(spec, theme);

  const chart = echarts.init(null, theme, {
    renderer: 'svg',
    ssr: true,
    useDirtyRect: false,
    width: CHART_RENDER_WIDTH,
    height: CHART_RENDER_HEIGHT,
  });
  try {
    chart.setOption(option);
    const raw: string = chart.renderToSVGString();
    return normaliseEChartsSvg(raw);
  } finally {
    chart.dispose();
  }
}

/** Convenience: render straight from a ChartNode. */
export function renderChartNodeToSvg(node: ChartNode, theme: EChartsTheme): string {
  return renderChartToSvg(toSpec(node), theme);
}

export function toSpec(node: ChartNode): ChartSpec {
  return {
    chart_type: node.chart_type,
    data: node.data,
    series_labels: node.series_labels,
    category_labels: node.category_labels,
    x_axis_title: node.x_axis_title,
    y_axis_title: node.y_axis_title,
    show_legend: node.show_legend,
    show_grid: node.show_grid,
    value_format: node.value_format,
  };
}

// ── ECharts option builder ───────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEChartsOption(spec: ChartSpec, theme: EChartsTheme): any {
  const showLegend = spec.show_legend !== false && !!spec.series_labels;
  const showGrid = spec.show_grid !== false;
  const valueFormatter = pickValueFormatter(spec.value_format);

  switch (spec.chart_type) {
    case 'bar':
      return cartesianOption(spec, theme, 'bar', { showLegend, showGrid, valueFormatter });
    case 'stacked_bar':
      return cartesianOption(spec, theme, 'bar', { showLegend, showGrid, valueFormatter, stacked: true });
    case 'line':
      return cartesianOption(spec, theme, 'line', { showLegend, showGrid, valueFormatter });
    case 'area':
      return cartesianOption(spec, theme, 'line', { showLegend, showGrid, valueFormatter, area: true });
    case 'scatter':
      return scatterOption(spec, { showLegend, showGrid, valueFormatter });
    case 'pie':
      return pieOption(spec, { showLegend, donut: false, valueFormatter });
    case 'donut':
      return pieOption(spec, { showLegend, donut: true, valueFormatter });
    case 'histogram':
      return cartesianOption(spec, theme, 'bar', { showLegend: false, showGrid, valueFormatter, barCategoryGap: '0%' });
    case 'heatmap':
      return heatmapOption(spec, theme);
    case 'radar':
      return radarOption(spec);
  }
}

interface CartesianOpts {
  showLegend: boolean;
  showGrid: boolean;
  valueFormatter: (v: number) => string;
  stacked?: boolean;
  area?: boolean;
  barCategoryGap?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cartesianOption(
  spec: ChartSpec,
  _theme: EChartsTheme,
  seriesType: 'bar' | 'line',
  opts: CartesianOpts,
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  const categories = spec.category_labels ?? defaultCategories(spec.data[0]?.length ?? 0);
  const seriesLabels = spec.series_labels ?? spec.data.map((_, i) => `Series ${i + 1}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const series: any[] = spec.data.map((row, i) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s: any = {
      name: seriesLabels[i] ?? `Series ${i + 1}`,
      type: seriesType,
      data: row.map((v) => (typeof v === 'number' ? v : Number(v))),
    };
    if (opts.stacked) s.stack = 'total';
    if (opts.area) s.areaStyle = {};
    if (opts.barCategoryGap !== undefined) s.barCategoryGap = opts.barCategoryGap;
    return s;
  });

  return {
    grid: { left: 56, right: 24, top: opts.showLegend ? 48 : 24, bottom: spec.x_axis_title ? 56 : 36 },
    legend: opts.showLegend ? { top: 8, data: seriesLabels } : { show: false },
    xAxis: {
      type: 'category',
      data: categories,
      name: spec.x_axis_title,
      nameLocation: 'middle',
      nameGap: 28,
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: spec.y_axis_title,
      nameLocation: 'middle',
      nameGap: 40,
      splitLine: { show: opts.showGrid },
      axisLabel: { formatter: opts.valueFormatter },
    },
    series,
    animation: false,
  };
}

interface ScatterOpts {
  showLegend: boolean;
  showGrid: boolean;
  valueFormatter: (v: number) => string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scatterOption(spec: ChartSpec, opts: ScatterOpts): any {
  // Each row is [x0, y0, x1, y1, …] OR pairs: validation lives in chart-shape.
  // Convention here: row layout is paired (even length) — render-time pad if odd.
  const seriesLabels = spec.series_labels ?? spec.data.map((_, i) => `Series ${i + 1}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const series: any[] = spec.data.map((row, i) => {
    const points: number[][] = [];
    for (let j = 0; j + 1 < row.length; j += 2) {
      const x = typeof row[j] === 'number' ? (row[j] as number) : Number(row[j]);
      const y = typeof row[j + 1] === 'number' ? (row[j + 1] as number) : Number(row[j + 1]);
      points.push([x, y]);
    }
    return {
      name: seriesLabels[i] ?? `Series ${i + 1}`,
      type: 'scatter',
      data: points,
      symbolSize: 10,
    };
  });

  return {
    grid: { left: 56, right: 24, top: opts.showLegend ? 48 : 24, bottom: spec.x_axis_title ? 56 : 36 },
    legend: opts.showLegend ? { top: 8, data: seriesLabels } : { show: false },
    xAxis: {
      type: 'value',
      name: spec.x_axis_title,
      nameLocation: 'middle',
      nameGap: 28,
      splitLine: { show: opts.showGrid },
    },
    yAxis: {
      type: 'value',
      name: spec.y_axis_title,
      nameLocation: 'middle',
      nameGap: 40,
      splitLine: { show: opts.showGrid },
      axisLabel: { formatter: opts.valueFormatter },
    },
    series,
    animation: false,
  };
}

interface PieOpts {
  showLegend: boolean;
  donut: boolean;
  valueFormatter: (v: number) => string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pieOption(spec: ChartSpec, opts: PieOpts): any {
  const slices = (spec.data[0] ?? []).map((value, i) => ({
    name: spec.category_labels?.[i] ?? `Slice ${i + 1}`,
    value: typeof value === 'number' ? value : Number(value),
  }));
  return {
    legend: opts.showLegend ? { top: 8, orient: 'horizontal' } : { show: false },
    series: [
      {
        type: 'pie',
        radius: opts.donut ? ['45%', '70%'] : '70%',
        center: ['50%', opts.showLegend ? '58%' : '50%'],
        data: slices,
        label: { show: true, formatter: '{b}: {d}%' },
        labelLine: { show: true },
      },
    ],
    animation: false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function heatmapOption(spec: ChartSpec, _theme: EChartsTheme): any {
  const categories = spec.category_labels ?? defaultCategories(spec.data[0]?.length ?? 0);
  const ySeries = spec.series_labels ?? spec.data.map((_, i) => `Row ${i + 1}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const points: any[] = [];
  let min = Infinity;
  let max = -Infinity;
  for (let y = 0; y < spec.data.length; y++) {
    const row = spec.data[y];
    for (let x = 0; x < row.length; x++) {
      const raw = row[x];
      const v = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
        points.push([x, y, v]);
      }
    }
  }
  if (!Number.isFinite(min)) min = 0;
  if (!Number.isFinite(max)) max = 0;

  return {
    grid: { left: 80, right: 32, top: 32, bottom: spec.x_axis_title ? 64 : 48 },
    xAxis: {
      type: 'category',
      data: categories,
      name: spec.x_axis_title,
      nameLocation: 'middle',
      nameGap: 32,
      splitArea: { show: true },
    },
    yAxis: {
      type: 'category',
      data: ySeries,
      name: spec.y_axis_title,
      nameLocation: 'middle',
      nameGap: 64,
      splitArea: { show: true },
    },
    visualMap: {
      min,
      max,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 4,
      show: false,
    },
    series: [
      {
        name: 'value',
        type: 'heatmap',
        data: points,
        label: { show: false },
      },
    ],
    animation: false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function radarOption(spec: ChartSpec): any {
  const indicators = (spec.category_labels ?? defaultCategories(spec.data[0]?.length ?? 0)).map(
    (name) => ({ name, max: maxAcrossRows(spec.data) }),
  );
  const seriesLabels = spec.series_labels ?? spec.data.map((_, i) => `Series ${i + 1}`);
  const data = spec.data.map((row, i) => ({
    name: seriesLabels[i] ?? `Series ${i + 1}`,
    value: row.map((v) => (typeof v === 'number' ? v : Number(v))),
  }));
  return {
    legend: { top: 8, data: seriesLabels },
    radar: { indicator: indicators, center: ['50%', '56%'], radius: '60%' },
    series: [{ type: 'radar', data }],
    animation: false,
  };
}

function maxAcrossRows(rows: Array<Array<number | string>>): number {
  let max = 0;
  for (const row of rows) {
    for (const cell of row) {
      const n = typeof cell === 'number' ? cell : Number(cell);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max === 0 ? 100 : max;
}

function defaultCategories(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `Cat ${i + 1}`);
}

function pickValueFormatter(format?: ChartSpec['value_format']): (v: number) => string {
  switch (format) {
    case 'percent':
      return (v: number) => `${Math.round(v * 100)}%`;
    case 'currency':
      return (v: number) => `$${v.toLocaleString('en-US')}`;
    case 'compact':
      return (v: number) => compactNumber(v);
    case 'number':
    default:
      return (v: number) => v.toLocaleString('en-US');
  }
}

function compactNumber(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return `${v}`;
}

// ── Determinism post-pass ───────────────────────────────────────

/**
 * ECharts (zrender) tags every SVG element with a class like
 * `zr<N>-cls-<M>` where `<N>` is the zrender instance index — bumped
 * for every `init()` call within the same process — and `<M>` is a
 * GLOBAL counter bumped for every distinct CSS rule emitted across all
 * instances. This wrecks byte-identical output across a multi-chart
 * deck.
 *
 * Renumber both halves deterministically: walk the SVG and replace
 * each unique `zr<digits>-cls-<digits>` token with `zr-cls-<K>` where
 * `<K>` is the first-occurrence index inside this single SVG. Stable
 * across renders because the option produces the same shape sequence.
 */
function normaliseEChartsSvg(svg: string): string {
  const tokenRe = /\bzr\d+-cls-\d+\b/g;
  const remap = new Map<string, string>();
  let counter = 0;
  return svg.replace(tokenRe, (match) => {
    const cached = remap.get(match);
    if (cached) return cached;
    const stable = `zr-cls-${counter++}`;
    remap.set(match, stable);
    return stable;
  });
}

/**
 * Replace theme-known hex literals in the rendered SVG with
 * `var(--color-*)` references. The chart-resolver wires this in after
 * render so the final HTML carries token-clean fills (validator
 * compliance + soul-switch reactivity).
 */
export function applyHexToVarSwap(svg: string, hexToVar: Map<string, string>): string {
  if (hexToVar.size === 0) return svg;
  // Cheap multi-pass: iterate the map and replace each known hex.
  // Bound is O(N keys × svg length), but N is at most ~16 (8 cats × 2 + 3
  // ink/grid + tints) so this stays fast.
  let out = svg;
  // Match #rrggbb (case-insensitive) inside attribute contexts. We use a
  // lookbehind-free pattern to keep regex portable.
  for (const [hex, varRef] of hexToVar) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) continue;
    const re = new RegExp(escapeRegex(hex), 'gi');
    out = out.replace(re, varRef);
  }
  return out;
}

function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
