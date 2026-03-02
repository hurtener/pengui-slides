/**
 * File-based implementation of IDeckStore.
 *
 * Persists Deck objects and DeckRevision arrays as JSON files
 * in a configurable directory. Deep-clones on read/write for data integrity.
 *
 * File layout:
 *   <baseDir>/decks/<deckId>.json            - Deck object
 *   <baseDir>/decks/<deckId>.revisions.json  - DeckRevision[]
 */

import fs from 'node:fs';
import path from 'node:path';
import type { DeckId } from '../../types/common.js';
import type { Deck, DeckRevision } from '../../types/deck.js';
import type { IDeckStore } from '../interfaces.js';

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class FileDeckStore implements IDeckStore {
  private readonly dir: string;

  constructor(baseDir: string) {
    this.dir = path.join(baseDir, 'decks');
  }

  private ensureDir(): void {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private deckPath(id: DeckId): string {
    return path.join(this.dir, `${id}.json`);
  }

  private revisionsPath(id: DeckId): string {
    return path.join(this.dir, `${id}.revisions.json`);
  }

  async save(deck: Deck): Promise<void> {
    this.ensureDir();
    fs.writeFileSync(this.deckPath(deck.id), JSON.stringify(clone(deck), null, 2), 'utf-8');
  }

  async get(id: DeckId): Promise<Deck | undefined> {
    const filePath = this.deckPath(id);
    if (!fs.existsSync(filePath)) return undefined;
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as Deck;
  }

  async list(): Promise<Deck[]> {
    this.ensureDir();
    const files = fs.readdirSync(this.dir);
    const decks: Deck[] = [];
    for (const file of files) {
      if (!file.endsWith('.json') || file.endsWith('.revisions.json')) continue;
      const data = fs.readFileSync(path.join(this.dir, file), 'utf-8');
      decks.push(JSON.parse(data) as Deck);
    }
    return clone(decks);
  }

  async delete(id: DeckId): Promise<boolean> {
    const filePath = this.deckPath(id);
    const existed = fs.existsSync(filePath);
    if (existed) fs.unlinkSync(filePath);
    const revPath = this.revisionsPath(id);
    if (fs.existsSync(revPath)) fs.unlinkSync(revPath);
    return existed;
  }

  async addRevision(revision: DeckRevision): Promise<void> {
    this.ensureDir();
    const filePath = this.revisionsPath(revision.deckId);
    let existing: DeckRevision[] = [];
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      existing = JSON.parse(data) as DeckRevision[];
    }
    existing.push(clone(revision));
    fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
  }

  async getRevisions(deckId: DeckId, limit?: number): Promise<DeckRevision[]> {
    const filePath = this.revisionsPath(deckId);
    if (!fs.existsSync(filePath)) return [];
    const data = fs.readFileSync(filePath, 'utf-8');
    const all = JSON.parse(data) as DeckRevision[];
    const sorted = clone(all).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return limit !== undefined ? sorted.slice(0, limit) : sorted;
  }
}
