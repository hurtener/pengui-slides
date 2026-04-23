import { describe, it, expect } from 'vitest';
import { slugify, deriveSlug } from '../../../src/infrastructure/slug.js';

describe('slugify', () => {
  it('lowercases, kebab-cases, and strips punctuation', () => {
    expect(slugify('Brand Handbook 2026')).toBe('brand-handbook-2026');
    expect(slugify("Alice's Notes!!!")).toBe('alice-s-notes');
    expect(slugify('  extra   whitespace  ')).toBe('extra-whitespace');
  });

  it('strips diacritics', () => {
    expect(slugify('Café Été')).toBe('cafe-ete');
    expect(slugify('Niño')).toBe('nino');
  });

  it('collapses consecutive separators', () => {
    expect(slugify('foo---bar___baz')).toBe('foo-bar-baz');
  });

  it('falls back to "untitled" on empty input', () => {
    expect(slugify('')).toBe('untitled');
    expect(slugify('!!!')).toBe('untitled');
    expect(slugify('   ')).toBe('untitled');
  });

  it('caps length at 60 characters and trims trailing hyphen', () => {
    const long = 'a'.repeat(100);
    const s = slugify(long);
    expect(s.length).toBeLessThanOrEqual(60);
  });

  it('is deterministic', () => {
    expect(slugify('Same Input')).toBe(slugify('Same Input'));
  });
});

describe('deriveSlug', () => {
  it('returns the base when free', () => {
    expect(deriveSlug('Brand Handbook', new Set())).toBe('brand-handbook');
  });

  it('appends -2, -3, ... on collision', () => {
    const taken = new Set<string>(['brand-handbook']);
    expect(deriveSlug('Brand Handbook', taken)).toBe('brand-handbook-2');
    taken.add('brand-handbook-2');
    expect(deriveSlug('Brand Handbook', taken)).toBe('brand-handbook-3');
  });

  it('finds the first free suffix (non-sequential holes)', () => {
    const taken = new Set(['doc', 'doc-2', 'doc-4']);
    expect(deriveSlug('Doc', taken)).toBe('doc-3');
  });

  it('handles the fallback slug colliding', () => {
    const taken = new Set(['untitled']);
    expect(deriveSlug('', taken)).toBe('untitled-2');
  });
});
