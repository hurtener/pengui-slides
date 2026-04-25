import { describe, it, expect } from 'vitest';
import { substituteColorLiterals } from '../../../../src/domain/souls/color-token-substituter.js';

const lookup = new Map<string, string>([
  ['#cce0f0', '--color-cat-d'],
  ['#228be6', '--color-accent-primary'],
  ['#ffcccc', '--color-blush'],
]);

describe('substituteColorLiterals', () => {
  it('rewrites a hex literal in a <style> block to var(--token)', () => {
    const html = '<style>.x { background: #cce0f0; }</style><div class="x">y</div>';
    const result = substituteColorLiterals(html, lookup);
    expect(result.html).toContain('background: var(--color-cat-d)');
    expect(result.html).not.toContain('#cce0f0');
    expect(result.substitutions).toHaveLength(1);
    expect(result.substitutions[0]).toMatchObject({
      literal: '#cce0f0',
      token: '--color-cat-d',
      property: 'background',
      inline: false,
      selector: '.x',
    });
  });

  it('rewrites a hex literal in an inline style attribute', () => {
    const html = '<div style="color: #228be6">y</div>';
    const result = substituteColorLiterals(html, lookup);
    expect(result.html).toContain('color: var(--color-accent-primary)');
    expect(result.substitutions[0]).toMatchObject({
      literal: '#228be6',
      token: '--color-accent-primary',
      property: 'color',
      inline: true,
    });
  });

  it('expands 3-digit hex (#fcc → #ffcccc) so soul tokens declared in 6-digit form match', () => {
    const html = '<div style="background: #fcc">y</div>';
    const result = substituteColorLiterals(html, lookup);
    expect(result.html).toContain('background: var(--color-blush)');
    expect(result.substitutions[0]).toMatchObject({
      literal: '#fcc',
      token: '--color-blush',
    });
  });

  it('rewrites multiple literals in a composite value (box-shadow with two color stops)', () => {
    const html = '<style>.x { box-shadow: 0 0 4px #228be6, inset 0 1px #cce0f0; }</style><div class="x">y</div>';
    const result = substituteColorLiterals(html, lookup);
    expect(result.html).toContain('var(--color-accent-primary)');
    expect(result.html).toContain('var(--color-cat-d)');
    expect(result.substitutions).toHaveLength(2);
  });

  it('leaves non-color properties alone even when they contain hex-like values', () => {
    // `width: 0px` etc. — no hex; just a control case.
    const html = '<style>.x { width: 100px; padding: 0; color: #228be6; }</style><div class="x">y</div>';
    const result = substituteColorLiterals(html, lookup);
    expect(result.html).toContain('width: 100px');
    expect(result.substitutions).toHaveLength(1);
    expect(result.substitutions[0].property).toBe('color');
  });

  it('passes through hex literals not declared by the soul (no false positives)', () => {
    const html = '<div style="background: #c0ffee">y</div>';
    const result = substituteColorLiterals(html, lookup);
    expect(result.html).toContain('#c0ffee');
    expect(result.substitutions).toHaveLength(0);
  });

  it('is idempotent: var(--token) values are unchanged', () => {
    const html = '<style>.x { color: var(--color-accent-primary); }</style>';
    const result = substituteColorLiterals(html, lookup);
    expect(result.html).toBe(html);
    expect(result.substitutions).toHaveLength(0);
  });

  it('is a no-op when the lookup is empty (fast path for missing soul)', () => {
    const html = '<div style="color: #228be6">y</div>';
    const result = substituteColorLiterals(html, new Map());
    expect(result.html).toBe(html);
    expect(result.substitutions).toHaveLength(0);
  });

  it('handles mixed style + inline together, accumulating substitutions', () => {
    const html =
      '<style>.x { color: #cce0f0; }</style>' +
      '<div class="x" style="background: #228be6"><p>y</p></div>';
    const result = substituteColorLiterals(html, lookup);
    expect(result.substitutions).toHaveLength(2);
    const tokens = result.substitutions.map((s) => s.token).sort();
    expect(tokens).toEqual(['--color-accent-primary', '--color-cat-d']);
  });

  it('rgb() / hsl() / named-color literals are not substituted (only hex is supported)', () => {
    const html = '<div style="color: rgb(34, 139, 230); background: red;">y</div>';
    const result = substituteColorLiterals(html, lookup);
    expect(result.html).toContain('rgb(34, 139, 230)');
    expect(result.html).toContain('red');
    expect(result.substitutions).toHaveLength(0);
  });
});
