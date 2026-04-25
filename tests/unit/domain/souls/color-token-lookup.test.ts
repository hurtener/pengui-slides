import { describe, it, expect } from 'vitest';
import {
  buildColorTokenLookup,
  normalizeHex,
} from '../../../../src/domain/souls/color-token-lookup.js';
import { sampleLayers } from '../../../helpers/fixtures.js';

describe('normalizeHex', () => {
  it('expands 3-digit hex to lowercase 6-digit', () => {
    expect(normalizeHex('#FCC')).toBe('#ffcccc');
    expect(normalizeHex('#fcc')).toBe('#ffcccc');
  });

  it('lowercases 6-digit hex', () => {
    expect(normalizeHex('#CCE0F0')).toBe('#cce0f0');
  });

  it('accepts 8-digit hex (with alpha)', () => {
    expect(normalizeHex('#cce0f080')).toBe('#cce0f080');
  });

  it('returns null for non-hex inputs', () => {
    expect(normalizeHex('rgb(204, 224, 240)')).toBeNull();
    expect(normalizeHex('red')).toBeNull();
    expect(normalizeHex('#GGG')).toBeNull();
    expect(normalizeHex('  ')).toBeNull();
  });
});

describe('buildColorTokenLookup', () => {
  it('maps hex values from the soul color layer to camel→kebab token names', () => {
    const lookup = buildColorTokenLookup({
      color: { canvas: '#FFFFFF', textPrimary: '#212529', accentPrimary: '#228be6' },
    } as Pick<typeof sampleLayers, 'color'>);
    expect(lookup.get('#ffffff')).toBe('--color-canvas');
    expect(lookup.get('#212529')).toBe('--color-text-primary');
    expect(lookup.get('#228be6')).toBe('--color-accent-primary');
  });

  it('skips non-hex declarations rather than throwing', () => {
    const lookup = buildColorTokenLookup({
      color: { canvas: '#fff', accentPrimary: 'rgb(34, 139, 230)' },
    } as Pick<typeof sampleLayers, 'color'>);
    expect(lookup.get('#ffffff')).toBe('--color-canvas');
    expect(Array.from(lookup.values())).not.toContain('--color-accent-primary');
  });

  it('keeps the first token on hex collisions (deterministic across runs)', () => {
    const lookup = buildColorTokenLookup({
      color: { accentPrimary: '#228be6', info: '#228be6' },
    } as Pick<typeof sampleLayers, 'color'>);
    expect(lookup.get('#228be6')).toBe('--color-accent-primary');
  });
});
