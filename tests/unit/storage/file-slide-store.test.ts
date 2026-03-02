import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FileSlideStore } from '../../../src/storage/file/slide-store.js';
import type { DeckId, SlideId } from '../../../src/types/common.js';
import type { Slide } from '../../../src/types/deck.js';
import type { SlideMetadata } from '../../../src/types/metadata.js';

function makeSlideId(id: string): SlideId {
  return id as SlideId;
}

function makeDeckId(id: string): DeckId {
  return id as DeckId;
}

function makeMetadata(overrides?: Partial<SlideMetadata>): SlideMetadata {
  return {
    title: 'Test Slide',
    type: 'content',
    narrative: 'A test slide',
    keyPoints: ['Point 1'],
    dataPoints: [],
    tags: ['test'],
    generatedAt: '2024-01-01T00:00:00Z',
    soulId: 'soul-1',
    deckId: 'deck-1',
    position: 0,
    metaVersion: '1.0',
    revisionHash: 'abc123',
    ...overrides,
  };
}

function makeSlide(id: string, deckId: string, position: number): Slide {
  return {
    id: makeSlideId(id),
    deckId: makeDeckId(deckId),
    position,
    html: `<div>Slide ${id}</div>`,
    metadata: makeMetadata({ position, deckId }),
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

describe('FileSlideStore', () => {
  let tmpDir: string;
  let store: FileSlideStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pengui-test-'));
    store = new FileSlideStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('save and get', () => {
    it('should save and retrieve a slide', async () => {
      const slide = makeSlide('slide-1', 'deck-1', 0);
      await store.save(slide);
      const retrieved = await store.get(makeSlideId('slide-1'));
      expect(retrieved).toEqual(slide);
    });

    it('should return undefined for a non-existent slide', async () => {
      const result = await store.get(makeSlideId('nonexistent'));
      expect(result).toBeUndefined();
    });

    it('should overwrite an existing slide on save', async () => {
      const slide = makeSlide('slide-1', 'deck-1', 0);
      await store.save(slide);

      const updated = { ...slide, html: '<div>Updated</div>' };
      await store.save(updated);

      const retrieved = await store.get(makeSlideId('slide-1'));
      expect(retrieved?.html).toBe('<div>Updated</div>');
    });

    it('should deep-clone data so mutations do not affect stored data', async () => {
      const slide = makeSlide('slide-1', 'deck-1', 0);
      await store.save(slide);

      slide.html = '<div>Mutated</div>';
      const retrieved = await store.get(makeSlideId('slide-1'));
      expect(retrieved?.html).toBe('<div>Slide slide-1</div>');
    });

    it('should persist data to a JSON file on disk', async () => {
      const slide = makeSlide('slide-1', 'deck-1', 0);
      await store.save(slide);

      const filePath = path.join(tmpDir, 'slides', 'slide-1.json');
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('getByDeck', () => {
    it('should return slides for a specific deck sorted by position', async () => {
      await store.save(makeSlide('s3', 'deck-1', 2));
      await store.save(makeSlide('s1', 'deck-1', 0));
      await store.save(makeSlide('s2', 'deck-1', 1));

      const slides = await store.getByDeck(makeDeckId('deck-1'));
      expect(slides).toHaveLength(3);
      expect(slides[0].position).toBe(0);
      expect(slides[1].position).toBe(1);
      expect(slides[2].position).toBe(2);
    });

    it('should only return slides for the requested deck', async () => {
      await store.save(makeSlide('s1', 'deck-1', 0));
      await store.save(makeSlide('s2', 'deck-2', 0));
      await store.save(makeSlide('s3', 'deck-1', 1));

      const slides = await store.getByDeck(makeDeckId('deck-1'));
      expect(slides).toHaveLength(2);
      expect(slides.every((s) => s.deckId === 'deck-1')).toBe(true);
    });

    it('should return empty array when no slides exist for the deck', async () => {
      const slides = await store.getByDeck(makeDeckId('nonexistent'));
      expect(slides).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should delete an existing slide and return true', async () => {
      await store.save(makeSlide('slide-1', 'deck-1', 0));
      const result = await store.delete(makeSlideId('slide-1'));
      expect(result).toBe(true);

      const retrieved = await store.get(makeSlideId('slide-1'));
      expect(retrieved).toBeUndefined();
    });

    it('should return false when deleting a non-existent slide', async () => {
      const result = await store.delete(makeSlideId('nonexistent'));
      expect(result).toBe(false);
    });
  });

  describe('deleteByDeck', () => {
    it('should delete all slides for a deck and return count', async () => {
      await store.save(makeSlide('s1', 'deck-1', 0));
      await store.save(makeSlide('s2', 'deck-1', 1));
      await store.save(makeSlide('s3', 'deck-2', 0));

      const count = await store.deleteByDeck(makeDeckId('deck-1'));
      expect(count).toBe(2);

      // Verify the deck-2 slide was not deleted
      const remaining = await store.get(makeSlideId('s3'));
      expect(remaining).toBeDefined();
    });

    it('should return 0 when no slides exist for the deck', async () => {
      const count = await store.deleteByDeck(makeDeckId('nonexistent'));
      expect(count).toBe(0);
    });
  });

  describe('data survives re-instantiation', () => {
    it('should read data saved by a previous store instance', async () => {
      const store1 = new FileSlideStore(tmpDir);
      await store1.save(makeSlide('slide-persist', 'deck-1', 0));

      const store2 = new FileSlideStore(tmpDir);
      const retrieved = await store2.get(makeSlideId('slide-persist'));
      expect(retrieved).toBeDefined();
      expect(retrieved?.html).toBe('<div>Slide slide-persist</div>');
    });
  });
});
