/**
 * Chart Shape Check (Stage 1, v4.12)
 *
 * Fires only when a slide's HTML contains chart figures
 * (`pengui-chart` class). Reads each chart's structural payload from
 * `data-pengui-chart-spec` (base64-JSON, emitted by `renderChart`) and
 * applies eight chart-specific shape rules. Generic SVG hygiene
 * (viewBox, var-only fills, var-only text-sizes) is already covered
 * by `DiagramLegibilityCheck` once the chart is rendered, so this
 * check focuses on payload-level concerns the legibility check can't
 * see (slice counts, axis titles, dark-bg contrast, …).
 *
 * All findings are warnings or info — chart shape is guidance, not a
 * gate. Performance: cheap pre-check (`html.includes('pengui-chart')`)
 * skips the cheerio parse on chart-free slides.
 */

import * as cheerio from 'cheerio';
import type { Stage1Check, ValidationIssue } from '../../../types/validation.js';
import type { ChartSpec } from '../../rendering/chart-renderer.js';
import { ChartTypeSchema } from '../../ir/nodes.js';

const PRE_CHECK_NEEDLE = 'pengui-chart';
const MAX_CATEGORICAL_COLORS = 8;
const MAX_PIE_SLICES = 7;
const LEGEND_OVERFLOW_CHAR_BUDGET = 200;

const TYPES_NEEDING_AXIS_TITLES = new Set<ChartSpec['chart_type']>([
  'bar', 'stacked_bar', 'line', 'area', 'scatter', 'histogram', 'heatmap', 'radar',
]);

interface ChartContext {
  index: number;
  spec: ChartSpec;
  isDarkBg: boolean;
  textNodes: string[];
}

export class ChartShapeCheck implements Stage1Check {
  readonly id = 'chart-shape';
  readonly name = 'Chart Shape';

  run(html: string, _soulTokenNames: string[], _allowedFonts: string[]): ValidationIssue[] {
    if (!html.includes(PRE_CHECK_NEEDLE)) return [];

    const $ = cheerio.load(html);
    const figures = $('figure.pengui-chart');
    if (figures.length === 0) return [];

    const slideIsDark = $('[data-bg-mode="dark"]').length > 0;
    const issues: ValidationIssue[] = [];

    figures.each((index, fig) => {
      const $fig = $(fig);
      const specB64 = $fig.attr('data-pengui-chart-spec');
      if (!specB64) return;
      const spec = decodeSpec(specB64);
      if (!spec) return;

      const ctx: ChartContext = {
        index,
        spec,
        isDarkBg: slideIsDark,
        textNodes: $fig.find('text').toArray().map((el) => $(el).attr('fill') ?? ''),
      };

      issues.push(...this.checkSeriesVsColors(ctx));
      issues.push(...this.checkAxisTitles(ctx));
      issues.push(...this.checkPieSliceLimit(ctx));
      issues.push(...this.checkHeatmapShape(ctx));
      issues.push(...this.checkLegendOverflow(ctx));
      issues.push(...this.checkDarkBgContrast(ctx));
      issues.push(...this.checkCategoryLabelCount(ctx));
      issues.push(...this.checkScatterRowParity(ctx));
    });

    return issues;
  }

  // ── Rule 1: series count vs available categorical colors ──────────
  private checkSeriesVsColors(ctx: ChartContext): ValidationIssue[] {
    const seriesCount = ctx.spec.data.length;
    if (seriesCount <= MAX_CATEGORICAL_COLORS) return [];
    return [{
      id: `${this.id}-series-color-reuse-${ctx.index}`,
      stage: 'stage1_lint',
      severity: 'warning',
      rule: this.id,
      message: `Chart has ${seriesCount} series but only ${MAX_CATEGORICAL_COLORS} categorical colors are available. Series ${MAX_CATEGORICAL_COLORS + 1}–${seriesCount} will reuse colors a–${String.fromCharCode(96 + ((seriesCount - 1) % MAX_CATEGORICAL_COLORS) + 1)}; consider grouping into stacked categories or splitting into multiple charts.`,
      element: 'figure.pengui-chart',
      fixSuggestion: `Reduce series_labels.length to ${MAX_CATEGORICAL_COLORS} or fewer, or switch to a stacked_bar / heatmap that handles more series cleanly.`,
    }];
  }

