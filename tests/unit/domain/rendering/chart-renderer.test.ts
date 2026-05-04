import { describe, it, expect } from 'vitest';
import { renderChartToSvg, applyHexToVarSwap, type ChartSpec } from '../../../../src/domain/rendering/chart-renderer.js';
import { buildEChartsTheme, buildHexToVarMap } from '../../../../src/domain/souls/chart-theme-bridge.js';
import type { SoulLayers } from '../../../../src/types/design-soul.js';

const TEST_LAYERS: SoulLayers = {
  color: {
    canvas: '#ffffff',
    surface: '#f7f7f7',
    surfaceAlt: '#eeeeee',
    border: '#cccccc',
    textPrimary: '#101010',
    textSecondary: '#404040',
    textTertiary: '#808080',
    textInverse: '#ffffff',
    accentPrimary: '#4f46e5',
    accentSecondary: '#0ea5e9',
    accentWarm: '#f97316',
    success: '#16a34a',
    warning: '#facc15',
    error: '#dc2626',
    info: '#0284c7',
  },
  typography: {
    fontDisplay: "'Inter', sans-serif",
    fontBody: "'Inter', sans-serif",
    fontMono: "'Fira Code', monospace",
    sizeHero: 64, sizeH1: 40, sizeH2: 32, sizeH3: 24,
    sizeBody: 16, sizeLabel: 12, sizeCaption: 10,
    weightNormal: 400, weightMedium: 500, weightBold: 700,
    lineHeightHeading: 1.2, lineHeightBody: 1.5,
    letterSpacingHeading: '-0.02em', letterSpacingBody: '0',
  },
  spacing: { baseUnit: 8, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64, safeAreaInset: 48 },
  shape: { none: '0', sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px',
           buttonRadius: '8px', cardRadius: '12px', inputRadius: '6px', badgeRadius: '4px' },
  depth: { shadowNone: 'none', shadowSoft: '0 1px 2px rgba(0,0,0,0.1)',
           shadowMedium: '0 2px 4px rgba(0,0,0,0.1)', shadowElevated: '0 4px 8px rgba(0,0,0,0.15)',
           shadowInner: 'inset 0 1px 2px rgba(0,0,0,0.1)', borderWidth: '1px', borderOpacity: 1 },
  components: { cardPadding: '16px', cardShadow: 'var(--shadow-soft)', cardBorderWidth: '1px',
                buttonPaddingX: '16px', buttonPaddingY: '8px', inputPaddingX: '12px',
                inputPaddingY: '8px', inputBorderWidth: '1px', badgePaddingX: '8px', badgePaddingY: '4px' },
  motion: { durationFast: '120ms', durationNormal: '240ms', durationSlow: '480ms',
            easingDefault: 'ease', easingEmphasized: 'cubic-bezier(.2,.8,.2,1)',
            northStar: '', doRules: [], dontRules: [] },
};

const SIMPLE_BAR: ChartSpec = {
  chart_type: 'bar',
  data: [[10, 20, 30]],
  category_labels: ['Q1', 'Q2', 'Q3'],
  series_labels: ['Revenue'],
  x_axis_title: 'Quarter',
  y_axis_title: 'USD',
};

describe('chart-renderer: determinism', () => {
  it('produces byte-identical SVG across multiple renders in the same process', () => {
    const theme = buildEChartsTheme(TEST_LAYERS);
    const a = renderChartToSvg(SIMPLE_BAR, theme);
    const b = renderChartToSvg(SIMPLE_BAR, theme);
    const c = renderChartToSvg(SIMPLE_BAR, theme);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('strips ECharts per-process instance prefix from class names', () => {
    const theme = buildEChartsTheme(TEST_LAYERS);
    const svg = renderChartToSvg(SIMPLE_BAR, theme);
    // After normalisation, no `zr<digits>-cls-` should remain — only `zr-cls-`.
    expect(svg).not.toMatch(/\bzr\d+-cls-/);
    expect(svg).toMatch(/\bzr-cls-/);
  });

  it('emits an SVG with a viewBox', () => {
    const theme = buildEChartsTheme(TEST_LAYERS);
    const svg = renderChartToSvg(SIMPLE_BAR, theme);
    expect(svg).toMatch(/<svg[^>]*viewBox=/);
  });
});

describe('chart-renderer: chart_type coverage', () => {
  const theme = buildEChartsTheme(TEST_LAYERS);
  const types: ChartSpec['chart_type'][] = [
    'bar', 'stacked_bar', 'line', 'area',
    'scatter', 'pie', 'donut', 'histogram', 'heatmap', 'radar',
  ];

  for (const chart_type of types) {
    it(`renders ${chart_type} without throwing`, () => {
      const data = chart_type === 'scatter'
        ? [[1, 10, 2, 20, 3, 30]]
        : chart_type === 'heatmap'
          ? [[1, 2, 3], [4, 5, 6]]
          : [[10, 20, 30]];
      const spec: ChartSpec = {
        chart_type,
        data,
        category_labels: ['A', 'B', 'C'],
        series_labels: ['S1'],
      };
      const svg = renderChartToSvg(spec, theme);
      expect(svg).toContain('<svg');
      expect(svg.length).toBeGreaterThan(100);
    });
  }
});

describe('applyHexToVarSwap', () => {
  it('replaces theme-known hex literals with CSS-var refs', () => {
    const map = buildHexToVarMap(TEST_LAYERS);
    // Pick any hex/var pair from the map.
    const [someHex, someVar] = [...map.entries()][0];
    const svg = `<rect fill="${someHex}"></rect><line stroke="${someHex.toUpperCase()}"/>`;
    const swapped = applyHexToVarSwap(svg, map);
    expect(swapped).toContain(someVar);
    expect(swapped).not.toMatch(new RegExp(someHex, 'i'));
  });

  it('replaces border + text-secondary tokens too', () => {
    const map = buildHexToVarMap(TEST_LAYERS);
    expect(map.get('#cccccc')).toBe('var(--color-border)');
    expect(map.get('#404040')).toBe('var(--color-text-secondary)');
    expect(map.get('#808080')).toBe('var(--color-text-tertiary)');
  });

  it('returns input unchanged when map is empty', () => {
    const svg = '<rect fill="#abcdef"/>';
    expect(applyHexToVarSwap(svg, new Map())).toBe(svg);
  });
});
