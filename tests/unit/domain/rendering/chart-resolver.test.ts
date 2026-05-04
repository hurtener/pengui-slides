/**
 * Integration test for the chart compile → resolver pipeline:
 * renderChart emits a placeholder figure with a base64 data-pengui-chart-spec;
 * resolveChartRefs walks those figures, calls ChartRenderer with a soul-derived
 * theme, and replaces the placeholder body with real ECharts SVG.
 */

import { describe, it, expect } from 'vitest';
import { renderNode } from '../../../../src/domain/ir/compile/node-renderers.js';
import { resolveChartRefs } from '../../../../src/domain/rendering/chart-resolver.js';
import type { SlideNode } from '../../../../src/domain/ir/nodes.js';
import type { SoulLayers } from '../../../../src/types/design-soul.js';

const TEST_LAYERS: SoulLayers = {
  color: {
    canvas: '#ffffff', surface: '#f7f7f7', surfaceAlt: '#eeeeee', border: '#cccccc',
    textPrimary: '#101010', textSecondary: '#404040', textTertiary: '#808080', textInverse: '#ffffff',
    accentPrimary: '#4f46e5', accentSecondary: '#0ea5e9', accentWarm: '#f97316',
    success: '#16a34a', warning: '#facc15', error: '#dc2626', info: '#0284c7',
  },
  typography: {
    fontDisplay: "'Inter', sans-serif", fontBody: "'Inter', sans-serif", fontMono: "'Fira Code', monospace",
    sizeHero: 64, sizeH1: 40, sizeH2: 32, sizeH3: 24, sizeBody: 16, sizeLabel: 12, sizeCaption: 10,
    weightNormal: 400, weightMedium: 500, weightBold: 700,
    lineHeightHeading: 1.2, lineHeightBody: 1.5,
    letterSpacingHeading: '-0.02em', letterSpacingBody: '0',
  },
  spacing: { baseUnit: 8, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64, safeAreaInset: 48 },
  shape: { none: '0', sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px',
           buttonRadius: '8px', cardRadius: '12px', inputRadius: '6px', badgeRadius: '4px' },
  depth: { shadowNone: 'none', shadowSoft: 'a', shadowMedium: 'b', shadowElevated: 'c', shadowInner: 'd',
           borderWidth: '1px', borderOpacity: 1 },
  components: { cardPadding: '16px', cardShadow: 'a', cardBorderWidth: '1px',
                buttonPaddingX: '16px', buttonPaddingY: '8px', inputPaddingX: '12px',
                inputPaddingY: '8px', inputBorderWidth: '1px', badgePaddingX: '8px', badgePaddingY: '4px' },
  motion: { durationFast: '120ms', durationNormal: '240ms', durationSlow: '480ms',
            easingDefault: 'ease', easingEmphasized: 'ease-in', northStar: '', doRules: [], dontRules: [] },
};

const BAR_NODE: SlideNode = {
  type: 'chart',
  chart_type: 'bar',
  data: [[10, 20, 30]],
  category_labels: ['Q1', 'Q2', 'Q3'],
  series_labels: ['Revenue'],
};

describe('renderChart placeholder + resolveChartRefs', () => {
  it('emits a placeholder figure with a base64 data-pengui-chart-spec', () => {
    const html = renderNode(BAR_NODE, ['body', 0]);
    expect(html).toContain('class="pengui-chart pengui-chart-bar"');
    expect(html).toMatch(/data-pengui-chart-spec="[A-Za-z0-9+/=]+"/);
    expect(html).toContain('chart pending');
  });

  it('resolveChartRefs swaps the placeholder for a real SVG body', () => {
    const placeholderHtml = renderNode(BAR_NODE, ['body', 0]);
    const wrapped = `<!DOCTYPE html><html><body><div class="slide">${placeholderHtml}</div></body></html>`;
    const resolved = resolveChartRefs(wrapped, TEST_LAYERS);
    // The placeholder text should be gone.
    expect(resolved).not.toContain('chart pending');
    // The data-pengui-chart-spec attribute is preserved on the figure
    // so the editable PPTX path can still reference it.
    expect(resolved).toMatch(/data-pengui-chart-spec="[A-Za-z0-9+/=]+"/);
    // Real ECharts SVG carries an x-axis tick group and viewBox.
    expect(resolved).toMatch(/<svg[^>]*viewBox=/);
    // var(--color-*) refs are present (token-clean fills via the
    // hex→var post-pass).
    expect(resolved).toContain('var(--color-');
  });

  it('is a no-op on chart-free html', () => {
    const html = '<!DOCTYPE html><html><body><p>no charts here</p></body></html>';
    expect(resolveChartRefs(html, TEST_LAYERS)).toBe(html);
  });

  it('preserves the figure root attributes including data-ir-path', () => {
    const placeholderHtml = renderNode(BAR_NODE, ['body', 2]);
    const resolved = resolveChartRefs(placeholderHtml, TEST_LAYERS);
    expect(resolved).toContain('data-ir-path="body,2"');
    expect(resolved).toContain('data-ir-node-type="chart"');
  });
});
