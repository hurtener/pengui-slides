/**
 * In-memory implementation of ISlideStore.
 *
 * Uses Map<string, T> as the backing store and deep-clones every
 * object on read/write to prevent external mutation bugs.
 */

import type { DeckId, SlideId } from '../../types/common.js';
import type { Slide } from '../../types/deck.js';
import type { ISlideStore } from '../interfaces.js';

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class InMemorySlideStore implements ISlideStore {
  private slides = new Map<string, Slide>();

  async save(slide: Slide): Promise<void> {
    this.slides.set(slide.id, clone(slide));
  }

  async get(id: SlideId): Promise<Slide | undefined> {
    const slide = this.slides.get(id);
    return slide ? clone(slide) : undefined;
  }

  async getByDeck(deckId: DeckId): Promise<Slide[]> {
    const matches = Array.from(this.slides.values()).filter(
      (s) => s.deckId === deckId,
    );
    return clone(matches.sort((a, b) => a.position - b.position));
  }

  async delete(id: SlideId): Promise<boolean> {
    return this.slides.delete(id);
  }

  async deleteByDeck(deckId: DeckId): Promise<number> {
    let count = 0;
    for (const [id, slide] of this.slides) {
      if (slide.deckId === deckId) {
        this.slides.delete(id);
        count++;
      }
    }
    return count;
  }
}
