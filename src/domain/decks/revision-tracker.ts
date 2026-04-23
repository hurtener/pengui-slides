/**
 * Revision Tracker for Pengui Slides.
 *
 * Creates immutable DeckRevision entries for every deck mutation.
 * Each revision captures the slide order snapshot and a content hash
 * so the full history of a deck can be reconstructed.
 */

import type { DeckId, SectionId, SlideId } from '../../types/common.js';
import type { DeckMutationType, DeckRevision } from '../../types/deck.js';
import { generateRevisionId, hashSlideContents, type Clock } from '../../infrastructure/index.js';

export interface CreateRevisionParams {
  deckId: DeckId;
  type: DeckMutationType;
  description: string;
  slideIdsSnapshot: SlideId[];
  slideHtmls: string[];
  /**
   * Document-mode snapshot. Present only for section / document-meta
   * mutations. Slide-mode mutations leave this undefined and the
   * resulting revision omits the field entirely (legacy-safe).
   */
  sectionIdsSnapshot?: SectionId[];
  /**
   * HTML fragments used to compute the content hash for document-mode
   * mutations. When set, overrides `slideHtmls` as the hash source.
   */
  sectionHtmls?: string[];
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
   * For slide-mode mutations: pass `slideIdsSnapshot` + `slideHtmls`; the
   * `sectionIdsSnapshot` field is omitted in the resulting revision.
   *
   * For document-mode mutations: pass `sectionIdsSnapshot` + `sectionHtmls`
   * (and typically empty slide arrays). The resulting revision carries the
   * section snapshot and hashes the fragment contents.
   *
   * @param params - The mutation details including current deck state.
   * @returns A fully populated DeckRevision ready for persistence.
   */
  createRevision(params: CreateRevisionParams): DeckRevision {
    const htmls =
      params.sectionHtmls !== undefined ? params.sectionHtmls : params.slideHtmls;
    const contentHash = hashSlideContents(htmls);

    return {
      id: generateRevisionId(),
      deckId: params.deckId,
      type: params.type,
      description: params.description,
      slideIdsSnapshot: [...params.slideIdsSnapshot],
      ...(params.sectionIdsSnapshot
        ? { sectionIdsSnapshot: [...params.sectionIdsSnapshot] }
        : {}),
      contentHash,
      createdAt: this.clock.now(),
      ...(params.createdBy ? { createdBy: params.createdBy } : {}),
    };
  }
}
