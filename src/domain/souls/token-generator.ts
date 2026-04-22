/**
 * Token Generator for Design Souls.
 *
 * Converts SoulLayers into CSS custom properties (:root block)
 * for use in layout recipes and rendered slides.
 *
 * ## Print-mode typography strategy
 *
 * Souls are medium-agnostic: the same soul definition is used for both slide
 * and print decks. To avoid forking souls or forcing all slide templates to
 * change, the generator emits a **single additional scoped CSS block** for
 * print mode, keyed by the attribute selector `[data-pengui-medium="print"]`
 * on the `<html>` element.
 *
 * The slide `:root` block retains the soul's native typography scale (suitable
 * for 1920×1080 presentation canvases). The print block overrides only the
 * typographic tokens that differ at A4/Letter reading distance (per SPEC §5.1),
 * plus `--space-safe-area`.
 *
 * **Why `[data-pengui-medium="print"]` instead of `:root.pengui-print`?**
 * - Data attributes are idiomatic HTML and easier to set via `<html data-pengui-medium="print">`.
 * - The selector specificity matches `:root.class`, so no risk of accidental
 *   override battles with the base `:root` block.
 * - Slide templates need no change: they don't carry the attribute, so only the
 *   base `:root` tokens apply.
 * - The generated CSS is compact: only 8 tokens are overridden, not the full ~40.
 *
 * Both blocks are always emitted in the returned `cssString`. A print deck's
 * recipe templates include `<html data-pengui-medium="print">` so the print
 * scope activates. Slide recipes use plain `<html>` and are unaffected.
 */

import type { SoulLayers } from '../../types/design-soul.js';

// ── Public Interface ────────────────────────────────────────────

export interface TokenGeneratorResult {
  /** Complete CSS block: :root slide tokens + [data-pengui-medium="print"] overrides */
  cssString: string;
  /** Array of all generated CSS custom property names (from the :root block) */
  tokenNames: string[];
  /** Extracted font family names from the typography layer */
  allowedFonts: string[];
}

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Convert a camelCase string to kebab-case.
 * e.g. "textPrimary" -> "text-primary"
 */
function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Determine whether a value should have 'px' appended.
 * Numeric values from typography sizes, spacing, and weights need units,
 * but weights and line-heights are unitless, letter-spacing is already a string.
 */
type TokenEntry = { name: string; value: string };

function mapColorTokens(color: SoulLayers['color']): TokenEntry[] {
  const entries: TokenEntry[] = [];
  for (const [key, value] of Object.entries(color)) {
    entries.push({ name: `--color-${camelToKebab(key)}`, value });
  }
  return entries;
}

function mapTypographyTokens(typography: SoulLayers['typography']): TokenEntry[] {
  const entries: TokenEntry[] = [];

  // Font families
  entries.push({ name: '--font-display', value: typography.fontDisplay });
  entries.push({ name: '--font-body', value: typography.fontBody });
  entries.push({ name: '--font-mono', value: typography.fontMono });

  // Sizes (numeric -> px)
  entries.push({ name: '--text-hero', value: `${typography.sizeHero}px` });
  entries.push({ name: '--text-h1', value: `${typography.sizeH1}px` });
  entries.push({ name: '--text-h2', value: `${typography.sizeH2}px` });
  entries.push({ name: '--text-h3', value: `${typography.sizeH3}px` });
  entries.push({ name: '--text-body', value: `${typography.sizeBody}px` });
  entries.push({ name: '--text-label', value: `${typography.sizeLabel}px` });
  entries.push({ name: '--text-caption', value: `${typography.sizeCaption}px` });

  // Weights (unitless)
  entries.push({ name: '--weight-normal', value: `${typography.weightNormal}` });
  entries.push({ name: '--weight-medium', value: `${typography.weightMedium}` });
  entries.push({ name: '--weight-bold', value: `${typography.weightBold}` });

  // Line heights (unitless ratios)
  entries.push({ name: '--line-height-heading', value: `${typography.lineHeightHeading}` });
  entries.push({ name: '--line-height-body', value: `${typography.lineHeightBody}` });

  // Letter spacing (already strings like '-0.02em')
  entries.push({ name: '--letter-spacing-heading', value: typography.letterSpacingHeading });
  entries.push({ name: '--letter-spacing-body', value: typography.letterSpacingBody });

  return entries;
}

function mapSpacingTokens(spacing: SoulLayers['spacing']): TokenEntry[] {
  return [
    { name: '--space-base', value: `${spacing.baseUnit}px` },
    { name: '--space-xs', value: `${spacing.xs}px` },
    { name: '--space-sm', value: `${spacing.sm}px` },
    { name: '--space-md', value: `${spacing.md}px` },
    { name: '--space-lg', value: `${spacing.lg}px` },
    { name: '--space-xl', value: `${spacing.xl}px` },
    { name: '--space-xxl', value: `${spacing.xxl}px` },
    { name: '--space-xxxl', value: `${spacing.xxxl}px` },
    { name: '--space-safe-area', value: `${spacing.safeAreaInset}px` },
  ];
}

