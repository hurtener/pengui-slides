/**
 * Token Generator for Design Souls.
 *
 * Converts SoulLayers into CSS custom properties (:root block)
 * for use in skeleton templates and rendered slides.
 */

import type { SoulLayers } from '../../types/design-soul.js';

// ── Public Interface ────────────────────────────────────────────

export interface TokenGeneratorResult {
  /** Complete :root { ... } CSS block */
  cssString: string;
  /** Array of all generated CSS custom property names */
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

// ── Main Export ──────────────────────────────────────────────────

/**
 * Generate CSS custom properties from a DesignSoul's layers.
 *
 * Returns a complete :root {} block, the list of token names,
 * and the allowed font families extracted from the typography layer.
 */
export function generateTokens(layers: SoulLayers): TokenGeneratorResult {
  const allEntries: TokenEntry[] = [
    ...mapColorTokens(layers.color),
    ...mapTypographyTokens(layers.typography),
    ...mapSpacingTokens(layers.spacing),
    ...mapShapeTokens(layers.shape),
    ...mapDepthTokens(layers.depth),
    ...mapComponentTokens(layers.components),
    ...mapMotionTokens(layers.motion),
  ];

  const tokenNames = allEntries.map((e) => e.name);

  const declarations = allEntries.map((e) => `  ${e.name}: ${e.value};`).join('\n');

  const cssString = `:root {\n${declarations}\n}`;

  const allowedFonts = extractFontFamilies(layers.typography);

  return { cssString, tokenNames, allowedFonts };
}
