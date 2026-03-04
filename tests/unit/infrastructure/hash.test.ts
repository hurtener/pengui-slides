import { describe, it, expect } from 'vitest';
import { sha256, hashSlideContents } from '../../../src/infrastructure/hash.js';

describe('sha256', () => {
  it('produces the same hash for the same input', () => {
    const hash1 = sha256('hello world');
    const hash2 = sha256('hello world');
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different inputs', () => {
    const hash1 = sha256('hello');
    const hash2 = sha256('world');
    expect(hash1).not.toBe(hash2);
  });

  it('returns a hex string', () => {
    const hash = sha256('test input');
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('returns a 64-character hex string (SHA-256)', () => {
    const hash = sha256('anything');
    expect(hash).toHaveLength(64);
  });

  it('handles empty string', () => {
    const hash = sha256('');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('handles unicode content', () => {
    const hash = sha256('hello \u{1F600} world');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});

describe('hashSlideContents', () => {
  it('produces consistent hash for same slide array', () => {
    const htmls = ['<div>slide 1</div>', '<div>slide 2</div>'];
    const hash1 = hashSlideContents(htmls);
    const hash2 = hashSlideContents(htmls);
    expect(hash1).toBe(hash2);
  });

  it('produces different hash when slide content changes', () => {
    const hash1 = hashSlideContents(['<div>A</div>', '<div>B</div>']);
    const hash2 = hashSlideContents(['<div>A</div>', '<div>C</div>']);
    expect(hash1).not.toBe(hash2);
  });

  it('produces different hash when slide order changes', () => {
    const hash1 = hashSlideContents(['<div>A</div>', '<div>B</div>']);
    const hash2 = hashSlideContents(['<div>B</div>', '<div>A</div>']);
    expect(hash1).not.toBe(hash2);
  });

  it('produces different hash for different number of slides', () => {
    const hash1 = hashSlideContents(['<div>A</div>']);
    const hash2 = hashSlideContents(['<div>A</div>', '<div>B</div>']);
    expect(hash1).not.toBe(hash2);
  });

  it('returns a 64-character hex string', () => {
    const hash = hashSlideContents(['<div>test</div>']);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('handles empty array', () => {
    const hash = hashSlideContents([]);
    expect(hash).toHaveLength(64);
  });
});