function mapShapeTokens(shape: SoulLayers['shape']): TokenEntry[] {
  return [
    { name: '--radius-none', value: shape.none },
    { name: '--radius-sm', value: shape.sm },
    { name: '--radius-md', value: shape.md },
    { name: '--radius-lg', value: shape.lg },
    { name: '--radius-xl', value: shape.xl },
    { name: '--radius-full', value: shape.full },
    { name: '--radius-button', value: shape.buttonRadius },
    { name: '--radius-card', value: shape.cardRadius },
    { name: '--radius-input', value: shape.inputRadius },
    { name: '--radius-badge', value: shape.badgeRadius },
  ];
}

function mapDepthTokens(depth: SoulLayers['depth']): TokenEntry[] {
  return [
    { name: '--shadow-none', value: depth.shadowNone },
    { name: '--shadow-soft', value: depth.shadowSoft },
    { name: '--shadow-medium', value: depth.shadowMedium },
    { name: '--shadow-elevated', value: depth.shadowElevated },
    { name: '--shadow-inner', value: depth.shadowInner },
    { name: '--border-width', value: depth.borderWidth },
    { name: '--border-opacity', value: `${depth.borderOpacity}` },
  ];
}

function mapComponentTokens(components: SoulLayers['components']): TokenEntry[] {
  return [
    { name: '--card-padding', value: components.cardPadding },
    { name: '--card-shadow', value: components.cardShadow },
    { name: '--card-border-width', value: components.cardBorderWidth },
    { name: '--button-padding-x', value: components.buttonPaddingX },
    { name: '--button-padding-y', value: components.buttonPaddingY },
    { name: '--input-padding-x', value: components.inputPaddingX },
    { name: '--input-padding-y', value: components.inputPaddingY },
    { name: '--input-border-width', value: components.inputBorderWidth },
    { name: '--badge-padding-x', value: components.badgePaddingX },
    { name: '--badge-padding-y', value: components.badgePaddingY },
  ];
}

function mapMotionTokens(motion: SoulLayers['motion']): TokenEntry[] {
  return [
    { name: '--duration-fast', value: motion.durationFast },
    { name: '--duration-normal', value: motion.durationNormal },
    { name: '--duration-slow', value: motion.durationSlow },
    { name: '--easing-default', value: motion.easingDefault },
    { name: '--easing-emphasized', value: motion.easingEmphasized },
  ];
}

/**
 * Extract unique font family names from the typography layer.
 */
