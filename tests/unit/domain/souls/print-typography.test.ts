import { describe, it, expect } from 'vitest';
import { generateTokens } from '../../../../src/domain/souls/token-generator.js';
import { sampleLayers } from '../../../helpers/fixtures.js';

describe('generateTokens — print-mode typography', () => {
  it('cssString contains both :root and print-scope blocks', () => {
    const result = generateTokens(sampleLayers);
    expect(result.cssString).toContain(':root {');
    expect(result.cssString).toContain('[data-pengui-medium="print"]');
  });

  it('print-scope block overrides --text-display to 56px', () => {
    const result = generateTokens(sampleLayers);
    const printBlock = extractPrintBlock(result.cssString);
    expect(printBlock).toContain('--text-display: 56px');
  });

  it('print-scope block overrides --text-h1 to 36px (per SPEC §5.1)', () => {
    const result = generateTokens(sampleLayers);
    const printBlock = extractPrintBlock(result.cssString);
    expect(printBlock).toContain('--text-h1: 36px');
  });

  it('print-scope block overrides --text-h2 to 24px', () => {
    const result = generateTokens(sampleLayers);
    const printBlock = extractPrintBlock(result.cssString);
    expect(printBlock).toContain('--text-h2: 24px');
  });

  it('print-scope block overrides --text-h3 to 18px', () => {
    const result = generateTokens(sampleLayers);
    const printBlock = extractPrintBlock(result.cssString);
    expect(printBlock).toContain('--text-h3: 18px');
  });

  it('print-scope block overrides --text-body to 12px', () => {
    const result = generateTokens(sampleLayers);
    const printBlock = extractPrintBlock(result.cssString);
    expect(printBlock).toContain('--text-body: 12px');
  });

  it('print-scope block overrides --text-caption to 9px', () => {
    const result = generateTokens(sampleLayers);
    const printBlock = extractPrintBlock(result.cssString);
    expect(printBlock).toContain('--text-caption: 9px');
  });

  it('print-scope block overrides --leading-body to 1.55', () => {
    const result = generateTokens(sampleLayers);
    const printBlock = extractPrintBlock(result.cssString);
    expect(printBlock).toContain('--leading-body: 1.55');
  });

  it('print-scope block overrides --space-safe-area to 96px', () => {
    const result = generateTokens(sampleLayers);
    const printBlock = extractPrintBlock(result.cssString);
    expect(printBlock).toContain('--space-safe-area: 96px');
  });

  it(':root block retains the soul slide-scale typography (unchanged)', () => {
    const result = generateTokens(sampleLayers);
    const rootBlock = extractRootBlock(result.cssString);
    // sampleLayers has sizeBody=18, sizeH1=48 — these should be in :root
    expect(rootBlock).toContain('--text-body: 18px');
    expect(rootBlock).toContain('--text-h1: 48px');
    // The slide :root should NOT contain the print override values
    expect(rootBlock).not.toContain('--text-body: 12px');
  });

  it(':root block retains the slide safe-area (from soul spacing)', () => {
    const result = generateTokens(sampleLayers);
    const rootBlock = extractRootBlock(result.cssString);
    // sampleLayers has safeAreaInset=48 — slide default
    expect(rootBlock).toContain('--space-safe-area: 48px');
  });

  it('print-scope block does NOT contain color or font tokens (compact overrides only)', () => {
    const result = generateTokens(sampleLayers);
    const printBlock = extractPrintBlock(result.cssString);
    // Color tokens and font tokens are inherited from :root — not redeclared in print scope
    expect(printBlock).not.toContain('--color-canvas');
    expect(printBlock).not.toContain('--font-body');
    expect(printBlock).not.toContain('--radius-');
  });

  it('tokenNames array still covers only the :root tokens (not the print overrides)', () => {
    const result = generateTokens(sampleLayers);
    // tokenNames come from the :root block entries only — print overrides are extra
    expect(result.tokenNames).toContain('--text-body');
    expect(result.tokenNames).toContain('--space-safe-area');
    expect(result.tokenNames).toContain('--color-canvas');
    // All names start with --
    expect(result.tokenNames.every((n) => n.startsWith('--'))).toBe(true);
  });

  it('print-scope selector is scoped to data-pengui-medium attribute', () => {
    const result = generateTokens(sampleLayers);
    // The print block must use the attribute selector, not a class like .pengui-print
    expect(result.cssString).toContain('[data-pengui-medium="print"]');
    expect(result.cssString).not.toContain('.pengui-print');
  });
});

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Extract the [data-pengui-medium="print"] { ... } block from a CSS string.
 * Returns the content between the opening { and closing }.
 */
function extractPrintBlock(cssString: string): string {
  const start = cssString.indexOf('[data-pengui-medium="print"]');
  if (start === -1) return '';
  const braceOpen = cssString.indexOf('{', start);
  const braceClose = cssString.indexOf('}', braceOpen);
  return cssString.slice(braceOpen, braceClose + 1);
}

/**
 * Extract the :root { ... } block from a CSS string.
 * Returns the content between the opening { and closing } of the first :root block.
 */
function extractRootBlock(cssString: string): string {
  const start = cssString.indexOf(':root');
  if (start === -1) return '';
  const braceOpen = cssString.indexOf('{', start);
  const braceClose = cssString.indexOf('}', braceOpen);
  return cssString.slice(braceOpen, braceClose + 1);
}
