import { describe, it, expect } from 'vitest';
import {
  substituteSoulTokens,
  type SoulTokenLookups,
} from '../../../../src/domain/souls/token-substituter.js';

const colorLookup = new Map<string, string>([
  ['#cce0f0', '--color-cat-d'],
  ['#228be6', '--color-accent-primary'],
  ['#ffcccc', '--color-blush'],
]);

const spacingLookup = new Map<string, string>([
  ['4px', '--space-xs'],
  ['8px', '--space-sm'],
  ['16px', '--space-md'],
  ['24px', '--space-lg'],
  ['0', '--space-zero'],
]);

const radiusLookup = new Map<string, string>([
  ['0', '--radius-none'],
  ['0px', '--radius-none'],
  ['8px', '--radius-md'],
  ['12px', '--radius-lg'],
  ['9999px', '--radius-full'],
  ['50%', '--radius-circle'],
]);

const allLookups: SoulTokenLookups = {
  color: colorLookup,
  spacing: spacingLookup,
  radius: radiusLookup,
};

const colorOnly: SoulTokenLookups = {
  color: colorLookup,
  spacing: new Map(),
  radius: new Map(),
};

describe('substituteSoulTokens — color', () => {
  it('rewrites a hex literal in a <style> block to var(--token) tagged category=color', () => {
    const html = '<style>.x { background: #cce0f0; }</style><div class="x">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain('background: var(--color-cat-d)');
    expect(result.html).not.toContain('#cce0f0');
    expect(result.substitutions).toHaveLength(1);
    expect(result.substitutions[0]).toMatchObject({
      literal: '#cce0f0',
      token: '--color-cat-d',
      property: 'background',
      category: 'color',
      inline: false,
      selector: '.x',
    });
  });

  it('rewrites a hex literal in an inline style attribute', () => {
    const html = '<div style="color: #228be6">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain('color: var(--color-accent-primary)');
    expect(result.substitutions[0]).toMatchObject({
      literal: '#228be6',
      token: '--color-accent-primary',
      property: 'color',
      category: 'color',
      inline: true,
    });
  });

  it('expands 3-digit hex (#fcc → #ffcccc) so soul tokens declared in 6-digit form match', () => {
    const html = '<div style="background: #fcc">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain('background: var(--color-blush)');
    expect(result.substitutions[0]).toMatchObject({
      literal: '#fcc',
      token: '--color-blush',
    });
  });

  it('rewrites multiple literals in a composite value (box-shadow with two color stops)', () => {
    const html = '<style>.x { box-shadow: 0 0 4px #228be6, inset 0 1px #cce0f0; }</style><div class="x">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain('var(--color-accent-primary)');
    expect(result.html).toContain('var(--color-cat-d)');
    expect(result.substitutions.filter((s) => s.category === 'color')).toHaveLength(2);
  });

  it('passes through hex literals not declared by the soul (no false positives)', () => {
    const html = '<div style="background: #c0ffee">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain('#c0ffee');
    expect(result.substitutions).toHaveLength(0);
  });

  it('is idempotent: var(--token) values are unchanged', () => {
    const html = '<style>.x { color: var(--color-accent-primary); }</style>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toBe(html);
    expect(result.substitutions).toHaveLength(0);
  });

  it('is a no-op when all lookups are empty (fast path for missing soul)', () => {
    const html = '<div style="color: #228be6; padding: 16px">y</div>';
    const result = substituteSoulTokens(html, {
      color: new Map(),
      spacing: new Map(),
      radius: new Map(),
    });
    expect(result.html).toBe(html);
    expect(result.substitutions).toHaveLength(0);
  });

  it('rgb() / hsl() / named-color literals are not substituted (only hex is supported)', () => {
    const html = '<div style="color: rgb(34, 139, 230); background: red;">y</div>';
    const result = substituteSoulTokens(html, colorOnly);
    expect(result.html).toContain('rgb(34, 139, 230)');
    expect(result.html).toContain('red');
    expect(result.substitutions).toHaveLength(0);
  });
});

