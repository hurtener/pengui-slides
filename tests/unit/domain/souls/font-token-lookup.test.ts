import { describe, it, expect } from 'vitest';
import {
  buildFontTokenLookup,
  canonicalizeFontStack,
} from '../../../../src/domain/souls/font-token-lookup.js';

describe('canonicalizeFontStack', () => {
  it('strips quotes and lowercases', () => {
    expect(canonicalizeFontStack("'Inter', sans-serif")).toBe('inter,sans-serif');
    expect(canonicalizeFontStack('"Inter", sans-serif')).toBe('inter,sans-serif');
    expect(canonicalizeFontStack('Inter, sans-serif')).toBe('inter,sans-serif');
  });

  it('collapses whitespace around commas', () => {
    expect(canonicalizeFontStack('Inter , sans-serif')).toBe('inter,sans-serif');
    expect(canonicalizeFontStack("'Inter',sans-serif")).toBe('inter,sans-serif');
  });

  it('preserves multi-word family names with single internal space', () => {
    expect(canonicalizeFontStack("'JetBrains Mono', monospace")).toBe('jetbrains mono,monospace');
    expect(canonicalizeFontStack('"JetBrains  Mono", monospace')).toBe('jetbrains mono,monospace');
  });

  it('returns empty string for empty input', () => {
    expect(canonicalizeFontStack('')).toBe('');
    expect(canonicalizeFontStack('   ')).toBe('');
  });
});

describe('buildFontTokenLookup', () => {
  const typography = {
    fontDisplay: "'Inter', sans-serif",
    fontBody: "'Inter', sans-serif",
    fontMono: "'JetBrains Mono', monospace",
    sizeHero: 72, sizeH1: 48, sizeH2: 36, sizeH3: 28, sizeBody: 18, sizeLabel: 14, sizeCaption: 12,
    weightNormal: 400, weightMedium: 500, weightBold: 700,
    lineHeightHeading: 1.2, lineHeightBody: 1.6,
    letterSpacingHeading: '-0.02em', letterSpacingBody: '0em',
  };

  it('maps each font family to its --font-* token', () => {
    const lookup = buildFontTokenLookup({ typography });
    expect(lookup.get('inter,sans-serif')).toBeDefined();
    expect(lookup.get('jetbrains mono,monospace')).toBe('--font-mono');
  });

  it('first-set wins on collisions (display+body sharing Inter → display wins)', () => {
    const lookup = buildFontTokenLookup({ typography });
    expect(lookup.get('inter,sans-serif')).toBe('--font-display');
  });

  it('keeps display + body distinct when they differ', () => {
    const distinct = {
      ...typography,
      fontDisplay: "'Playfair Display', serif",
      fontBody: "'Inter', sans-serif",
    };
    const lookup = buildFontTokenLookup({ typography: distinct });
    expect(lookup.get('playfair display,serif')).toBe('--font-display');
    expect(lookup.get('inter,sans-serif')).toBe('--font-body');
    expect(lookup.get('jetbrains mono,monospace')).toBe('--font-mono');
  });

  it('skips empty values gracefully', () => {
    const empty = { ...typography, fontMono: '' };
    const lookup = buildFontTokenLookup({ typography: empty });
    expect(lookup.has('jetbrains mono,monospace')).toBe(false);
  });
});