  // ── Rule 2: axis titles ──────────────────────────────────────────
  private checkAxisTitles(ctx: ChartContext): ValidationIssue[] {
    if (!TYPES_NEEDING_AXIS_TITLES.has(ctx.spec.chart_type)) return [];
    const hasX = !!ctx.spec.x_axis_title?.trim();
    const hasY = !!ctx.spec.y_axis_title?.trim();
    if (hasX && hasY) return [];
    return [{
      id: `${this.id}-missing-axis-titles-${ctx.index}`,
      stage: 'stage1_lint',
      severity: 'info',
      rule: this.id,
      message: `Chart of type "${ctx.spec.chart_type}" is missing ${!hasX && !hasY ? 'both axis titles' : !hasX ? 'an x-axis title' : 'a y-axis title'}. Axis titles improve a11y and presentation reading at a distance.`,
      element: 'figure.pengui-chart',
      fixSuggestion: 'Set x_axis_title and y_axis_title on the ChartNode payload.',
    }];
  }

  // ── Rule 3: pie / donut slice limit ──────────────────────────────
  private checkPieSliceLimit(ctx: ChartContext): ValidationIssue[] {
    if (ctx.spec.chart_type !== 'pie' && ctx.spec.chart_type !== 'donut') return [];
    const sliceCount = ctx.spec.data[0]?.length ?? 0;
    if (sliceCount <= MAX_PIE_SLICES) return [];
    return [{
      id: `${this.id}-pie-too-many-slices-${ctx.index}`,
      stage: 'stage1_lint',
      severity: 'warning',
      rule: this.id,
      message: `Pie/donut chart has ${sliceCount} slices; pies are hard to read above ${MAX_PIE_SLICES} slices. Consider switching to a bar or stacked_bar chart for clearer comparisons.`,
      element: 'figure.pengui-chart',
      fixSuggestion: 'Switch chart_type to "bar" or "stacked_bar", or group small slices into an "Other" category.',
    }];
  }

  // ── Rule 4: heatmap rectangular grid ─────────────────────────────
  private checkHeatmapShape(ctx: ChartContext): ValidationIssue[] {
    if (ctx.spec.chart_type !== 'heatmap') return [];
    const rows = ctx.spec.data;
    if (rows.length === 0) return [];
    const firstLen = rows[0].length;
    const ragged = rows.some((r) => r.length !== firstLen);
    if (!ragged) return [];
    return [{
      id: `${this.id}-heatmap-ragged-${ctx.index}`,
      stage: 'stage1_lint',
      severity: 'error',
      rule: this.id,
      message: `Heatmap data has ragged rows (mixed lengths). Every row must have the same number of cells; pad short rows with 0 or null.`,
      element: 'figure.pengui-chart',
      fixSuggestion: 'Pad each row in `data` to the same length before sending the ChartNode payload.',
    }];
  }

  // ── Rule 5: legend overflow heuristic ────────────────────────────
  private checkLegendOverflow(ctx: ChartContext): ValidationIssue[] {
    if (ctx.spec.show_legend === false) return [];
    const labels = ctx.spec.series_labels ?? [];
    if (labels.length === 0) return [];
    const totalChars = labels.reduce((sum, l) => sum + l.length, 0);
    if (totalChars <= LEGEND_OVERFLOW_CHAR_BUDGET) return [];
    return [{
      id: `${this.id}-legend-overflow-${ctx.index}`,
      stage: 'stage1_lint',
      severity: 'warning',
      rule: this.id,
      message: `Legend label total (${totalChars} chars across ${labels.length} series) exceeds ${LEGEND_OVERFLOW_CHAR_BUDGET}; the legend may wrap or clip at presentation sizes. Consider shorter labels or splitting the chart.`,
      element: 'figure.pengui-chart',
      fixSuggestion: 'Shorten series_labels (rename "Quarterly Revenue 2025" → "Q-Rev 2025"), or set show_legend: false and rely on direct labeling.',
    }];
  }

