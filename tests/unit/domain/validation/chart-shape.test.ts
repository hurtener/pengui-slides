/**
 * Unit tests for ChartShapeCheck (Stage 1).
 * One test per rule + skip-behavior + multi-chart aggregation.
 */

import { describe, it, expect } from 'vitest';
import { ChartShapeCheck } from '../../../../src/domain/validation/stage1/chart-shape.js';
import type { ChartSpec } from '../../../../src/domain/rendering/chart-renderer.js';

const check = new ChartShapeCheck();
const tokenNames: string[] = [];
const allowedFonts: string[] = [];

function makeFigure(spec: Partial<ChartSpec>, opts?: { darkBg?: boolean; textFills?: string[] }): string {
  const fullSpec: ChartSpec = {
    chart_type: spec.chart_type ?? 'bar',
    data: spec.data ?? [[1, 2, 3]],
    series_labels: spec.series_labels,
    category_labels: spec.category_labels,
    x_axis_title: spec.x_axis_title,
    y_axis_title: spec.y_axis_title,
    show_legend: spec.show_legend,
    show_grid: spec.show_grid,
    value_format: spec.value_format,
  };
  const b64 = Buffer.from(JSON.stringify(fullSpec)).toString('base64');
  const textNodes = (opts?.textFills ?? []).map((f) => `<text fill="${f}">x</text>`).join('');
  const slideAttrs = opts?.darkBg ? ' data-bg-mode="dark"' : '';
  return `<!DOCTYPE html><html><body><div class="slide"${slideAttrs}><figure class="pengui-chart pengui-chart-${fullSpec.chart_type}" data-pengui-chart-spec="${b64}"><svg>${textNodes}</svg></figure></div></body></html>`;
}

describe('ChartShapeCheck — pre-check skip', () => {
  it('returns [] when html has no pengui-chart needle', () => {
    const html = '<!DOCTYPE html><html><body><div class="slide"><p>nothing here</p></div></body></html>';
    expect(check.run(html, tokenNames, allowedFonts)).toEqual([]);
  });
});

describe('Rule 1: series count vs categorical colors', () => {
  it('warns when series count exceeds 8', () => {
    const data = Array.from({ length: 12 }, () => [1, 2, 3]);
    const html = makeFigure({ chart_type: 'stacked_bar', data });
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.some((i) => i.id.startsWith('chart-shape-series-color-reuse'))).toBe(true);
  });

  it('does not warn at exactly 8 series', () => {
    const data = Array.from({ length: 8 }, () => [1, 2, 3]);
    const html = makeFigure({ chart_type: 'stacked_bar', data });
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.some((i) => i.id.startsWith('chart-shape-series-color-reuse'))).toBe(false);
  });
});

describe('Rule 2: axis titles', () => {
  it('emits info when axis titles are missing on a bar chart', () => {
    const html = makeFigure({ chart_type: 'bar', data: [[1, 2, 3]] });
    const issues = check.run(html, tokenNames, allowedFonts);
    const found = issues.find((i) => i.id.startsWith('chart-shape-missing-axis-titles'));
    expect(found?.severity).toBe('info');
  });

  it('does not emit on pie/donut even without axis titles', () => {
    const html = makeFigure({ chart_type: 'pie', data: [[1, 2, 3]] });
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.some((i) => i.id.startsWith('chart-shape-missing-axis-titles'))).toBe(false);
  });

  it('does not emit when both axis titles are present', () => {
    const html = makeFigure({
      chart_type: 'bar', data: [[1, 2, 3]], x_axis_title: 'Q', y_axis_title: 'USD',
    });
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.some((i) => i.id.startsWith('chart-shape-missing-axis-titles'))).toBe(false);
  });
});

describe('Rule 3: pie/donut slice limit', () => {
  it('warns when pie has more than 7 slices', () => {
    const html = makeFigure({ chart_type: 'pie', data: [[1, 2, 3, 4, 5, 6, 7, 8, 9]] });
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.some((i) => i.id.startsWith('chart-shape-pie-too-many-slices'))).toBe(true);
  });

  it('does not warn at exactly 7 slices', () => {
    const html = makeFigure({ chart_type: 'donut', data: [[1, 2, 3, 4, 5, 6, 7]] });
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.some((i) => i.id.startsWith('chart-shape-pie-too-many-slices'))).toBe(false);
  });
});

