/**
 * One-stop builder for the soul-token reverse lookups used by the unified
 * `substituteSoulTokens` substituter. Tools and services call this once per
 * active soul instead of building each lookup individually.
 *
 * Returns empty maps when a layer is missing so callers can pass through
 * to the substituter unconditionally; the substituter is a fast no-op when
 * every map is empty.
 */

import type { SoulLayers } from '../../types/design-soul.js';
import { buildColorTokenLookup } from './color-token-lookup.js';
import { buildSpacingTokenLookup, buildRadiusTokenLookup } from './dimension-token-lookup.js';
import { buildFontTokenLookup } from './font-token-lookup.js';
import type { SoulTokenLookups } from './token-substituter.js';

export function buildSoulTokenLookups(
  layers: Pick<SoulLayers, 'color' | 'spacing' | 'shape' | 'typography'>,
): SoulTokenLookups {
  return {
    color: buildColorTokenLookup(layers),
    spacing: buildSpacingTokenLookup(layers),
    radius: buildRadiusTokenLookup(layers),
    font: buildFontTokenLookup(layers),
  };
}