describe('substituteSoulTokens — spacing', () => {
  it('rewrites a single padding px to var(--space-*)', () => {
    const html = '<div style="padding: 16px">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain('padding: var(--space-md)');
    expect(result.substitutions[0]).toMatchObject({
      literal: '16px',
      token: '--space-md',
      property: 'padding',
      category: 'spacing',
      inline: true,
    });
  });

  it('rewrites multi-axis padding shorthand independently', () => {
    const html = '<div style="padding: 16px 24px">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain('padding: var(--space-md) var(--space-lg)');
    const literals = result.substitutions.map((s) => s.literal).sort();
    expect(literals).toEqual(['16px', '24px']);
    expect(result.substitutions.every((s) => s.category === 'spacing')).toBe(true);
  });

  it('rewrites margin-* sub-properties', () => {
    const html = '<style>.x { margin-top: 8px; margin-left: 24px; }</style><div class="x">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain('margin-top: var(--space-sm)');
    expect(result.html).toContain('margin-left: var(--space-lg)');
    expect(result.substitutions.filter((s) => s.category === 'spacing')).toHaveLength(2);
  });

  it('rewrites gap and column-gap', () => {
    const html = '<style>.x { gap: 8px; column-gap: 24px; }</style><div class="x">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain('gap: var(--space-sm)');
    expect(result.html).toContain('column-gap: var(--space-lg)');
  });

  it('substitutes 0 alias on margin: 0 16px', () => {
    const html = '<div style="margin: 0 16px">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain('margin: var(--space-zero) var(--space-md)');
  });

  it('does NOT substitute spacing values inside calc() / var() / min() / max()', () => {
    const html = '<div style="padding: calc(16px + 4px); margin-left: var(--space-md)">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain('calc(16px + 4px)');
    expect(result.html).toContain('var(--space-md)');
    expect(result.substitutions).toHaveLength(0);
  });

  it('passes through unknown px values (no false positive on padding: 17px)', () => {
    const html = '<div style="padding: 17px">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain('padding: 17px');
    expect(result.substitutions).toHaveLength(0);
  });

  it('does not substitute on non-spacing properties (width: 16px stays literal)', () => {
    const html = '<div style="width: 16px">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain('width: 16px');
    expect(result.substitutions).toHaveLength(0);
  });
});

describe('substituteSoulTokens — radius', () => {
  it('rewrites border-radius single value to var(--radius-*)', () => {
    const html = '<div style="border-radius: 8px">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain('border-radius: var(--radius-md)');
    expect(result.substitutions[0]).toMatchObject({
      literal: '8px',
      token: '--radius-md',
      property: 'border-radius',
      category: 'radius',
    });
  });

  it('rewrites border-radius four-corner shorthand independently', () => {
    const html = '<div style="border-radius: 8px 12px 8px 12px">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain(
      'border-radius: var(--radius-md) var(--radius-lg) var(--radius-md) var(--radius-lg)',
    );
    expect(result.substitutions.filter((s) => s.category === 'radius')).toHaveLength(4);
  });

  it('aliases bare 0 to --radius-none even when soul declared "0"', () => {
    const html = '<div style="border-radius: 0">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain('border-radius: var(--radius-none)');
  });

  it('aliases 0px to --radius-none when soul declared "0"', () => {
    const html = '<div style="border-radius: 0px">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain('border-radius: var(--radius-none)');
  });

  it('substitutes percent-valued radius (50% → --radius-circle) when soul declares it', () => {
    const html = '<div style="border-radius: 50%">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain('border-radius: var(--radius-circle)');
  });

  it('substitutes per-corner radius properties', () => {
    const html =
      '<style>.x { border-top-left-radius: 8px; border-bottom-right-radius: 12px; }</style><div class="x">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain('border-top-left-radius: var(--radius-md)');
    expect(result.html).toContain('border-bottom-right-radius: var(--radius-lg)');
  });

  it('passes through radius values not declared by the soul', () => {
    const html = '<div style="border-radius: 5px">y</div>';
    const result = substituteSoulTokens(html, allLookups);
    expect(result.html).toContain('border-radius: 5px');
    expect(result.substitutions).toHaveLength(0);
  });
});

describe('substituteSoulTokens — mixed categories', () => {
  it('handles color + spacing + radius in one pass, accumulating substitutions with categories', () => {
    const html =
      '<style>.x { color: #228be6; padding: 16px; border-radius: 8px; }</style>' +
      '<div class="x" style="background: #cce0f0; margin-top: 24px">y</div>';
    const result = substituteSoulTokens(html, allLookups);

    const byCategory = result.substitutions.reduce<Record<string, number>>((acc, s) => {
      acc[s.category] = (acc[s.category] ?? 0) + 1;
      return acc;
    }, {});
    expect(byCategory.color).toBe(2);
    expect(byCategory.spacing).toBe(2);
    expect(byCategory.radius).toBe(1);
  });
});
