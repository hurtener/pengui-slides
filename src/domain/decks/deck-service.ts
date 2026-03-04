/**
 * Deck Service for Pengui Slides.
 *
 * Manages the full deck lifecycle: creation, slide CRUD, reordering,
 * and summary generation. Every mutation produces an immutable revision
 * entry via the RevisionTracker.
 */

import type { DeckId, SlideId } from '../../types/common.js';
import { deckId, slideId, soulId } from '../../types/common.js';
import type {
  Deck,
  Slide,
  DeckSummary,
  SlideSummary,
  CreateDeckInput,
  AddSlideInput,
  UpdateSlideInput,
} from '../../types/deck.js';
import type { SlideMetadata, SlideType } from '../../types/metadata.js';
import { DeckNotFoundError, SlideNotFoundError, SoulNotFoundError } from '../../types/errors.js';
import type { IDeckStore, ISlideStore, ISoulStore } from '../../storage/interfaces.js';
import {
  generateDeckId,
  generateSlideId,
  sha256,
  type Clock,
} from '../../infrastructure/index.js';
import type { Logger } from '../../infrastructure/index.js';
import { RevisionTracker } from './revision-tracker.js';

export class DeckService {
  private readonly deckStore: IDeckStore;
  private readonly slideStore: ISlideStore;
  private readonly soulStore: ISoulStore;
  private readonly clock: Clock;
  private readonly logger: Logger;
  private readonly revisionTracker: RevisionTracker;

  constructor(
    deckStore: IDeckStore,
    slideStore: ISlideStore,
    soulStore: ISoulStore,
    clock: Clock,
    logger: Logger,
  ) {
    this.deckStore = deckStore;
    this.slideStore = slideStore;
    this.soulStore = soulStore;
    this.clock = clock;
    this.logger = logger;
    this.revisionTracker = new RevisionTracker(clock);
  }

  // ── Create Deck ──────────────────────────────────────────────────

