/**
 * One-stop builder for the three soul-token reverse lookups used by the
 * unified `substituteSoulTokens` substituter. Tools and services call this
 * once per active soul instead of building each lookup individually.
 *
 * Returns empty maps when the layer is missing so callers can pass through
 * to the substituter unconditionally; the substituter is a fast no-op when
 * all three are empty.
 */

import type { SoulLayers } from '../../types/design-soul.js';
import { buildColorTokenLookup } from './color-token-lookup.js';
import { buildSpacingTokenLookup, buildRadiusTokenLookup } from './dimension-token-lookup.js';
import type { SoulTokenLookups } from './token-substituter.js';

export function buildSoulTokenLookups(
  layers: Pick<SoulLayers, 'color' | 'spacing' | 'shape'>,
): SoulTokenLookups {
  return {
    color: buildColorTokenLookup(layers),
    spacing: buildSpacingTokenLookup(layers),
    radius: buildRadiusTokenLookup(layers),
  };
}
