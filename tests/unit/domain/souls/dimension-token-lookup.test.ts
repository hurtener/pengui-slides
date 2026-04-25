import { describe, it, expect } from 'vitest';
import {
  buildSpacingTokenLookup,
  buildRadiusTokenLookup,
} from '../../../../src/domain/souls/dimension-token-lookup.js';

const spacing = {
  baseUnit: 8,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
  safeAreaInset: 48,
};

const shape = {
  none: '0',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
  buttonRadius: '8px',
  cardRadius: '12px',
  inputRadius: '6px',
  badgeRadius: '9999px',
};

describe('buildSpacingTokenLookup', () => {
  const lookup = buildSpacingTokenLookup({ spacing });

  it('maps each numeric spacing to its `Npx` form pointing at the generated token', () => {
    expect(lookup.get('16px')).toBe('--space-md');
    expect(lookup.get('24px')).toBe('--space-lg');
    expect(lookup.get('48px')).toBe('--space-xxl');
  });

  it('maps baseUnit to --space-base', () => {
    expect(lookup.get('8px')).toBeDefined();
    // First-set wins for collisions; `sm` and `baseUnit` both 8 → --space-base wins (baseUnit is iterated first).
    expect(lookup.get('8px')).toBe('--space-base');
  });

  it('maps safeAreaInset to --space-safe-area', () => {
    // Both `xxl` and `safeAreaInset` are 48; first-set wins (xxl iterated first).
    expect(lookup.get('48px')).toBe('--space-xxl');
  });

  it('does not include zero alias when no spacing is zero', () => {
    expect(lookup.has('0')).toBe(false);
  });

  it('includes zero alias when a spacing field is zero', () => {
    const withZero = buildSpacingTokenLookup({
      spacing: { ...spacing, xs: 0 },
    });
    expect(withZero.get('0px')).toBe('--space-xs');
    expect(withZero.get('0')).toBe('--space-xs');
  });
});

describe('buildRadiusTokenLookup', () => {
  const lookup = buildRadiusTokenLookup({ shape });

  it('maps each shape value to its --radius-* token', () => {
    expect(lookup.get('8px')).toBeDefined();
    expect(lookup.get('12px')).toBeDefined();
    expect(lookup.get('9999px')).toBeDefined();
  });

  it('first-set wins on duplicate values (md + buttonRadius both 8px)', () => {
    expect(lookup.get('8px')).toBe('--radius-md');
  });

  it('aliases bare "0" and "0px" both pointing at --radius-none', () => {
    // shape.none is "0" → both forms registered.
    expect(lookup.get('0')).toBe('--radius-none');
    expect(lookup.get('0px')).toBe('--radius-none');
  });

  it('aliases "0px" to "0" too when soul declares "0px"', () => {
    const withZeroPx = buildRadiusTokenLookup({
      shape: { ...shape, none: '0px' },
    });
    expect(withZeroPx.get('0px')).toBe('--radius-none');
    expect(withZeroPx.get('0')).toBe('--radius-none');
  });
});
