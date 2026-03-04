import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryDeckStore } from '../../../src/storage/memory/deck-store.js';
import type { Deck, DeckRevision } from '../../../src/types/deck.js';
import type { DeckId, RevisionId, SlideId, SoulId } from '../../../src/types/common.js';

function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck-1' as DeckId,
    soulId: 'soul-1' as SoulId,
    title: 'Test Deck',
    author: 'Test Author',
    slideIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRevision(overrides: Partial<DeckRevision> = {}): DeckRevision {
  return {
    id: 'rev-1' as RevisionId,
    deckId: 'deck-1' as DeckId,
    type: 'deck_created',
    description: 'Deck created',
    slideIdsSnapshot: [],
    contentHash: 'abc123',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('InMemoryDeckStore', () => {
  let store: InMemoryDeckStore;

  beforeEach(() => {
    store = new InMemoryDeckStore();
  });

  describe('save and get', () => {
    it('saves and retrieves a deck by ID', async () => {
      const deck = makeDeck();
      await store.save(deck);

      const retrieved = await store.get('deck-1' as DeckId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('deck-1');
      expect(retrieved!.title).toBe('Test Deck');
    });

    it('returns undefined for non-existent ID', async () => {
      const result = await store.get('non-existent' as DeckId);
      expect(result).toBeUndefined();
    });

    it('overwrites existing deck on save with same ID', async () => {
      await store.save(makeDeck());
      await store.save(makeDeck({ title: 'Updated Deck' }));

      const retrieved = await store.get('deck-1' as DeckId);
      expect(retrieved!.title).toBe('Updated Deck');
    });

    it('deep-clones on read to prevent mutation', async () => {
      await store.save(makeDeck());

      const retrieved1 = await store.get('deck-1' as DeckId);
      retrieved1!.title = 'MUTATED';

      const retrieved2 = await store.get('deck-1' as DeckId);
      expect(retrieved2!.title).toBe('Test Deck');
    });
  });

  describe('list', () => {
    it('returns empty array when no decks exist', async () => {
      const results = await store.list();
      expect(results).toEqual([]);
    });

    it('returns all saved decks', async () => {
      await store.save(makeDeck({ id: 'deck-1' as DeckId }));
      await store.save(makeDeck({ id: 'deck-2' as DeckId }));

      const results = await store.list();
      expect(results).toHaveLength(2);
    });
  });

  describe('delete', () => {
    it('deletes an existing deck and returns true', async () => {
      await store.save(makeDeck());
      const result = await store.delete('deck-1' as DeckId);
      expect(result).toBe(true);

      const retrieved = await store.get('deck-1' as DeckId);
      expect(retrieved).toBeUndefined();
    });

    it('returns false for non-existent ID', async () => {
      const result = await store.delete('non-existent' as DeckId);
      expect(result).toBe(false);
    });

    it('also deletes associated revisions', async () => {
      await store.save(makeDeck());
      await store.addRevision(makeRevision());

      await store.delete('deck-1' as DeckId);

      const revisions = await store.getRevisions('deck-1' as DeckId);
      expect(revisions).toEqual([]);
    });
  });

  describe('revisions', () => {
    it('adds and retrieves revisions', async () => {
      await store.addRevision(makeRevision({ id: 'rev-1' as RevisionId }));
      await store.addRevision(makeRevision({ id: 'rev-2' as RevisionId }));

      const revisions = await store.getRevisions('deck-1' as DeckId);
      expect(revisions).toHaveLength(2);
    });

    it('sorts revisions by createdAt descending (newest first)', async () => {
      await store.addRevision(
        makeRevision({ id: 'rev-1' as RevisionId, createdAt: '2026-01-01T00:00:00.000Z' }),
      );
      await store.addRevision(
        makeRevision({ id: 'rev-2' as RevisionId, createdAt: '2026-01-03T00:00:00.000Z' }),
      );
      await store.addRevision(
        makeRevision({ id: 'rev-3' as RevisionId, createdAt: '2026-01-02T00:00:00.000Z' }),
      );

      const revisions = await store.getRevisions('deck-1' as DeckId);
      expect(revisions[0].id).toBe('rev-2');
      expect(revisions[1].id).toBe('rev-3');
      expect(revisions[2].id).toBe('rev-1');
    });

    it('respects limit parameter', async () => {
      await store.addRevision(
        makeRevision({ id: 'rev-1' as RevisionId, createdAt: '2026-01-01T00:00:00.000Z' }),
      );
      await store.addRevision(
        makeRevision({ id: 'rev-2' as RevisionId, createdAt: '2026-01-02T00:00:00.000Z' }),
      );
      await store.addRevision(
        makeRevision({ id: 'rev-3' as RevisionId, createdAt: '2026-01-03T00:00:00.000Z' }),
      );

      const revisions = await store.getRevisions('deck-1' as DeckId, 2);
      expect(revisions).toHaveLength(2);
      // Newest first
      expect(revisions[0].id).toBe('rev-3');
      expect(revisions[1].id).toBe('rev-2');
    });

    it('returns all when limit exceeds count', async () => {
      await store.addRevision(makeRevision());

      const revisions = await store.getRevisions('deck-1' as DeckId, 100);
      expect(revisions).toHaveLength(1);
    });

    it('returns empty array for non-existent deck', async () => {
      const revisions = await store.getRevisions('non-existent' as DeckId);
      expect(revisions).toEqual([]);
    });
  });
});
