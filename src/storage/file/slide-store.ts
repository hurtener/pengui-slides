/**
 * File-based implementation of ISlideStore.
 *
 * Persists Slide objects as JSON files in a configurable directory.
 * Deep-clones on read/write for data integrity.
 *
 * File layout:
 *   <baseDir>/slides/<slideId>.json - Slide object
 */

import fs from 'node:fs';
import path from 'node:path';
import type { DeckId, SlideId } from '../../types/common.js';
import type { Slide } from '../../types/deck.js';
import type { ISlideStore } from '../interfaces.js';

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class FileSlideStore implements ISlideStore {
  private readonly dir: string;

  constructor(baseDir: string) {
    this.dir = path.join(baseDir, 'slides');
  }

  private ensureDir(): void {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private slidePath(id: SlideId): string {
    return path.join(this.dir, `${id}.json`);
  }

  async save(slide: Slide): Promise<void> {
    this.ensureDir();
    fs.writeFileSync(this.slidePath(slide.id), JSON.stringify(clone(slide), null, 2), 'utf-8');
  }

  async get(id: SlideId): Promise<Slide | undefined> {
    const filePath = this.slidePath(id);
    if (!fs.existsSync(filePath)) return undefined;
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as Slide;
  }

  async getByDeck(deckId: DeckId): Promise<Slide[]> {
    this.ensureDir();
    const files = fs.readdirSync(this.dir);
    const matches: Slide[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const data = fs.readFileSync(path.join(this.dir, file), 'utf-8');
      const slide = JSON.parse(data) as Slide;
      if (slide.deckId === deckId) {
        matches.push(slide);
      }
    }
    return clone(matches.sort((a, b) => a.position - b.position));
  }

  async delete(id: SlideId): Promise<boolean> {
    const filePath = this.slidePath(id);
    if (!fs.existsSync(filePath)) return false;
    fs.unlinkSync(filePath);
    return true;
  }

  async deleteByDeck(deckId: DeckId): Promise<number> {
    this.ensureDir();
    const files = fs.readdirSync(this.dir);
    let count = 0;
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const filePath = path.join(this.dir, file);
      const data = fs.readFileSync(filePath, 'utf-8');
      const slide = JSON.parse(data) as Slide;
      if (slide.deckId === deckId) {
        fs.unlinkSync(filePath);
        count++;
      }
    }
    return count;
  }
}
