/**
 * chart-theme-bridge — derive an ECharts theme object from a soul's
 * SoulLayers. Used by the v4.12 ChartRenderer to render data-driven
 * SVG charts that match the active soul.
 *
 * Architectural note: ECharts itself doesn't understand CSS variables,
 * so the theme resolves the eight categorical colors (and axis ink /
 * grid colors) to hex literals. The chart-renderer's post-pass then
 * swaps those hex literals back to `var(--color-*)` references inside
 * the rendered SVG so the soul-token discipline holds (validator
 * compliance + soul-switch reactivity without recompile).
 *
 * The bridge is pure on its input. Theme objects are cached in the
 * renderer keyed by soul identity to avoid redoing token resolution
 * for multi-chart decks.
 */

import type { SoulLayers } from '../../types/design-soul.js';
import { buildCategoryColorTokens } from './token-generator.js';

export interface EChartsTheme {
  /** Categorical color palette — one hex per series. */
  color: string[];
  backgroundColor: string;
  textStyle: {
    color: string;
    fontFamily: string;
    fontSize: number;
  };
  title: {
    textStyle: {
      color: string;
      fontFamily: string;
      fontSize: number;
    };
  };
  legend: {
    textStyle: {
      color: string;
      fontSize: number;
    };
  };
  axisPointer: { lineStyle: { color: string } };
  categoryAxis: {
    axisLine: { lineStyle: { color: string } };
    axisTick: { lineStyle: { color: string } };
    axisLabel: { color: string; fontSize: number };
    splitLine: { show: boolean; lineStyle: { color: string } };
  };
  valueAxis: {
    axisLine: { lineStyle: { color: string } };
    axisTick: { lineStyle: { color: string } };
    axisLabel: { color: string; fontSize: number };
    splitLine: { show: boolean; lineStyle: { color: string } };
  };
}

/**
 * Build an ECharts theme from a soul's layers.
 *
 * Color array is ordered [a, b, c, d, e, f, g, h] mirroring
 * `--color-category-*`. The renderer post-pass replaces these literals
 * with `var(--color-category-*)` references inside the rendered SVG
 * so the chart re-themes when the soul switches.
 */
export function buildEChartsTheme(layers: SoulLayers): EChartsTheme {
  const cats = buildCategoryColorTokens(layers.color.accentPrimary);
  // Pull the eight base hex literals (skip the "-tint" entries).
  const palette = cats
    .filter((entry) => !entry.name.endsWith('-tint'))
    .map((entry) => entry.value);

  const ink = layers.color.textSecondary;
  const inkMuted = layers.color.textTertiary;
  const grid = layers.color.border;
  const fontBody = layers.typography.fontBody;
  const fontSizeBody = layers.typography.sizeBody;
  const fontSizeLabel = layers.typography.sizeLabel;
  const fontSizeH3 = layers.typography.sizeH3;

  return {
    color: palette,
    backgroundColor: 'transparent',
    textStyle: {
      color: ink,
      fontFamily: fontBody,
      fontSize: fontSizeBody,
    },
    title: {
      textStyle: {
        color: ink,
        fontFamily: fontBody,
        fontSize: fontSizeH3,
      },
    },
    legend: {
      textStyle: {
        color: inkMuted,
        fontSize: fontSizeLabel,
      },
    },
    axisPointer: { lineStyle: { color: inkMuted } },
    categoryAxis: {
      axisLine: { lineStyle: { color: grid } },
      axisTick: { lineStyle: { color: grid } },
      axisLabel: { color: inkMuted, fontSize: fontSizeLabel },
      splitLine: { show: false, lineStyle: { color: grid } },
    },
    valueAxis: {
      axisLine: { lineStyle: { color: grid } },
      axisTick: { lineStyle: { color: grid } },
      axisLabel: { color: inkMuted, fontSize: fontSizeLabel },
      splitLine: { show: true, lineStyle: { color: grid } },
    },
  };
}

/**
 * Hex literal → CSS-var lookup table for the post-pass swap inside
 * `chart-renderer.ts`. Returns a Map keyed on lowercased hex (`#abcdef`)
 * with values like `var(--color-category-a)` so the renderer can swap
 * theme-known fills in the rendered SVG to var refs.
 */
export function buildHexToVarMap(layers: SoulLayers): Map<string, string> {
  const map = new Map<string, string>();
  const cats = buildCategoryColorTokens(layers.color.accentPrimary);
  // Insert in reverse so when accent rotation collides (cat a ≡ cat d at
  // rotation step 3, since channel rotation wraps every 3 steps), the
  // lower-letter token (a, b, c…) wins on Map.set's last-write-wins.
  for (let i = cats.length - 1; i >= 0; i -= 1) {
    map.set(cats[i].value.toLowerCase(), `var(${cats[i].name})`);
  }
  // Inks + grid get var refs too so the validator's "fills must be
  // var(--color-*)" rule passes uniformly.
  const ink = layers.color.textSecondary.toLowerCase();
  const inkMuted = layers.color.textTertiary.toLowerCase();
  const grid = layers.color.border.toLowerCase();
  if (ink) map.set(ink, 'var(--color-text-secondary)');
  if (inkMuted) map.set(inkMuted, 'var(--color-text-tertiary)');
  if (grid) map.set(grid, 'var(--color-border)');
  return map;
}