  /**
   * Create a new empty deck linked to a Design Soul.
   *
   * @throws SoulNotFoundError if the referenced soul does not exist.
   */
  async createDeck(input: CreateDeckInput): Promise<Deck> {
    const sid = soulId(input.soulId);
    const soul = await this.soulStore.get(sid);
    if (!soul) {
      throw new SoulNotFoundError(input.soulId);
    }

    const now = this.clock.now();
    const deck: Deck = {
      id: generateDeckId(),
      soulId: sid,
      title: input.title ?? 'Untitled Deck',
      author: input.author ?? '',
      slideIds: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.deckStore.save(deck);

    // Record creation revision
    const revision = this.revisionTracker.createRevision({
      deckId: deck.id,
      type: 'deck_created',
      description: `Deck "${deck.title}" created`,
      slideIdsSnapshot: [],
      slideHtmls: [],
    });
    await this.deckStore.addRevision(revision);

    this.logger.info('Deck created', { deckId: deck.id, soulId: deck.soulId });
    return deck;
  }

  // ── Add Slide ────────────────────────────────────────────────────

  /**
   * Add a new slide to a deck.
   *
   * Builds full SlideMetadata from the input, auto-filling provenance
   * fields (generatedAt, soulId, deckId, position, metaVersion, revisionHash).
   *
   * @throws DeckNotFoundError if the deck does not exist.
   */
  async addSlide(input: AddSlideInput): Promise<Slide> {
    const did = deckId(input.deckId);
    const deck = await this.deckStore.get(did);
    if (!deck) {
      throw new DeckNotFoundError(input.deckId);
    }

    const now = this.clock.now();
    const position = input.position ?? deck.slideIds.length;

    // Build full metadata from input + auto-generated fields
    const metadata: SlideMetadata = {
      title: input.metadata.title,
      type: input.metadata.type as SlideType,
      narrative: input.metadata.narrative,
      keyPoints: input.metadata.keyPoints ?? [],
      dataPoints: (input.metadata.dataPoints ?? []).map((dp) => ({
        label: dp.label,
        value: dp.value,
        ...(dp.unit ? { unit: dp.unit } : {}),
        ...(dp.source ? { source: dp.source } : {}),
        ...(dp.period ? { period: dp.period } : {}),
        ...(dp.trend ? { trend: dp.trend as 'up' | 'down' | 'flat' } : {}),
      })),
      tags: input.metadata.tags ?? [],
      ...(input.metadata.audience ? { audience: input.metadata.audience } : {}),
      ...(input.metadata.confidentiality
        ? { confidentiality: input.metadata.confidentiality as SlideMetadata['confidentiality'] }
        : {}),
      ...(input.metadata.sources
        ? {
            sources: input.metadata.sources.map((s) => ({
              ...(s.url ? { url: s.url } : {}),
              ...(s.title ? { title: s.title } : {}),
              ...(s.quoteSpan ? { quoteSpan: s.quoteSpan } : {}),
              ...(s.confidence !== undefined ? { confidence: s.confidence } : {}),
              ...(s.retrievedAt ? { retrievedAt: s.retrievedAt } : {}),
            })),
          }
        : {}),

      // Auto-filled provenance
      generatedAt: now,
      soulId: deck.soulId as string,
      deckId: deck.id as string,
      position,
      metaVersion: '1.0',
      revisionHash: sha256(input.html),
    };

    const slide: Slide = {
      id: generateSlideId(),
      deckId: deck.id,
      position,
      html: input.html,
      metadata,
      createdAt: now,
      updatedAt: now,
    };

    // Insert the slide ID at the correct position in the deck
    const updatedSlideIds = [...deck.slideIds];
    updatedSlideIds.splice(position, 0, slide.id);

    // Update positions for slides after the insertion point
    await this.reindexPositions(updatedSlideIds, deck.id, position + 1);

    // Persist slide
    await this.slideStore.save(slide);

    // Update deck
    deck.slideIds = updatedSlideIds;
    deck.updatedAt = now;
    await this.deckStore.save(deck);

    // Record revision
    const allHtmls = await this.collectSlideHtmls(deck.id, updatedSlideIds);
    const revision = this.revisionTracker.createRevision({
      deckId: deck.id,
      type: 'slide_added',
      description: `Slide "${metadata.title}" added at position ${position}`,
      slideIdsSnapshot: updatedSlideIds,
      slideHtmls: allHtmls,
    });
    await this.deckStore.addRevision(revision);

    this.logger.info('Slide added', { deckId: deck.id, slideId: slide.id, position });
    return slide;
  }

  // ── Update Slide ─────────────────────────────────────────────────

  /**
   * Update a slide's HTML and/or metadata.
   *
   * @throws DeckNotFoundError if the deck does not exist.
   * @throws SlideNotFoundError if the slide does not exist.
   */
  async updateSlide(input: UpdateSlideInput): Promise<Slide> {
    const did = deckId(input.deckId);
    const sid = slideId(input.slideId);

    const deck = await this.deckStore.get(did);
    if (!deck) {
      throw new DeckNotFoundError(input.deckId);
    }

    const slide = await this.slideStore.get(sid);
    if (!slide || (slide.deckId as string) !== (did as string)) {
      throw new SlideNotFoundError(input.slideId);
    }

    const now = this.clock.now();

    // Update HTML if provided
    if (input.html !== undefined) {
      slide.html = input.html;
      slide.metadata.revisionHash = sha256(input.html);
    }

    // Update lastValidation if provided
    if (input.lastValidation !== undefined) {
      slide.lastValidation = input.lastValidation;
    }

    // Merge metadata fields if provided
    if (input.metadata) {
      const m = input.metadata;
      if (m.title !== undefined) slide.metadata.title = m.title;
      if (m.type !== undefined) slide.metadata.type = m.type as SlideType;
      if (m.narrative !== undefined) slide.metadata.narrative = m.narrative;
      if (m.keyPoints !== undefined) slide.metadata.keyPoints = m.keyPoints;
      if (m.dataPoints !== undefined) {
        slide.metadata.dataPoints = m.dataPoints.map((dp) => ({
          label: dp.label,
          value: dp.value,
          ...(dp.unit ? { unit: dp.unit } : {}),
          ...(dp.source ? { source: dp.source } : {}),
          ...(dp.period ? { period: dp.period } : {}),
          ...(dp.trend ? { trend: dp.trend as 'up' | 'down' | 'flat' } : {}),
        }));
      }
      if (m.tags !== undefined) slide.metadata.tags = m.tags;
      if (m.audience !== undefined) slide.metadata.audience = m.audience;
      if (m.confidentiality !== undefined) {
        slide.metadata.confidentiality = m.confidentiality as SlideMetadata['confidentiality'];
      }
      if (m.sources !== undefined) {
        slide.metadata.sources = m.sources.map((s) => ({
          ...(s.url ? { url: s.url } : {}),
          ...(s.title ? { title: s.title } : {}),
          ...(s.quoteSpan ? { quoteSpan: s.quoteSpan } : {}),
          ...(s.confidence !== undefined ? { confidence: s.confidence } : {}),
          ...(s.retrievedAt ? { retrievedAt: s.retrievedAt } : {}),
        }));
      }
    }

    slide.updatedAt = now;
    await this.slideStore.save(slide);

    // Update deck timestamp
    deck.updatedAt = now;
    await this.deckStore.save(deck);

    // Record revision
    const allHtmls = await this.collectSlideHtmls(deck.id, deck.slideIds);
    const revision = this.revisionTracker.createRevision({
      deckId: deck.id,
      type: 'slide_updated',
      description: `Slide "${slide.metadata.title}" updated`,
      slideIdsSnapshot: deck.slideIds,
      slideHtmls: allHtmls,
    });
    await this.deckStore.addRevision(revision);

    this.logger.info('Slide updated', { deckId: deck.id, slideId: slide.id });
    return slide;
  }

  // ── Get Slide ────────────────────────────────────────────────────

  /**
   * Retrieve a single slide by ID.
   *
   * @throws SlideNotFoundError if the slide does not exist.
   */
  async getSlide(id: string): Promise<Slide> {
    const sid = slideId(id);
    const slide = await this.slideStore.get(sid);
    if (!slide) {
      throw new SlideNotFoundError(id);
    }
    return slide;
  }

  // ── Remove Slide ─────────────────────────────────────────────────

  /**
   * Remove a slide from its deck and delete it.
   *
   * @throws DeckNotFoundError if the deck does not exist.
   * @throws SlideNotFoundError if the slide does not exist in the deck.
   */
  async removeSlide(deckIdStr: string, slideIdStr: string): Promise<void> {
    const did = deckId(deckIdStr);
    const sid = slideId(slideIdStr);

    const deck = await this.deckStore.get(did);
    if (!deck) {
      throw new DeckNotFoundError(deckIdStr);
    }

    const slideIndex = deck.slideIds.findIndex((id) => (id as string) === (sid as string));
    if (slideIndex === -1) {
      throw new SlideNotFoundError(slideIdStr);
    }

    const now = this.clock.now();

    // Remove from deck's slide list
    const updatedSlideIds = deck.slideIds.filter(
      (id) => (id as string) !== (sid as string),
    );

    // Reindex positions for remaining slides
    await this.reindexPositions(updatedSlideIds, deck.id, slideIndex);

    // Delete the slide
    await this.slideStore.delete(sid);

    // Update deck
    deck.slideIds = updatedSlideIds;
    deck.updatedAt = now;
    await this.deckStore.save(deck);

    // Record revision
    const allHtmls = await this.collectSlideHtmls(deck.id, updatedSlideIds);
    const revision = this.revisionTracker.createRevision({
      deckId: deck.id,
      type: 'slide_removed',
      description: `Slide removed from position ${slideIndex}`,
      slideIdsSnapshot: updatedSlideIds,
      slideHtmls: allHtmls,
    });
    await this.deckStore.addRevision(revision);

    this.logger.info('Slide removed', { deckId: deck.id, slideId: sid, position: slideIndex });
  }

  // ── Reorder Slides ───────────────────────────────────────────────

  /**
   * Reorder the slides in a deck to match the given slide ID order.
   *
   * @param deckIdStr - The deck to reorder.
   * @param newOrder - The complete list of slide IDs in the desired order.
   * @throws DeckNotFoundError if the deck does not exist.
   */
  async reorderSlides(deckIdStr: string, newOrder: string[]): Promise<Deck> {
    const did = deckId(deckIdStr);
    const deck = await this.deckStore.get(did);
    if (!deck) {
      throw new DeckNotFoundError(deckIdStr);
    }

    const now = this.clock.now();
    const newSlideIds = newOrder.map((id) => slideId(id));

    // Reindex all positions
    await this.reindexPositions(newSlideIds, deck.id, 0);

    // Update deck
    deck.slideIds = newSlideIds;
    deck.updatedAt = now;
    await this.deckStore.save(deck);

    // Record revision
    const allHtmls = await this.collectSlideHtmls(deck.id, newSlideIds);
    const revision = this.revisionTracker.createRevision({
      deckId: deck.id,
      type: 'slides_reordered',
      description: 'Slides reordered',
      slideIdsSnapshot: newSlideIds,
      slideHtmls: allHtmls,
    });
    await this.deckStore.addRevision(revision);

    this.logger.info('Slides reordered', { deckId: deck.id });
    return deck;
  }

  // ── Deck Summary ─────────────────────────────────────────────────

  /**
   * Build a lightweight summary of a deck (no HTML bodies).
   *
   * @throws DeckNotFoundError if the deck does not exist.
   */
  async getDeckSummary(deckIdStr: string): Promise<DeckSummary> {
    const did = deckId(deckIdStr);
    const deck = await this.deckStore.get(did);
    if (!deck) {
      throw new DeckNotFoundError(deckIdStr);
    }

    const slides = await this.slideStore.getByDeck(did);
    const revisions = await this.deckStore.getRevisions(did);

    // Sort slides by position
    const sortedSlides = slides.sort((a, b) => a.position - b.position);

    const slideSummaries: SlideSummary[] = sortedSlides.map((slide) => ({
      id: slide.id,
      position: slide.position,
      title: slide.metadata.title,
      type: slide.metadata.type,
      isValid: slide.lastValidation?.passed ?? true,
      ...(slide.lastValidation?.styleScore
        ? { styleScore: slide.lastValidation.styleScore.overall }
        : {}),
    }));

    return {
      id: deck.id,
      soulId: deck.soulId,
      title: deck.title,
      author: deck.author,
      slideCount: deck.slideIds.length,
      slides: slideSummaries,
      revisionCount: revisions.length,
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
    };
  }

  // ── Private Helpers ──────────────────────────────────────────────

  /**
   * Update the position field on slides from `startIndex` onward.
   */
  private async reindexPositions(
    slideIds: SlideId[],
    _did: DeckId,
    startIndex: number,
  ): Promise<void> {
    for (let i = startIndex; i < slideIds.length; i++) {
      const slide = await this.slideStore.get(slideIds[i]);
      if (slide) {
        slide.position = i;
        slide.metadata.position = i;
        await this.slideStore.save(slide);
      }
    }
  }

  /**
   * Collect the HTML of all slides for a deck in order, for content hashing.
   */
  private async collectSlideHtmls(
    _did: DeckId,
    slideIds: SlideId[],
  ): Promise<string[]> {
    const htmls: string[] = [];
    for (const sid of slideIds) {
      const slide = await this.slideStore.get(sid);
      if (slide) {
        htmls.push(slide.html);
      }
    }
    return htmls;
  }
}