  // ── Rule 6: dark-bg text contrast ────────────────────────────────
  private checkDarkBgContrast(ctx: ChartContext): ValidationIssue[] {
    if (!ctx.isDarkBg) return [];
    if (ctx.textNodes.length === 0) return [];
    // Light fills (text-primary / text-secondary / text-tertiary) are
    // dark-on-light by definition. On a dark slide, charts must use the
    // -inverse family so the axis labels are legible.
    const offendingFills = ctx.textNodes.filter(
      (fill) =>
        /^var\(\s*--color-text-(?:primary|secondary|tertiary)\b/i.test(fill),
    );
    if (offendingFills.length === 0) return [];
    return [{
      id: `${this.id}-dark-bg-text-${ctx.index}`,
      stage: 'stage1_lint',
      severity: 'warning',
      rule: this.id,
      message: `Chart sits on a dark slide (data-bg-mode="dark") but its axis text fills resolve to --color-text-primary / -secondary / -tertiary, which are dark-on-light. Re-render with a soul whose chart-theme uses --color-text-inverse-family tokens.`,
      element: 'figure.pengui-chart text',
      fixSuggestion: 'The chart-theme-bridge should swap text fills to --color-text-inverse on dark slides; if you see this warning, the theme bridge needs a dark-mode branch.',
    }];
  }

  // ── Rule 7: category_labels length vs data row width ─────────────
  private checkCategoryLabelCount(ctx: ChartContext): ValidationIssue[] {
    const labels = ctx.spec.category_labels;
    if (!labels || labels.length === 0) return [];
    // Cartesian charts: each row's length === number of x-axis categories.
    if (
      ctx.spec.chart_type === 'pie' ||
      ctx.spec.chart_type === 'donut' ||
      ctx.spec.chart_type === 'scatter'
    ) {
      return [];
    }
    const rowWidths = ctx.spec.data.map((r) => r.length);
    const expected = labels.length;
    const mismatch = rowWidths.some((w) => w !== expected);
    if (!mismatch) return [];
    return [{
      id: `${this.id}-category-mismatch-${ctx.index}`,
      stage: 'stage1_lint',
      severity: 'warning',
      rule: this.id,
      message: `category_labels has ${expected} entries but at least one data row has ${rowWidths.find((w) => w !== expected)} cells. The renderer pads or truncates which produces misaligned columns at presentation distance.`,
      element: 'figure.pengui-chart',
      fixSuggestion: 'Make every row in `data` exactly category_labels.length cells long.',
    }];
  }

  // ── Rule 8: scatter rows must have even length (x,y pairs) ───────
  private checkScatterRowParity(ctx: ChartContext): ValidationIssue[] {
    if (ctx.spec.chart_type !== 'scatter') return [];
    const oddRow = ctx.spec.data.findIndex((r) => r.length % 2 !== 0);
    if (oddRow < 0) return [];
    return [{
      id: `${this.id}-scatter-row-parity-${ctx.index}`,
      stage: 'stage1_lint',
      severity: 'warning',
      rule: this.id,
      message: `Scatter chart row ${oddRow} has an odd number of values (${ctx.spec.data[oddRow].length}). Scatter rows are interpreted as alternating [x, y] pairs; the trailing value is dropped.`,
      element: 'figure.pengui-chart',
      fixSuggestion: 'Pair x-values with y-values so every scatter row has an even length.',
    }];
  }
}

// ── Helpers ──────────────────────────────────────────────────────

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
  if (!ChartTypeSchema.safeParse(obj.chart_type).success) return null;
  if (!Array.isArray(obj.data)) return null;
  return obj as unknown as ChartSpec;
}
