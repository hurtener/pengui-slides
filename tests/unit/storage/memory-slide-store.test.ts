import { describe, it, expect, beforeEach } from 'vitest';
import { InMemorySlideStore } from '../../../src/storage/memory/slide-store.js';
import type { Slide } from '../../../src/types/deck.js';
import type { SlideId, DeckId } from '../../../src/types/common.js';
import type { SlideMetadata } from '../../../src/types/metadata.js';

function makeSlide(overrides: Partial<Slide> = {}): Slide {
  return {
    id: 'slide-1' as SlideId,
    deckId: 'deck-1' as DeckId,
    position: 0,
    html: '<div class="slide">content</div>',
    metadata: {
      title: 'Test Slide',
      type: 'content',
      narrative: 'Test narrative',
      keyPoints: [],
      dataPoints: [],
      tags: [],
      generatedAt: '2026-01-01T00:00:00.000Z',
      soulId: 'soul-1',
      deckId: 'deck-1',
      position: 0,
      metaVersion: '1.0',
      revisionHash: 'abc123',
    } as SlideMetadata,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('InMemorySlideStore', () => {
  let store: InMemorySlideStore;

  beforeEach(() => {
    store = new InMemorySlideStore();
  });

  describe('save and get', () => {
    it('saves and retrieves a slide by ID', async () => {
      const slide = makeSlide();
      await store.save(slide);

      const retrieved = await store.get('slide-1' as SlideId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('slide-1');
      expect(retrieved!.html).toBe('<div class="slide">content</div>');
    });

    it('returns undefined for non-existent ID', async () => {
      const result = await store.get('non-existent' as SlideId);
      expect(result).toBeUndefined();
    });

    it('overwrites existing slide on save with same ID', async () => {
      await store.save(makeSlide());
      await store.save(makeSlide({ html: '<div>updated</div>' }));

      const retrieved = await store.get('slide-1' as SlideId);
      expect(retrieved!.html).toBe('<div>updated</div>');
    });

    it('deep-clones on read to prevent mutation', async () => {
      await store.save(makeSlide());

      const retrieved1 = await store.get('slide-1' as SlideId);
      retrieved1!.html = 'MUTATED';

      const retrieved2 = await store.get('slide-1' as SlideId);
      expect(retrieved2!.html).toBe('<div class="slide">content</div>');
    });
  });

  describe('getByDeck', () => {
    it('returns slides for a specific deck', async () => {
      await store.save(makeSlide({ id: 'slide-1' as SlideId, deckId: 'deck-1' as DeckId }));
      await store.save(makeSlide({ id: 'slide-2' as SlideId, deckId: 'deck-1' as DeckId, position: 1 }));
      await store.save(makeSlide({ id: 'slide-3' as SlideId, deckId: 'deck-2' as DeckId }));

      const deck1Slides = await store.getByDeck('deck-1' as DeckId);
      expect(deck1Slides).toHaveLength(2);
      expect(deck1Slides.every((s) => s.deckId === 'deck-1')).toBe(true);
    });

    it('sorts by position ascending', async () => {
      await store.save(makeSlide({ id: 'slide-3' as SlideId, position: 2 }));
      await store.save(makeSlide({ id: 'slide-1' as SlideId, position: 0 }));
      await store.save(makeSlide({ id: 'slide-2' as SlideId, position: 1 }));

      const slides = await store.getByDeck('deck-1' as DeckId);
      expect(slides[0].id).toBe('slide-1');
      expect(slides[1].id).toBe('slide-2');
      expect(slides[2].id).toBe('slide-3');
    });

    it('returns empty array for deck with no slides', async () => {
      const slides = await store.getByDeck('non-existent' as DeckId);
      expect(slides).toEqual([]);
    });
  });

  describe('delete', () => {
    it('deletes an existing slide and returns true', async () => {
      await store.save(makeSlide());
      const result = await store.delete('slide-1' as SlideId);
      expect(result).toBe(true);

      const retrieved = await store.get('slide-1' as SlideId);
      expect(retrieved).toBeUndefined();
    });

    it('returns false for non-existent ID', async () => {
      const result = await store.delete('non-existent' as SlideId);
      expect(result).toBe(false);
    });
  });

  describe('deleteByDeck', () => {
    it('deletes all slides for a deck and returns count', async () => {
      await store.save(makeSlide({ id: 'slide-1' as SlideId, deckId: 'deck-1' as DeckId }));
      await store.save(makeSlide({ id: 'slide-2' as SlideId, deckId: 'deck-1' as DeckId }));
      await store.save(makeSlide({ id: 'slide-3' as SlideId, deckId: 'deck-2' as DeckId }));

      const count = await store.deleteByDeck('deck-1' as DeckId);
      expect(count).toBe(2);

      // Verify deck-1 slides are gone
      const deck1Slides = await store.getByDeck('deck-1' as DeckId);
      expect(deck1Slides).toHaveLength(0);

      // Verify deck-2 slides remain
      const deck2Slides = await store.getByDeck('deck-2' as DeckId);
      expect(deck2Slides).toHaveLength(1);
    });

    it('returns 0 for deck with no slides', async () => {
      const count = await store.deleteByDeck('non-existent' as DeckId);
      expect(count).toBe(0);
    });
  });
});
