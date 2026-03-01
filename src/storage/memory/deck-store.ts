/**
 * In-memory implementation of IDeckStore.
 *
 * Uses Map<string, T> as the backing store and deep-clones every
 * object on read/write to prevent external mutation bugs.
 */

import type { DeckId } from '../../types/common.js';
import type { Deck, DeckRevision } from '../../types/deck.js';
import type { IDeckStore } from '../interfaces.js';

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class InMemoryDeckStore implements IDeckStore {
  private decks = new Map<string, Deck>();
  private revisions = new Map<string, DeckRevision[]>();

  async save(deck: Deck): Promise<void> {
    this.decks.set(deck.id, clone(deck));
  }

  async get(id: DeckId): Promise<Deck | undefined> {
    const deck = this.decks.get(id);
    return deck ? clone(deck) : undefined;
  }

  async list(): Promise<Deck[]> {
    return clone(Array.from(this.decks.values()));
  }

  async delete(id: DeckId): Promise<boolean> {
    const existed = this.decks.delete(id);
    this.revisions.delete(id);
    return existed;
  }

  async addRevision(revision: DeckRevision): Promise<void> {
    const key = revision.deckId as string;
    const existing = this.revisions.get(key) ?? [];
    existing.push(clone(revision));
    this.revisions.set(key, existing);
  }

  async getRevisions(deckId: DeckId, limit?: number): Promise<DeckRevision[]> {
    const all = this.revisions.get(deckId) ?? [];
    const sorted = clone(all).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return limit !== undefined ? sorted.slice(0, limit) : sorted;
  }
}