function extractFontFamilies(typography: SoulLayers['typography']): string[] {
  const families = new Set<string>();

  for (const raw of [typography.fontDisplay, typography.fontBody, typography.fontMono]) {
    // Font values may be quoted or comma-separated stacks like "'Inter', sans-serif"
    // Extract the primary family name (first in the stack)
    const primary = raw.split(',')[0].trim().replace(/['"]/g, '');
    if (primary) {
      families.add(primary);
    }
  }

  return Array.from(families);
}

// ── Print-mode overrides ─────────────────────────────────────────

/**
 * Print-mode typography scale per SPEC §5.1.
 *
 * These values are fixed — they are the canonical print defaults regardless
 * of the soul's slide-mode sizes. The soul's type scale (sizeH1 etc.) is
 * intentionally ignored here: a soul's character comes from color, shape,
 * depth, and component tokens which are shared across mediums. Typography
 * sizes must be smaller on A4 to remain readable at reading distance.
 *
 * NOTE: `--text-display` maps to the soul's "hero" concept at print scale.
 * The token name `--text-display` is introduced for print; slide templates
 * continue using `--text-hero`. Both are declared in the print scope.
 */
function buildPrintTypographyOverrides(): TokenEntry[] {
  return [
    // Text sizes
    { name: '--text-display', value: '56px' },
    { name: '--text-hero',    value: '56px' }, // alias so print recipes can use either name
    { name: '--text-h1',      value: '36px' },
    { name: '--text-h2',      value: '24px' },
    { name: '--text-h3',      value: '18px' },
    { name: '--text-body',    value: '12px' },
    { name: '--text-caption', value: '9px'  },
    // Line-height override
    { name: '--leading-body', value: '1.55' },
    // Safe-area override (96px for A4/Letter vs 48px for slides)
    { name: '--space-safe-area', value: '96px' },
  ];
}

/**
 * Build the [data-pengui-medium="print"] scoped CSS block.
 *
 * This block overrides only the tokens that differ between slide and print
 * mediums. All other soul tokens (colors, shapes, depth, components, motion,
 * fonts) are inherited from the :root block and remain unchanged.
 */
function buildPrintScopeBlock(): string {
  const overrides = buildPrintTypographyOverrides();
  const declarations = overrides.map((e) => `  ${e.name}: ${e.value};`).join('\n');
  return `[data-pengui-medium="print"] {\n${declarations}\n}`;
}

// ── Category color tokens ────────────────────────────────────────

/**
 * Derive four diagram category color tokens from the soul's accent hue family.
 *
 * Strategy: rotate the hue of the accent primary by 0°, 90°, 180°, 270° to
 * produce four visually distinct pastel families. Since we only have the hex
 * string (not HSL), we use a deterministic lightening algorithm:
 *
 * - Parse R/G/B from the accent hex.
 * - Mix each component toward 255 at 85% lightness for the base category.
 * - Mix each component toward 255 at 92% lightness for the leaf tint.
 * - Rotate the hue 90°/180°/270° by rotating the dominant channel.
 *
 * This keeps the function simple, dependency-free, and fast (< 1ms).
 * The four categories will never be identical; the exact palette is a
 * reasonable pastel approximation of the soul's accent family.
 */
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Mix a channel value toward 255 (white). factor 0 = original, 1 = white. */
function lighten(channel: number, factor: number): number {
  return channel + (255 - channel) * factor;
}

/**
 * Rotate an [R,G,B] triplet's "hue" by shifting channel order.
 * steps = 1 → [G,B,R], steps = 2 → [B,R,G], steps = 3 → original.
 */
function rotateChannels(rgb: [number, number, number], steps: number): [number, number, number] {
  const s = steps % 3;
  if (s === 0) return rgb;
  if (s === 1) return [rgb[1], rgb[2], rgb[0]];
  return [rgb[2], rgb[0], rgb[1]];
}

export function buildCategoryColorTokens(accentHex: string): TokenEntry[] {
  // Parse accent hex; fall back to a neutral if the value is not parseable.
  let base: [number, number, number];
  try {
    base = hexToRgb(accentHex);
  } catch {
    base = [120, 140, 160];
  }

  const LIGHTNESS_BASE = 0.72;  // category node base — clearly pastel but visible
  const LIGHTNESS_TINT = 0.85;  // leaf node tint — paler, subordinate

  const categories = ['a', 'b', 'c', 'd'] as const;

  const entries: TokenEntry[] = [];
  categories.forEach((label, i) => {
    const rotated = rotateChannels(base, i);
    const [r, g, b] = rotated;
    const baseHex = rgbToHex(lighten(r, LIGHTNESS_BASE), lighten(g, LIGHTNESS_BASE), lighten(b, LIGHTNESS_BASE));
    const tintHex = rgbToHex(lighten(r, LIGHTNESS_TINT), lighten(g, LIGHTNESS_TINT), lighten(b, LIGHTNESS_TINT));
    entries.push({ name: `--color-category-${label}`, value: baseHex });
    entries.push({ name: `--color-category-${label}-tint`, value: tintHex });
  });

  return entries;
}

// ── Main Export ──────────────────────────────────────────────────

/**
 * Generate CSS custom properties from a DesignSoul's layers.
 *
 * Returns a CSS string containing two blocks:
 * 1. A `:root {}` block with the full soul token set (slide-scale typography).
 * 2. A `[data-pengui-medium="print"] {}` block that overrides typography and
 *    `--space-safe-area` for A4/Letter print canvases (per SPEC §5.1).
 *
 * Print recipe templates set `<html data-pengui-medium="print">` so the print
 * scope activates automatically. Slide templates use plain `<html>` and are
 * unaffected — zero template changes required.
 */
export function generateTokens(layers: SoulLayers): TokenGeneratorResult {
  const allEntries: TokenEntry[] = [
    ...mapColorTokens(layers.color),
    // Diagram category colors derived from accent primary (for tree/mind-map templates)
    ...buildCategoryColorTokens(layers.color.accentPrimary),
    ...mapTypographyTokens(layers.typography),
    ...mapSpacingTokens(layers.spacing),
    ...mapShapeTokens(layers.shape),
    ...mapDepthTokens(layers.depth),
    ...mapComponentTokens(layers.components),
    ...mapMotionTokens(layers.motion),
  ];

  const tokenNames = allEntries.map((e) => e.name);

  const declarations = allEntries.map((e) => `  ${e.name}: ${e.value};`).join('\n');

  const rootBlock = `:root {\n${declarations}\n}`;
  const printBlock = buildPrintScopeBlock();
  const cssString = `${rootBlock}\n\n${printBlock}`;

  const allowedFonts = extractFontFamilies(layers.typography);

  return { cssString, tokenNames, allowedFonts };
}
