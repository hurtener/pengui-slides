import { describe, it, expect } from 'vitest';
import {
  generateSoulId,
  generateDeckId,
  generateSlideId,
  generateRevisionId,
  generateTemplateId,
} from '../../../src/infrastructure/id-generator.js';

/** UUID v4 regex pattern */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('id-generator', () => {
  describe('generateSoulId', () => {
    it('produces a valid UUID v4', () => {
      const id = generateSoulId();
      expect(id).toMatch(UUID_V4_REGEX);
    });

    it('produces unique IDs on successive calls', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSoulId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('generateDeckId', () => {
    it('produces a valid UUID v4', () => {
      const id = generateDeckId();
      expect(id).toMatch(UUID_V4_REGEX);
    });

    it('produces unique IDs on successive calls', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateDeckId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('generateSlideId', () => {
    it('produces a valid UUID v4', () => {
      const id = generateSlideId();
      expect(id).toMatch(UUID_V4_REGEX);
    });

    it('produces unique IDs on successive calls', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSlideId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('generateRevisionId', () => {
    it('produces a valid UUID v4', () => {
      const id = generateRevisionId();
      expect(id).toMatch(UUID_V4_REGEX);
    });

    it('produces unique IDs on successive calls', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        ids.add(generateRevisionId());
      }
      expect(ids.size).toBe(50);
    });
  });

  describe('generateTemplateId', () => {
    it('produces a valid UUID v4', () => {
      const id = generateTemplateId();
      expect(id).toMatch(UUID_V4_REGEX);
    });

    it('produces unique IDs on successive calls', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        ids.add(generateTemplateId());
      }
      expect(ids.size).toBe(50);
    });
  });

  describe('cross-generator uniqueness', () => {
    it('different generators produce different IDs', () => {
      const soulIds = Array.from({ length: 20 }, () => generateSoulId() as string);
      const deckIds = Array.from({ length: 20 }, () => generateDeckId() as string);
      const slideIds = Array.from({ length: 20 }, () => generateSlideId() as string);

      const all = new Set([...soulIds, ...deckIds, ...slideIds]);
      expect(all.size).toBe(60);
    });
  });
});
