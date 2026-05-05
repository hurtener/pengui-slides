/**
 * Bundled font registry — Pengui v4.15.
 *
 * Ships a curated set of OFL-licensed TTFs from `assets/fonts/`. Two
 * consumers:
 *
 *   1. `buildFontFaceCss(soul)` — emits `@font-face` rules with `url(data:…)`
 *      sources so Playwright (the rendering pipeline for static PPTX, PDF,
 *      and image bundling) draws text in the bundled font without needing
 *      the font installed on the host. Self-contained: no network, no local
 *      file server.
 *
 *   2. `resolveFontsForEmbedding(soul)` — returns the raw TTF bytes plus
 *      family/weight metadata so the editable PPTX exporter can write
 *      `ppt/fonts/font<N>.fntdata` parts and add `<p:embeddedFontLst>` to
 *      `ppt/presentation.xml`. Lets PowerPoint render native text shapes
 *      with the same bundled font on machines that don't have it locally.
 *
 * Family matching is canonicalised through the soul's typography stack
 * (display + body + mono). Each soul opts in implicitly: if its
 * `fontDisplay` / `fontBody` / `fontMono` references a bundled family by
 * its primary name (case-insensitive, quote-insensitive), we wire it up.
 * Souls that pick a system font (e.g. `Helvetica, sans-serif`) get no
 * @font-face block and ride the OS font as before.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SoulLayers } from '../../types/design-soul.js';
import { canonicalizeFontStack } from './font-token-lookup.js';

export type FontWeight = 400 | 500 | 700;
export type FontStyle = 'normal' | 'italic';

export interface BundledFontFace {
  /** The CSS family name agents reference, e.g. `'Inter'`,
   *  `'Inter Display'`, `'JetBrains Mono'`. */
  family: string;
  weight: FontWeight;
  style: FontStyle;
  /** Filename inside `assets/fonts/`. */
  filename: string;
  license: string;
  source: string;
}

export const BUNDLED_FONTS: readonly BundledFontFace[] = [
  {
    family: 'Inter',
    weight: 400,
    style: 'normal',
    filename: 'Inter-Regular.ttf',
    license: 'OFL-1.1',
    source: 'https://github.com/rsms/inter',
  },
  {
    family: 'Inter',
    weight: 500,
    style: 'normal',
    filename: 'Inter-Medium.ttf',
    license: 'OFL-1.1',
    source: 'https://github.com/rsms/inter',
  },
  {
    family: 'Inter',
    weight: 700,
    style: 'normal',
    filename: 'Inter-Bold.ttf',
    license: 'OFL-1.1',
    source: 'https://github.com/rsms/inter',
  },
  {
    family: 'Inter Display',
    weight: 700,
    style: 'normal',
    filename: 'InterDisplay-Bold.ttf',
    license: 'OFL-1.1',
    source: 'https://github.com/rsms/inter',
  },
  {
    family: 'JetBrains Mono',
    weight: 400,
    style: 'normal',
    filename: 'JetBrainsMono-Regular.ttf',
    license: 'OFL-1.1',
    source: 'https://github.com/JetBrains/JetBrainsMono',
  },
];

/** Resolve `assets/fonts/` relative to this source file. Works whether the
 *  module runs from `src/` (tsx / vitest) or `build/` (compiled npm). */
function fontsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // src/domain/souls/font-registry.ts → ../../../assets/fonts
  // build/domain/souls/font-registry.js → ../../../assets/fonts
  return join(here, '..', '..', '..', 'assets', 'fonts');
}

const fontBytesCache = new Map<string, Buffer>();
/** Pre-rendered `@font-face` rule per face — keyed by filename. The rule
 *  string is large (~550 KB for an Inter weight after base64) and never
 *  changes for a given file, so caching it lets repeated `buildFontFaceCss`
 *  calls return in O(1). Without this, every slide compile in a deck
 *  re-encodes ~2.5 MB of base64. */
const fontFaceRuleCache = new Map<string, string>();

