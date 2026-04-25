/**
 * Reverse lookup: hex literal → soul token name.
 *
 * The token-compliance check uses this to upgrade a generic "use a token"
 * fix suggestion to a specific "use `var(--color-cat-d)` (the soul declares
 * this exact value)" suggestion. Built once per soul by the validation
 * service and threaded through ValidationContext.colorTokenLookup.
 *
 * Only hex colors are normalized for now — that's the form agents emit
 * almost universally. rgb()/hsl() declarations in souls are uncommon
 * and would require parsing/canonicalization across forms (e.g. rgb(255,0,0)
 * vs #ff0000) that adds complexity for marginal coverage. Extend later
 * if soul authoring conventions ever change.
 */

import type { SoulLayers } from '../../types/design-soul.js';

const HEX_3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/;
const HEX_6 = /^#([0-9a-f]{6})$/;
const HEX_8 = /^#([0-9a-f]{8})$/;

/**
 * Canonicalize a hex color literal so equivalent forms compare equal.
 * Returns null for non-hex inputs (the caller treats this as "no lookup
 * possible" and falls back to the generic fix suggestion).
 */
export function normalizeHex(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  const m3 = HEX_3.exec(trimmed);
  if (m3) {
    return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`;
  }
  if (HEX_6.test(trimmed)) return trimmed;
  if (HEX_8.test(trimmed)) return trimmed;
  return null;
}

function camelToKebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Build a Map keyed by canonical hex value, valued by the CSS custom
 * property name. Values that don't normalize to hex (e.g. named colors,
 * rgb()) are skipped silently.
 */
export function buildColorTokenLookup(
  layers: Pick<SoulLayers, 'color'>,
): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const [key, value] of Object.entries(layers.color)) {
    const tokenName = `--color-${camelToKebab(key)}`;
    const normalized = normalizeHex(value);
    if (!normalized) continue;
    // First declaration wins on collisions — most souls don't have
    // duplicate hex values, but if they do (e.g. info === accentPrimary),
    // both are valid suggestions. Keeping the first keeps the message
    // deterministic across runs.
    if (!lookup.has(normalized)) {
      lookup.set(normalized, tokenName);
    }
  }
  return lookup;
}
