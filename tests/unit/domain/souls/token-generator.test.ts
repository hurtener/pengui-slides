import { describe, it, expect } from 'vitest';
import { generateTokens } from '../../../../src/domain/souls/token-generator.js';
import { sampleLayers } from '../../../helpers/fixtures.js';

describe('generateTokens', () => {
  it('returns a CSS string with :root selector', () => {
    const result = generateTokens(sampleLayers);
    expect(result.cssString).toContain(':root {');
    expect(result.cssString).toContain('}');
  });

  it('generates CSS custom properties for color tokens', () => {
    const result = generateTokens(sampleLayers);
    expect(result.cssString).toContain('--color-canvas: #ffffff');
    expect(result.cssString).toContain('--color-text-primary: #212529');
    expect(result.cssString).toContain('--color-accent-primary: #228be6');
  });

  it('generates CSS custom properties for typography tokens', () => {
    const result = generateTokens(sampleLayers);
    expect(result.cssString).toContain("--font-display: 'Inter', sans-serif");
    expect(result.cssString).toContain("--font-body: 'Inter', sans-serif");
    expect(result.cssString).toContain("--font-mono: 'JetBrains Mono', monospace");
    expect(result.cssString).toContain('--text-hero: 72px');
    expect(result.cssString).toContain('--text-h1: 48px');
    expect(result.cssString).toContain('--weight-normal: 400');
    expect(result.cssString).toContain('--weight-bold: 700');
    expect(result.cssString).toContain('--line-height-heading: 1.2');
    expect(result.cssString).toContain('--letter-spacing-heading: -0.02em');
  });

  it('generates CSS custom properties for spacing tokens', () => {
    const result = generateTokens(sampleLayers);
    expect(result.cssString).toContain('--space-base: 8px');
    expect(result.cssString).toContain('--space-xs: 4px');
    expect(result.cssString).toContain('--space-md: 16px');
    expect(result.cssString).toContain('--space-safe-area: 48px');
  });

  it('generates CSS custom properties for shape tokens', () => {
    const result = generateTokens(sampleLayers);
    expect(result.cssString).toContain('--radius-none: 0');
    expect(result.cssString).toContain('--radius-md: 8px');
    expect(result.cssString).toContain('--radius-card: 12px');
    expect(result.cssString).toContain('--radius-button: 8px');
  });

  it('generates CSS custom properties for depth tokens', () => {
    const result = generateTokens(sampleLayers);
    expect(result.cssString).toContain('--shadow-none: none');
    expect(result.cssString).toContain('--shadow-soft:');
    expect(result.cssString).toContain('--border-width: 1px');
    expect(result.cssString).toContain('--border-opacity: 0.1');
  });

  it('generates CSS custom properties for component tokens', () => {
    const result = generateTokens(sampleLayers);
    expect(result.cssString).toContain('--card-padding: 24px');
    expect(result.cssString).toContain('--button-padding-x: 20px');
    expect(result.cssString).toContain('--badge-padding-y: 2px');
  });

  it('generates CSS custom properties for motion tokens', () => {
    const result = generateTokens(sampleLayers);
    expect(result.cssString).toContain('--duration-fast: 100ms');
    expect(result.cssString).toContain('--duration-normal: 200ms');
    expect(result.cssString).toContain('--easing-default:');
  });

  it('returns all token names as an array', () => {
    const result = generateTokens(sampleLayers);
    expect(result.tokenNames).toBeInstanceOf(Array);
    expect(result.tokenNames.length).toBeGreaterThan(0);
    // Every token name should start with --
    expect(result.tokenNames.every((n) => n.startsWith('--'))).toBe(true);
  });

  it('token names match what appears in the CSS string', () => {
    const result = generateTokens(sampleLayers);
    for (const name of result.tokenNames) {
      expect(result.cssString).toContain(name);
    }
  });

  it('extracts allowed font families from typography layer', () => {
    const result = generateTokens(sampleLayers);
    expect(result.allowedFonts).toContain('Inter');
    expect(result.allowedFonts).toContain('JetBrains Mono');
  });

  it('deduplicates font families', () => {
    // fontDisplay and fontBody both use Inter
    const result = generateTokens(sampleLayers);
    const interCount = result.allowedFonts.filter((f) => f === 'Inter').length;
    expect(interCount).toBe(1);
  });

  it('strips quotes from font family names', () => {
    const result = generateTokens(sampleLayers);
    for (const font of result.allowedFonts) {
      expect(font).not.toContain("'");
      expect(font).not.toContain('"');
    }
  });
});