describe('Rule 4: heatmap rectangular grid', () => {
  it('errors when heatmap rows have ragged lengths', () => {
    const html = makeFigure({ chart_type: 'heatmap', data: [[1, 2, 3], [4, 5]] });
    const issues = check.run(html, tokenNames, allowedFonts);
    const found = issues.find((i) => i.id.startsWith('chart-shape-heatmap-ragged'));
    expect(found?.severity).toBe('error');
  });

  it('does not error when heatmap rows are rectangular', () => {
    const html = makeFigure({ chart_type: 'heatmap', data: [[1, 2, 3], [4, 5, 6]] });
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.some((i) => i.id.startsWith('chart-shape-heatmap-ragged'))).toBe(false);
  });
});

describe('Rule 5: legend overflow', () => {
  it('warns when legend label total exceeds 200 chars', () => {
    const labels = Array.from({ length: 6 }, (_, i) => `Some Quite Long Series Label Number ${i + 1} XYZ`);
    const html = makeFigure({
      chart_type: 'bar',
      data: labels.map(() => [1, 2, 3]),
      series_labels: labels,
      show_legend: true,
    });
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.some((i) => i.id.startsWith('chart-shape-legend-overflow'))).toBe(true);
  });

  it('does not warn when show_legend is explicitly false', () => {
    const labels = Array.from({ length: 6 }, (_, i) => `Some Quite Long Series Label Number ${i + 1} XYZ`);
    const html = makeFigure({
      chart_type: 'bar',
      data: labels.map(() => [1, 2, 3]),
      series_labels: labels,
      show_legend: false,
    });
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.some((i) => i.id.startsWith('chart-shape-legend-overflow'))).toBe(false);
  });
});

describe('Rule 6: dark-bg text contrast', () => {
  it('warns when chart text uses light-bg text tokens on a dark slide', () => {
    const html = makeFigure(
      { chart_type: 'bar', data: [[1, 2, 3]], x_axis_title: 'X', y_axis_title: 'Y' },
      { darkBg: true, textFills: ['var(--color-text-secondary)'] },
    );
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.some((i) => i.id.startsWith('chart-shape-dark-bg-text'))).toBe(true);
  });

  it('does not warn on a light slide', () => {
    const html = makeFigure(
      { chart_type: 'bar', data: [[1, 2, 3]], x_axis_title: 'X', y_axis_title: 'Y' },
      { darkBg: false, textFills: ['var(--color-text-secondary)'] },
    );
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.some((i) => i.id.startsWith('chart-shape-dark-bg-text'))).toBe(false);
  });
});

describe('Rule 7: category_labels vs row width', () => {
  it('warns when category_labels.length differs from a row width', () => {
    const html = makeFigure({
      chart_type: 'bar',
      data: [[1, 2, 3]],
      category_labels: ['A', 'B'],
      x_axis_title: 'X', y_axis_title: 'Y',
    });
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.some((i) => i.id.startsWith('chart-shape-category-mismatch'))).toBe(true);
  });

  it('does not run on pie/donut/scatter', () => {
    const html = makeFigure({
      chart_type: 'pie',
      data: [[1, 2, 3]],
      category_labels: ['A', 'B'],
    });
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.some((i) => i.id.startsWith('chart-shape-category-mismatch'))).toBe(false);
  });
});

describe('Rule 8: scatter row parity', () => {
  it('warns when a scatter row has odd length', () => {
    const html = makeFigure({
      chart_type: 'scatter',
      data: [[1, 2, 3]], // odd
      x_axis_title: 'X', y_axis_title: 'Y',
    });
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.some((i) => i.id.startsWith('chart-shape-scatter-row-parity'))).toBe(true);
  });

  it('does not warn when scatter rows are paired', () => {
    const html = makeFigure({
      chart_type: 'scatter',
      data: [[1, 10, 2, 20]],
      x_axis_title: 'X', y_axis_title: 'Y',
    });
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.some((i) => i.id.startsWith('chart-shape-scatter-row-parity'))).toBe(false);
  });
});

describe('Multi-chart aggregation', () => {
  it('reports issues for each offending figure independently', () => {
    const a = Buffer.from(JSON.stringify({
      chart_type: 'pie',
      data: [[1, 2, 3, 4, 5, 6, 7, 8, 9]],
    })).toString('base64');
    const b = Buffer.from(JSON.stringify({
      chart_type: 'heatmap',
      data: [[1, 2], [3]],
    })).toString('base64');
    const html = `<!DOCTYPE html><html><body><div class="slide"><figure class="pengui-chart" data-pengui-chart-spec="${a}"></figure><figure class="pengui-chart" data-pengui-chart-spec="${b}"></figure></div></body></html>`;
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.some((i) => i.id === 'chart-shape-pie-too-many-slices-0')).toBe(true);
    expect(issues.some((i) => i.id === 'chart-shape-heatmap-ragged-1')).toBe(true);
  });
});
