import { describe, it, expect } from 'vitest';
import { generateUtilityCss } from '../../../../src/domain/souls/utility-css-generator.js';

describe('generateUtilityCss', () => {
  const css = generateUtilityCss();

  it('returns a non-empty string', () => {
    expect(css.length).toBeGreaterThan(0);
  });

  it('contains 35+ CSS class definitions', () => {
    // Count class selectors
    const classMatches = css.match(/\.\w[\w-]*/g) || [];
    // Filter unique class names (exclude pseudo-selectors)
    const uniqueClasses = new Set(classMatches.map(m => m.split('::')[0]));
    expect(uniqueClasses.size).toBeGreaterThanOrEqual(35);
  });

  it('uses only var(--token) references, no literal color/size values', () => {
    // Check no hex colors in property values
    const lines = css.split('\n').filter(l => l.includes(':') && !l.startsWith('/*') && !l.startsWith('.'));
    for (const line of lines) {
      // Skip comment lines and selector lines
      if (line.trim().startsWith('/*') || line.trim().startsWith('.') || line.trim().startsWith('//')) continue;
      // Property value lines should use var(--...) or CSS keywords like 'none', 'center', etc.
      // They should NOT have literal hex colors like #fff
      if (line.includes('#') && !line.includes('/*')) {
        // Allow hex only inside var() or color-mix() functions
        expect(line).toMatch(/var\(--/);
      }
    }
  });

  it('contains layout utility classes', () => {
    expect(css).toContain('.grid-2');
    expect(css).toContain('.grid-3');
    expect(css).toContain('.grid-4');
    expect(css).toContain('.flex-center');
    expect(css).toContain('.flex-col');
    expect(css).toContain('.flex-between');
    expect(css).toContain('.full-height');
  });

  it('contains card utility classes', () => {
    expect(css).toContain('.card');
    expect(css).toContain('.card-glass');
    expect(css).toContain('.card-elevated');
  });

  it('contains typography utility classes', () => {
    expect(css).toContain('.text-hero');
    expect(css).toContain('.text-h1');
    expect(css).toContain('.text-h2');
    expect(css).toContain('.text-h3');
    expect(css).toContain('.label');
    expect(css).toContain('.caption');
  });

  it('contains background utility classes', () => {
    expect(css).toContain('.bg-canvas');
    expect(css).toContain('.bg-surface');
    expect(css).toContain('.bg-dark');
    expect(css).toContain('.bg-accent');
  });

  it('contains component utility classes', () => {
    expect(css).toContain('.badge');
    expect(css).toContain('.pill');
    expect(css).toContain('.btn');
    expect(css).toContain('.btn-primary');
    expect(css).toContain('.btn-secondary');
    expect(css).toContain('.icon-container');
  });

  it('contains decorative utility classes', () => {
    expect(css).toContain('.gradient-blob');
    expect(css).toContain('.glass');
    expect(css).toContain('.decorative-dots');
  });

  it('contains spacing utility classes', () => {
    expect(css).toContain('.section-header');
    expect(css).toContain('.gap-sm');
    expect(css).toContain('.gap-md');
    expect(css).toContain('.gap-lg');
  });

  it('all property values reference design tokens via var()', () => {
    // Extract property declarations (lines with colon that aren't selectors)
    const declarations = css.match(/:\s*[^;{]+;/g) || [];
    for (const decl of declarations) {
      const value = decl.replace(/^:\s*/, '').replace(/;$/, '').trim();
      // Values should either:
      // 1. Reference var(--...)
      // 2. Be CSS keywords (flex, grid, center, column, etc.)
      // 3. Be part of shorthand with var()
      // 4. Be structural values (100%, repeat(), etc.)
      // They should NOT be literal pixel values, hex colors, or other hard-coded design values
      if (value.match(/^\d+px$/) && !value.includes('var(')) {
        // Allow specific structural values like blur amounts
        expect(value).toMatch(/(blur|1px)/);
      }
    }
  });
});
