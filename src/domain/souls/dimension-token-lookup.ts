/**
 * Reverse lookups for dimension-valued soul tokens (spacing + radius).
 *
 * Mirrors `color-token-lookup` but for the spacing and shape layers. The
 * substituter uses these so a literal like `padding: 16px` is rewritten to
 * `padding: var(--space-md)` when the soul declares `--space-md: 16px`.
 *
 * Why two layers in one file: both build a `Map<value-string, token-name>`
 * keyed by the exact string the agent is most likely to emit. Spacing
 * values are stored as `number` in the soul (e.g. `md: 16`) and the token
 * generator emits them with a `px` suffix; we mirror that here so the key
 * matches what the agent writes. Shape values are stored as strings
 * already (`"8px"`, `"50%"`, `"0"`) and pass through verbatim.
 *
 * Zero-form aliasing: agents write radius `0` and `0px` interchangeably.
 * If the soul declares one form, both are registered as keys so either
 * input substitutes correctly.
 */

import type { SoulLayers } from '../../types/design-soul.js';

const SPACING_TOKEN_NAMES: Record<keyof SoulLayers['spacing'], string> = {
  baseUnit: '--space-base',
  xs: '--space-xs',
  sm: '--space-sm',
  md: '--space-md',
  lg: '--space-lg',
  xl: '--space-xl',
  xxl: '--space-xxl',
  xxxl: '--space-xxxl',
  safeAreaInset: '--space-safe-area',
};

const RADIUS_TOKEN_NAMES: Record<keyof SoulLayers['shape'], string> = {
  none: '--radius-none',
  sm: '--radius-sm',
  md: '--radius-md',
  lg: '--radius-lg',
  xl: '--radius-xl',
  full: '--radius-full',
  buttonRadius: '--radius-button',
  cardRadius: '--radius-card',
  inputRadius: '--radius-input',
  badgeRadius: '--radius-badge',
};

export function buildSpacingTokenLookup(
  layers: Pick<SoulLayers, 'spacing'>,
): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [key, value] of Object.entries(layers.spacing) as [
    keyof SoulLayers['spacing'],
    number,
  ][]) {
    const tokenName = SPACING_TOKEN_NAMES[key];
    if (!tokenName) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    const px = `${value}px`;
    if (!lookup.has(px)) lookup.set(px, tokenName);
    if (value === 0 && !lookup.has('0')) lookup.set('0', tokenName);
  }
  return lookup;
}

export function buildRadiusTokenLookup(
  layers: Pick<SoulLayers, 'shape'>,
): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [key, value] of Object.entries(layers.shape) as [
    keyof SoulLayers['shape'],
    string,
  ][]) {
    const tokenName = RADIUS_TOKEN_NAMES[key];
    if (!tokenName) continue;
    if (typeof value !== 'string' || value.length === 0) continue;
    if (!lookup.has(value)) lookup.set(value, tokenName);
    if (value === '0' && !lookup.has('0px')) lookup.set('0px', tokenName);
    if (value === '0px' && !lookup.has('0')) lookup.set('0', tokenName);
  }
  return lookup;
}
