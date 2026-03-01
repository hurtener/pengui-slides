/**
 * Revision Tracker for Pengui Slides.
 *
 * Creates immutable DeckRevision entries for every deck mutation.
 * Each revision captures the slide order snapshot and a content hash
 * so the full history of a deck can be reconstructed.
 */

import type { DeckId, SlideId } from '../../types/common.js';
import type { DeckMutationType, DeckRevision } from '../../types/deck.js';
import { generateRevisionId, hashSlideContents, type Clock } from '../../infrastructure/index.js';

export interface CreateRevisionParams {
  deckId: DeckId;
  type: DeckMutationType;
  description: string;
  slideIdsSnapshot: SlideId[];
  slideHtmls: string[];
  createdBy?: string;
}

export class RevisionTracker {
  private readonly clock: Clock;

  constructor(clock: Clock) {
    this.clock = clock;
  }

  /**
   * Build an immutable DeckRevision from a mutation event.
   *
   * @param params - The mutation details including current slide state.
   * @returns A fully populated DeckRevision ready for persistence.
   */
  createRevision(params: CreateRevisionParams): DeckRevision {
    const contentHash = hashSlideContents(params.slideHtmls);

    return {
      id: generateRevisionId(),
      deckId: params.deckId,
      type: params.type,
      description: params.description,
      slideIdsSnapshot: [...params.slideIdsSnapshot],
      contentHash,
      createdAt: this.clock.now(),
      ...(params.createdBy ? { createdBy: params.createdBy } : {}),
    };
  }
}