/** Read a bundled TTF from disk, cached. */
export function readBundledFont(face: BundledFontFace): Buffer {
  const cached = fontBytesCache.get(face.filename);
  if (cached) return cached;
  const buf = readFileSync(join(fontsDir(), face.filename));
  fontBytesCache.set(face.filename, buf);
  return buf;
}

function buildFontFaceRule(face: BundledFontFace): string {
  const cached = fontFaceRuleCache.get(face.filename);
  if (cached) return cached;
  const bytes = readBundledFont(face);
  const b64 = bytes.toString('base64');
  const rule = [
    '@font-face {',
    `  font-family: '${face.family}';`,
    `  font-weight: ${face.weight};`,
    `  font-style: ${face.style};`,
    '  font-display: block;',
    `  src: url(data:font/ttf;base64,${b64}) format('truetype');`,
    '}',
  ].join('\n');
  fontFaceRuleCache.set(face.filename, rule);
  return rule;
}

/** Lowercased, quote-stripped primary family from a CSS stack —
 *  `"'Inter Display', 'Inter', sans-serif"` → `"inter display"`. */
function primaryFamily(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  const canon = canonicalizeFontStack(stack);
  if (!canon) return undefined;
  const first = canon.split(',')[0]?.trim();
  return first || undefined;
}

/** Bundled families a soul references via its display / body / mono
 *  tokens. Canonicalised to the BundledFontFace.family form. Defensively
 *  tolerates partial soul stubs (test fixtures, legacy souls) that may
 *  not carry a typography layer at all — returns an empty set rather
 *  than crashing. */
function usedBundledFamilies(layers: Pick<SoulLayers, 'typography'>): Set<string> {
  const used = new Set<string>();
  const typo = layers?.typography;
  if (!typo) return used;
  const stacks = [
    typo.fontDisplay,
    typo.fontBody,
    typo.fontMono,
  ];
  const bundledByCanon = new Map<string, string>();
  for (const f of BUNDLED_FONTS) {
    bundledByCanon.set(f.family.toLowerCase(), f.family);
  }
  for (const stack of stacks) {
    const primary = primaryFamily(stack);
    if (!primary) continue;
    const match = bundledByCanon.get(primary);
    if (match) used.add(match);
  }
  return used;
}

/**
 * Build a CSS block of `@font-face` rules for every bundled face whose
 * family is referenced by the soul's typography layer. Returns an empty
 * string when no bundled family is referenced (caller can drop it).
 *
 * Each `src` is a `data:font/ttf;base64,…` URL — Playwright reads it
 * synchronously and the rendered PNG / PDF carries the bundled font.
 */
/** Cache of complete @font-face blocks keyed by the sorted set of used
 *  families. Avoids re-concatenating the same 2.5 MB string for every
 *  slide compile in a deck. */
const blockCache = new Map<string, string>();

export function buildFontFaceCss(
  soul: Pick<{ layers: SoulLayers }, 'layers'>,
): string {
  const used = usedBundledFamilies(soul.layers);
  if (used.size === 0) return '';
  const key = [...used].sort().join('|');
  const cached = blockCache.get(key);
  if (cached !== undefined) return cached;
  const rules: string[] = [];
  for (const face of BUNDLED_FONTS) {
    if (!used.has(face.family)) continue;
    rules.push(buildFontFaceRule(face));
  }
  const block = rules.join('\n\n');
  blockCache.set(key, block);
  return block;
}

/**
 * Bundled faces that should be embedded in the editable PPTX for this
 * soul. Same selection rule as `buildFontFaceCss` — driven by the soul's
 * typography stack — but returns the metadata + bytes for OOXML embedding
 * rather than CSS.
 */
export function resolveFontsForEmbedding(
  soul: Pick<{ layers: SoulLayers }, 'layers'>,
): Array<BundledFontFace & { bytes: Buffer }> {
  const used = usedBundledFamilies(soul.layers);
  const out: Array<BundledFontFace & { bytes: Buffer }> = [];
  for (const face of BUNDLED_FONTS) {
    if (!used.has(face.family)) continue;
    out.push({ ...face, bytes: readBundledFont(face) });
  }
  return out;
}
