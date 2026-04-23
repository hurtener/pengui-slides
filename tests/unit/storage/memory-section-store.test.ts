import { describe, it, expect, beforeEach } from 'vitest';
import { InMemorySectionStore } from '../../../src/storage/memory/section-store.js';
import type { Section } from '../../../src/types/section.js';
import type { SectionId, DeckId } from '../../../src/types/common.js';

function makeSection(overrides: Partial<Section> = {}): Section {
  return {
    id: 'section-1' as SectionId,
    deckId: 'deck-1' as DeckId,
    position: 0,
    html: '<section class="pengui-section pengui-prose"><p>Hi.</p></section>',
    kind: 'prose',
    breakHints: {},
    metadata: {
      title: 'Test Section',
      kind: 'prose',
      narrative: 'Test narrative',
      generatedAt: '2026-01-01T00:00:00.000Z',
      soulId: 'soul-1',
      deckId: 'deck-1',
      position: 0,
      metaVersion: '3.0',
      revisionHash: 'abc123',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('InMemorySectionStore', () => {
  let store: InMemorySectionStore;

  beforeEach(() => {
    store = new InMemorySectionStore();
  });

  describe('save and get', () => {
    it('saves and retrieves a section by ID', async () => {
      await store.save(makeSection());
      const retrieved = await store.get('section-1' as SectionId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.kind).toBe('prose');
    });

    it('returns undefined for non-existent ID', async () => {
      const result = await store.get('nope' as SectionId);
      expect(result).toBeUndefined();
    });

    it('deep-clones on read to prevent mutation', async () => {
      await store.save(makeSection());
      const first = await store.get('section-1' as SectionId);
      first!.html = 'MUTATED';
      const second = await store.get('section-1' as SectionId);
      expect(second!.html).toContain('Hi.');
    });
  });

  describe('getByDeck', () => {
    it('returns sections for a specific deck sorted by position', async () => {
      await store.save(makeSection({ id: 'a' as SectionId, position: 2 }));
      await store.save(makeSection({ id: 'b' as SectionId, position: 0 }));
      await store.save(makeSection({ id: 'c' as SectionId, position: 1 }));
      await store.save(makeSection({ id: 'd' as SectionId, deckId: 'other' as DeckId }));

      const sections = await store.getByDeck('deck-1' as DeckId);
      expect(sections).toHaveLength(3);
      expect(sections.map((s) => s.id)).toEqual(['b', 'c', 'a']);
    });
  });

  describe('delete', () => {
    it('deletes a section and returns true', async () => {
      await store.save(makeSection());
      const ok = await store.delete('section-1' as SectionId);
      expect(ok).toBe(true);
      expect(await store.get('section-1' as SectionId)).toBeUndefined();
    });

    it('returns false when deleting a non-existent section', async () => {
      expect(await store.delete('nope' as SectionId)).toBe(false);
    });
  });

  describe('deleteByDeck', () => {
    it('deletes all sections for a deck and returns count', async () => {
      await store.save(makeSection({ id: 'a' as SectionId, deckId: 'd1' as DeckId }));
      await store.save(makeSection({ id: 'b' as SectionId, deckId: 'd1' as DeckId }));
      await store.save(makeSection({ id: 'c' as SectionId, deckId: 'd2' as DeckId }));

      const deleted = await store.deleteByDeck('d1' as DeckId);
      expect(deleted).toBe(2);
      expect(await store.getByDeck('d1' as DeckId)).toHaveLength(0);
      expect(await store.getByDeck('d2' as DeckId)).toHaveLength(1);
    });
  });
});
