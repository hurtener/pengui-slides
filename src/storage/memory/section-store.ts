/**
 * In-memory implementation of ISectionStore.
 *
 * Mirrors InMemorySlideStore: Map<string, T> + deep-clone on read/write.
 */

import type { DeckId, SectionId } from '../../types/common.js';
import type { Section } from '../../types/section.js';
import type { ISectionStore } from '../interfaces.js';

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class InMemorySectionStore implements ISectionStore {
  private sections = new Map<string, Section>();

  async save(section: Section): Promise<void> {
    this.sections.set(section.id, clone(section));
  }

  async get(id: SectionId): Promise<Section | undefined> {
    const section = this.sections.get(id);
    return section ? clone(section) : undefined;
  }

  async getByDeck(deckId: DeckId): Promise<Section[]> {
    const matches = Array.from(this.sections.values()).filter(
      (s) => s.deckId === deckId,
    );
    return clone(matches.sort((a, b) => a.position - b.position));
  }

  async delete(id: SectionId): Promise<boolean> {
    return this.sections.delete(id);
  }

  async deleteByDeck(deckId: DeckId): Promise<number> {
    let count = 0;
    for (const [id, section] of this.sections) {
      if (section.deckId === deckId) {
        this.sections.delete(id);
        count++;
      }
    }
    return count;
  }
}
