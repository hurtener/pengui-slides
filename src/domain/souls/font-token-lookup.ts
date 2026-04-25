/**
 * Reverse lookup for font-family tokens (Pengui v4.4).
 *
 * Soul declares typography tokens like
 *   `fontDisplay: "'Inter', sans-serif"`, `fontBody: "Inter, sans-serif"`,
 *   `fontMono: "'JetBrains Mono', monospace"`.
 *
 * Agents commonly emit `font-family: 'Inter', sans-serif`,
 * `font-family: "Inter", sans-serif`, `font-family: Inter, sans-serif`,
 * sometimes with extra whitespace. The lookup canonicalizes BOTH the soul
 * value and the agent value to a quote-stripped, lowercase, space-collapsed
 * comma-joined form so equivalent stacks compare equal.
 *
 * First-set wins on collisions: when fontDisplay and fontBody resolve to
 * the same canonical stack (very common — most souls use one face for
 * both), the first declared token (--font-display) wins. The agent's HTML
 * still renders identically; we just lose the semantic distinction. That's
 * acceptable for v4.4. If finer control is needed later, agents can
 * continue to emit the explicit `var(--font-body)` form (idempotent).
 *
 * Substitution is whole-value, not per-segment: the var() expansion
 * already includes the full stack, so replacing the entire
 * `font-family: ...` value with `var(--font-x)` is the right shape.
 */

import valueParser from 'postcss-value-parser';
import type { SoulLayers } from '../../types/design-soul.js';

const FONT_TOKEN_NAMES: Record<keyof Pick<SoulLayers['typography'], 'fontDisplay' | 'fontBody' | 'fontMono'>, string> = {
  fontDisplay: '--font-display',
  fontBody: '--font-body',
  fontMono: '--font-mono',
};

/**
 * Canonicalize a font stack into a comparison-friendly string.
 *
 * - Strips quotes from each family.
 * - Lowercases.
 * - Collapses internal whitespace.
 * - Joins families with a single comma.
 * - Drops empty families.
 *
 * Examples:
 *   `"'Inter', sans-serif"`        → `inter,sans-serif`
 *   `'"Inter",sans-serif'`         → `inter,sans-serif`
 *   `'Inter , sans-serif'`         → `inter,sans-serif`
 *   `'JetBrains Mono, monospace'`  → `jetbrains mono,monospace`
 */
export function canonicalizeFontStack(value: string): string {
  let parsed: ReturnType<typeof valueParser>;
  try {
    parsed = valueParser(value);
  } catch {
    return value.trim().toLowerCase();
  }

  const families: string[] = [];
  let current = '';

  const flush = () => {
    const cleaned = current.replace(/\s+/g, ' ').trim().toLowerCase();
    if (cleaned) families.push(cleaned);
    current = '';
  };

  for (const node of parsed.nodes) {
    if (node.type === 'div' && node.value === ',') {
      flush();
    } else if (node.type === 'word' || node.type === 'string') {
      current += (current && !current.endsWith(' ') ? ' ' : '') + node.value;
    } else if (node.type === 'space') {
      if (current && !current.endsWith(' ')) current += ' ';
    }
  }
  flush();

  return families.join(',');
}

export function buildFontTokenLookup(
  layers: Pick<SoulLayers, 'typography'>,
): Map<string, string> {
  const lookup = new Map<string, string>();
  const t = layers.typography;
  const order: Array<[keyof typeof FONT_TOKEN_NAMES, string]> = [
    ['fontDisplay', t.fontDisplay],
    ['fontBody', t.fontBody],
    ['fontMono', t.fontMono],
  ];
  for (const [key, value] of order) {
    if (typeof value !== 'string' || value.length === 0) continue;
    const canonical = canonicalizeFontStack(value);
    if (canonical.length === 0) continue;
    if (!lookup.has(canonical)) {
      lookup.set(canonical, FONT_TOKEN_NAMES[key]);
    }
  }
  return lookup;
}
