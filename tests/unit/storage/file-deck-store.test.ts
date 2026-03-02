import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FileDeckStore } from '../../../src/storage/file/deck-store.js';
import type { DeckId, SoulId, SlideId, RevisionId } from '../../../src/types/common.js';
import type { Deck, DeckRevision } from '../../../src/types/deck.js';

function makeDeckId(id: string): DeckId {
  return id as DeckId;
}

function makeDeck(id: string): Deck {
  return {
    id: makeDeckId(id),
    soulId: 'soul-1' as SoulId,
    title: `Deck ${id}`,
    author: 'Test Author',
    slideIds: ['slide-1' as SlideId, 'slide-2' as SlideId],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

function makeRevision(deckId: string, index: number): DeckRevision {
  // Use different timestamps to test sorting
  const date = new Date(2024, 0, 1 + index);
  return {
    id: `rev-${index}` as RevisionId,
    deckId: makeDeckId(deckId),
    type: 'slide_added',
    description: `Revision ${index}`,
    slideIdsSnapshot: ['slide-1' as SlideId],
    contentHash: `hash-${index}`,
    createdAt: date.toISOString(),
  };
}

describe('FileDeckStore', () => {
  let tmpDir: string;
  let store: FileDeckStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pengui-test-'));
    store = new FileDeckStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('save and get', () => {
    it('should save and retrieve a deck', async () => {
      const deck = makeDeck('deck-1');
      await store.save(deck);
      const retrieved = await store.get(makeDeckId('deck-1'));
      expect(retrieved).toEqual(deck);
    });

    it('should return undefined for a non-existent deck', async () => {
      const result = await store.get(makeDeckId('nonexistent'));
      expect(result).toBeUndefined();
    });

    it('should overwrite an existing deck on save', async () => {
      const deck = makeDeck('deck-1');
      await store.save(deck);

      const updated = { ...deck, title: 'Updated Deck' };
      await store.save(updated);

      const retrieved = await store.get(makeDeckId('deck-1'));
      expect(retrieved?.title).toBe('Updated Deck');
    });

    it('should deep-clone data so mutations do not affect stored data', async () => {
      const deck = makeDeck('deck-1');
      await store.save(deck);

      deck.title = 'Mutated';
      const retrieved = await store.get(makeDeckId('deck-1'));
      expect(retrieved?.title).toBe('Deck deck-1');
    });

    it('should persist data to a JSON file on disk', async () => {
      const deck = makeDeck('deck-1');
      await store.save(deck);

      const filePath = path.join(tmpDir, 'decks', 'deck-1.json');
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('list', () => {
    it('should return all decks', async () => {
      await store.save(makeDeck('d1'));
      await store.save(makeDeck('d2'));
      await store.save(makeDeck('d3'));

      const all = await store.list();
      expect(all).toHaveLength(3);
    });

    it('should return empty array when no decks exist', async () => {
      const all = await store.list();
      expect(all).toEqual([]);
    });

    it('should not include revisions files in list results', async () => {
      await store.save(makeDeck('d1'));
      await store.addRevision(makeRevision('d1', 1));

      const all = await store.list();
      expect(all).toHaveLength(1);
    });
  });

  describe('delete', () => {
    it('should delete an existing deck and return true', async () => {
      await store.save(makeDeck('deck-1'));
      const result = await store.delete(makeDeckId('deck-1'));
      expect(result).toBe(true);

      const retrieved = await store.get(makeDeckId('deck-1'));
      expect(retrieved).toBeUndefined();
    });

    it('should return false when deleting a non-existent deck', async () => {
      const result = await store.delete(makeDeckId('nonexistent'));
      expect(result).toBe(false);
    });

    it('should also delete associated revisions file', async () => {
      const deckId = makeDeckId('deck-1');
      await store.save(makeDeck('deck-1'));
      await store.addRevision(makeRevision('deck-1', 1));

      await store.delete(deckId);

      const revisions = await store.getRevisions(deckId);
      expect(revisions).toEqual([]);
    });
  });

  describe('addRevision and getRevisions', () => {
    it('should add and retrieve revisions', async () => {
      const deckId = makeDeckId('deck-1');
      await store.addRevision(makeRevision('deck-1', 1));
      await store.addRevision(makeRevision('deck-1', 2));

      const revisions = await store.getRevisions(deckId);
      expect(revisions).toHaveLength(2);
    });

    it('should return revisions sorted by createdAt descending', async () => {
      const deckId = makeDeckId('deck-1');
      await store.addRevision(makeRevision('deck-1', 1)); // Jan 2
      await store.addRevision(makeRevision('deck-1', 3)); // Jan 4
      await store.addRevision(makeRevision('deck-1', 2)); // Jan 3

      const revisions = await store.getRevisions(deckId);
      expect(revisions).toHaveLength(3);
      // Latest first
      expect(new Date(revisions[0].createdAt).getTime()).toBeGreaterThan(
        new Date(revisions[1].createdAt).getTime(),
      );
      expect(new Date(revisions[1].createdAt).getTime()).toBeGreaterThan(
        new Date(revisions[2].createdAt).getTime(),
      );
    });

    it('should respect the limit parameter', async () => {
      const deckId = makeDeckId('deck-1');
      await store.addRevision(makeRevision('deck-1', 1));
      await store.addRevision(makeRevision('deck-1', 2));
      await store.addRevision(makeRevision('deck-1', 3));

      const revisions = await store.getRevisions(deckId, 2);
      expect(revisions).toHaveLength(2);
    });

    it('should return empty array when no revisions exist', async () => {
      const revisions = await store.getRevisions(makeDeckId('nonexistent'));
      expect(revisions).toEqual([]);
    });
  });

  describe('data survives re-instantiation', () => {
    it('should read data saved by a previous store instance', async () => {
      const store1 = new FileDeckStore(tmpDir);
      await store1.save(makeDeck('deck-persist'));
      await store1.addRevision(makeRevision('deck-persist', 1));

      const store2 = new FileDeckStore(tmpDir);
      const deck = await store2.get(makeDeckId('deck-persist'));
      expect(deck).toBeDefined();
      expect(deck?.title).toBe('Deck deck-persist');

      const revisions = await store2.getRevisions(makeDeckId('deck-persist'));
      expect(revisions).toHaveLength(1);
    });
  });
});
