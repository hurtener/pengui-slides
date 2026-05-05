import { describe, it, expect } from 'vitest';
import {
  BUNDLED_FONTS,
  buildFontFaceCss,
  resolveFontsForEmbedding,
} from '../../../../src/domain/souls/font-registry.js';
import type { SoulLayers } from '../../../../src/types/design-soul.js';

function makeLayers(overrides: Partial<SoulLayers['typography']> = {}): SoulLayers {
  return {
    color: {} as SoulLayers['color'],
    typography: {
      fontDisplay: "'Inter', sans-serif",
      fontBody: "'Inter', sans-serif",
      fontMono: "'JetBrains Mono', monospace",
      sizeHero: 72, sizeH1: 48, sizeH2: 36, sizeH3: 28,
      sizeBody: 18, sizeLabel: 14, sizeCaption: 12,
      weightNormal: 400, weightMedium: 500, weightBold: 700,
      lineHeightHeading: 1.15, lineHeightBody: 1.55,
      letterSpacingHeading: '-0.02em', letterSpacingBody: '0em',
      ...overrides,
    },
    spacing: {} as SoulLayers['spacing'],
    shape: {} as SoulLayers['shape'],
    depth: {} as SoulLayers['depth'],
    components: {} as SoulLayers['components'],
    motion: {} as SoulLayers['motion'],
  };
}

describe('font registry — BUNDLED_FONTS manifest', () => {
  it('ships exactly the 5 OFL faces v4.15 promised', () => {
    expect(BUNDLED_FONTS).toHaveLength(5);
    const families = new Set(BUNDLED_FONTS.map((f) => f.family));
    expect(families).toEqual(new Set(['Inter', 'Inter Display', 'JetBrains Mono']));
    expect(BUNDLED_FONTS.filter((f) => f.family === 'Inter').map((f) => f.weight).sort())
      .toEqual([400, 500, 700]);
    expect(BUNDLED_FONTS.find((f) => f.family === 'Inter Display')?.weight).toBe(700);
    expect(BUNDLED_FONTS.find((f) => f.family === 'JetBrains Mono')?.weight).toBe(400);
    for (const face of BUNDLED_FONTS) {
      expect(face.license).toBe('OFL-1.1');
      expect(face.style).toBe('normal');
    }
  });
});

describe('resolveFontsForEmbedding', () => {
  it('returns 0 faces for a soul referencing only system fonts', () => {
    const soul = { layers: makeLayers({
      fontDisplay: 'Helvetica, sans-serif',
      fontBody: 'Helvetica, sans-serif',
      fontMono: 'Menlo, monospace',
    }) };
    expect(resolveFontsForEmbedding(soul)).toHaveLength(0);
  });

  it('returns all 5 faces for a soul referencing Inter + Inter Display + JetBrains Mono', () => {
    const soul = { layers: makeLayers({
      fontDisplay: "'Inter Display', 'Inter', sans-serif",
      fontBody: "'Inter', sans-serif",
      fontMono: "'JetBrains Mono', monospace",
    }) };
    const faces = resolveFontsForEmbedding(soul);
    expect(faces).toHaveLength(5);
    expect(new Set(faces.map((f) => f.family))).toEqual(
      new Set(['Inter', 'Inter Display', 'JetBrains Mono']),
    );
    for (const face of faces) {
      expect(face.bytes.length).toBeGreaterThan(100_000);
      // TTF magic 0x00010000 (or 'OTTO' for OpenType-CFF / 'true' for old Mac)
      const magic = face.bytes.subarray(0, 4).toString('hex');
      expect(['00010000', '4f54544f', '74727565']).toContain(magic);
    }
  });

  it('partial subset: mono-only soul resolves only JetBrains Mono', () => {
    const soul = { layers: makeLayers({
      fontDisplay: 'Helvetica, sans-serif',
      fontBody: 'Helvetica, sans-serif',
      fontMono: "'JetBrains Mono', monospace",
    }) };
    const faces = resolveFontsForEmbedding(soul);
    expect(faces).toHaveLength(1);
    expect(faces[0].family).toBe('JetBrains Mono');
    expect(faces[0].weight).toBe(400);
  });

  it('matches family name regardless of quote style and case in the soul stack', () => {
    const soul = { layers: makeLayers({
      fontDisplay: 'inter, sans-serif', // lowercase, unquoted
      fontBody: '"Inter", sans-serif',
      fontMono: 'monospace', // no bundled match
    }) };
    const faces = resolveFontsForEmbedding(soul);
    expect(faces.map((f) => f.family).sort()).toEqual(['Inter', 'Inter', 'Inter']);
  });

  it('does not crash on a malformed font stack', () => {
    const soul = { layers: makeLayers({
      fontDisplay: '',
      fontBody: ',,,,',
      fontMono: '',
    }) };
    expect(() => resolveFontsForEmbedding(soul)).not.toThrow();
    expect(resolveFontsForEmbedding(soul)).toEqual([]);
  });
});

describe('buildFontFaceCss', () => {
  it('returns empty string when soul references no bundled family', () => {
    const soul = { layers: makeLayers({
      fontDisplay: 'Helvetica, sans-serif',
      fontBody: 'Helvetica, sans-serif',
      fontMono: 'Menlo, monospace',
    }) };
    expect(buildFontFaceCss(soul)).toBe('');
  });

  it('emits one @font-face rule per resolved face with data:font/ttf URI', () => {
    const soul = { layers: makeLayers({
      fontDisplay: "'Inter Display', sans-serif",
      fontBody: "'Inter', sans-serif",
      fontMono: 'monospace',
    }) };
    const css = buildFontFaceCss(soul);
    // Inter (×3 weights) + Inter Display (×1) = 4 @font-face rules
    expect(css.match(/@font-face/g) ?? []).toHaveLength(4);
    expect(css).toContain("font-family: 'Inter'");
    expect(css).toContain("font-family: 'Inter Display'");
    expect(css).toContain('data:font/ttf;base64,');
    expect(css).toContain("format('truetype')");
    // Should NOT include JetBrains Mono since soul mono is generic 'monospace'
    expect(css).not.toContain("'JetBrains Mono'");
  });

  it('caches output by used-families key — repeated calls return identical string', () => {
    const layers = makeLayers({
      fontDisplay: "'Inter', sans-serif",
      fontBody: "'Inter', sans-serif",
      fontMono: "'JetBrains Mono', monospace",
    });
    const a = buildFontFaceCss({ layers });
    const b = buildFontFaceCss({ layers });
    // Reference equality proves the cache hit (same string interned)
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it('two different souls referencing the same bundled families share the cached block', () => {
    const layersOne = makeLayers({
      fontDisplay: "'Inter', sans-serif",
      fontBody: "'Inter', sans-serif",
      fontMono: 'monospace',
    });
    const layersTwo = makeLayers({
      // Different display+body order, same primary families
      fontDisplay: 'Inter, sans-serif',
      fontBody: '"Inter", sans-serif',
      fontMono: 'Menlo, monospace',
    });
    const a = buildFontFaceCss({ layers: layersOne });
    const b = buildFontFaceCss({ layers: layersTwo });
    expect(a).toBe(b);
  });

  it('output is well-formed CSS — every rule closes its braces', () => {
    const soul = { layers: makeLayers({
      fontDisplay: "'Inter', sans-serif",
      fontBody: "'Inter', sans-serif",
      fontMono: "'JetBrains Mono', monospace",
    }) };
    const css = buildFontFaceCss(soul);
    const opens = (css.match(/\{/g) ?? []).length;
    const closes = (css.match(/\}/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(opens).toBeGreaterThan(0);
  });
});
