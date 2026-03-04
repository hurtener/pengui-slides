import { describe, it, expect } from 'vitest';
import { RevisionTracker } from '../../../../src/domain/decks/revision-tracker.js';
import { FixedClock } from '../../../../src/infrastructure/clock.js';
import type { DeckId, SlideId } from '../../../../src/types/common.js';

describe('RevisionTracker', () => {
  const clock = new FixedClock('2026-01-15T12:00:00.000Z');
  const tracker = new RevisionTracker(clock);

  it('creates a revision with correct structure', () => {
    const revision = tracker.createRevision({
      deckId: 'deck-1' as DeckId,
      type: 'deck_created',
      description: 'Deck created',
      slideIdsSnapshot: [],
      slideHtmls: [],
    });

    expect(revision.deckId).toBe('deck-1');
    expect(revision.type).toBe('deck_created');
    expect(revision.description).toBe('Deck created');
    expect(revision.slideIdsSnapshot).toEqual([]);
    expect(revision.id).toBeDefined();
    expect(revision.contentHash).toBeDefined();
    expect(revision.createdAt).toBe('2026-01-15T12:00:00.000Z');
  });

  it('generates a content hash from slide HTMLs', () => {
    const revision = tracker.createRevision({
      deckId: 'deck-1' as DeckId,
      type: 'slide_added',
      description: 'Slide added',
      slideIdsSnapshot: ['slide-1' as SlideId],
      slideHtmls: ['<div>Hello</div>'],
    });

    expect(revision.contentHash).toHaveLength(64);
    expect(revision.contentHash).toMatch(/^[0-9a-f]+$/);
  });

  it('produces different hashes for different content', () => {
    const rev1 = tracker.createRevision({
      deckId: 'deck-1' as DeckId,
      type: 'slide_added',
      description: 'Slide A',
      slideIdsSnapshot: ['slide-1' as SlideId],
      slideHtmls: ['<div>A</div>'],
    });

    const rev2 = tracker.createRevision({
      deckId: 'deck-1' as DeckId,
      type: 'slide_added',
      description: 'Slide B',
      slideIdsSnapshot: ['slide-1' as SlideId],
      slideHtmls: ['<div>B</div>'],
    });

    expect(rev1.contentHash).not.toBe(rev2.contentHash);
  });

  it('uses the clock for timestamps', () => {
    const revision = tracker.createRevision({
      deckId: 'deck-1' as DeckId,
      type: 'deck_created',
      description: 'Test',
      slideIdsSnapshot: [],
      slideHtmls: [],
    });

    expect(revision.createdAt).toBe('2026-01-15T12:00:00.000Z');
  });

  it('generates unique IDs for each revision', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const rev = tracker.createRevision({
        deckId: 'deck-1' as DeckId,
        type: 'deck_created',
        description: `Test ${i}`,
        slideIdsSnapshot: [],
        slideHtmls: [],
      });
      ids.add(rev.id as string);
    }
    expect(ids.size).toBe(20);
  });

  it('copies slideIdsSnapshot (not by reference)', () => {
    const slideIds = ['slide-1' as SlideId, 'slide-2' as SlideId];
    const revision = tracker.createRevision({
      deckId: 'deck-1' as DeckId,
      type: 'slide_added',
      description: 'Test',
      slideIdsSnapshot: slideIds,
      slideHtmls: ['<div>1</div>', '<div>2</div>'],
    });

    // Mutate original array
    slideIds.push('slide-3' as SlideId);

    expect(revision.slideIdsSnapshot).toHaveLength(2);
  });

  it('includes createdBy when provided', () => {
    const revision = tracker.createRevision({
      deckId: 'deck-1' as DeckId,
      type: 'deck_created',
      description: 'Test',
      slideIdsSnapshot: [],
      slideHtmls: [],
      createdBy: 'agent-x',
    });

    expect(revision.createdBy).toBe('agent-x');
  });

  it('omits createdBy when not provided', () => {
    const revision = tracker.createRevision({
      deckId: 'deck-1' as DeckId,
      type: 'deck_created',
      description: 'Test',
      slideIdsSnapshot: [],
      slideHtmls: [],
    });

    expect(revision.createdBy).toBeUndefined();
  });
});
