/**
 * Deck Service for Pengui Slides.
 *
 * Manages the full deck lifecycle: creation, slide CRUD, reordering,
 * and summary generation. Every mutation produces an immutable revision
 * entry via the RevisionTracker.
 */

import type { DeckId, SlideId } from '../../types/common.js';
import { slideId } from '../../types/common.js';
import type {
  Deck,
  Slide,
  DeckSummary,
  SlideSummary,
  CreateDeckInput,
  AddSlideInput,
  UpdateSlideInput,
  AuthoringModel,
} from '../../types/deck.js';
import type { SectionSummary } from '../../types/section.js';
import type { FormatKind } from '../../types/format.js';
import {
  DEFAULT_FORMAT,
  assertKnownFormat,
  defaultAuthoringModelFor,
} from '../formats/format-registry.js';
import type { SlideMetadata, SlideType } from '../../types/metadata.js';
import {
  DeckNotFoundError,
  SlideNotFoundError,
  SoulNotFoundError,
  WrongAuthoringModelError,
} from '../../types/errors.js';
import type {
  IDeckStore,
  ISlideStore,
  ISectionStore,
  ISoulStore,
} from '../../storage/interfaces.js';
import {
  generateDeckId,
  generateSlideId,
  sha256,
  type Clock,
} from '../../infrastructure/index.js';
import type { Logger } from '../../infrastructure/index.js';
import { RevisionTracker } from './revision-tracker.js';
import { SlugIndex } from '../_shared/slug-index.js';
import type { SoulService } from '../souls/soul-service.js';

export class DeckService {
  private readonly deckStore: IDeckStore;
  private readonly slideStore: ISlideStore;
  private readonly sectionStore: ISectionStore;
  private readonly soulStore: ISoulStore;
  private readonly soulService: SoulService;
  private readonly clock: Clock;
  private readonly logger: Logger;
  private readonly revisionTracker: RevisionTracker;
  private readonly slugIndex: SlugIndex<DeckId>;

  constructor(
    deckStore: IDeckStore,
    slideStore: ISlideStore,
    sectionStore: ISectionStore,
    soulStore: ISoulStore,
    soulService: SoulService,
    clock: Clock,
    logger: Logger,
  ) {
    this.deckStore = deckStore;
    this.slideStore = slideStore;
    this.sectionStore = sectionStore;
    this.soulStore = soulStore;
    this.soulService = soulService;
    this.clock = clock;
    this.logger = logger;
    this.revisionTracker = new RevisionTracker(clock);
    this.slugIndex = new SlugIndex<DeckId>(
      async () => {
        const all = await this.deckStore.list();
        return all.map((d) => ({ id: d.id, slug: d.slug, slugSource: d.title }));
      },
      async (id, slug) => {
        const deck = await this.deckStore.get(id);
        if (deck && !deck.slug) {
          deck.slug = slug;
          await this.deckStore.save(deck);
        }
      },
    );
  }

  /** Resolve a UUID or slug to a DeckId, or undefined if unknown. */
  async resolveRef(ref: string): Promise<DeckId | undefined> {
    const resolved = await this.slugIndex.resolve(ref);
    if (resolved) return resolved;
    const deck = await this.deckStore.get(ref as DeckId);
    return deck ? deck.id : undefined;
  }

  /** Resolve a UUID or slug to a DeckId, throwing if unknown. */
  async resolveRefOrThrow(ref: string): Promise<DeckId> {
    const id = await this.resolveRef(ref);
    if (!id) throw new DeckNotFoundError(ref);
    return id;
  }

  /** Slug for a known deck id (may trigger backfill on first access). */
  async slugFor(id: DeckId): Promise<string | undefined> {
    return this.slugIndex.slugFor(id);
  }

  // ── Authoring model helpers ──────────────────────────────────────

  /**
   * Legacy-safe reader: returns the deck's authoring model, defaulting
   * missing values to 'slides' (pre-v3 decks never had this field and
   * were, historically, slides_16_9 or legacy slide-per-page print — both
   * of which render through the slides pipeline).
   */
  static resolveAuthoringModel(deck: Deck): AuthoringModel {
    return deck.authoringModel ?? 'slides';
  }

  /**
   * Guard used by slide verbs (add_slide, update_slide, ...) to refuse
   * operating on document-model decks. Names the correct tool so the
   * caller (an LLM) can recover without re-exploring the API.
   */
  private assertSlidesModel(deck: Deck, suggestedTool: string): void {
    const model = DeckService.resolveAuthoringModel(deck);
    if (model === 'document') {
      throw new WrongAuthoringModelError(
        deck.id as string,
        'slides',
        'document',
        suggestedTool,
        'pengui://docs/document-mode',
      );
    }
  }

  /**
   * Guard used by section verbs (add_section, update_section, ...) to
   * refuse operating on slide-model decks.
   */
  assertDocumentModel(deck: Deck, suggestedTool: string): void {
    const model = DeckService.resolveAuthoringModel(deck);
    if (model === 'slides') {
      throw new WrongAuthoringModelError(
        deck.id as string,
        'document',
        'slides',
        suggestedTool,
        'pengui://docs/print-mode',
      );
    }
  }

  // ── Create Deck ──────────────────────────────────────────────────

  /**
   * Create a new empty deck linked to a Design Soul.
   *
   * @throws SoulNotFoundError if the referenced soul does not exist.
   */
  async createDeck(input: CreateDeckInput): Promise<Deck> {
    const sid = await this.soulService.resolveRefOrThrow(input.soulId);
    const soul = await this.soulStore.get(sid);
    if (!soul) {
      throw new SoulNotFoundError(input.soulId);
    }

    const now = this.clock.now();
    const format: FormatKind = input.format ?? DEFAULT_FORMAT;
    assertKnownFormat(format);
    const authoringModel: AuthoringModel =
      input.authoringModel ?? defaultAuthoringModelFor(format);
    const id = generateDeckId();
    const title = input.title ?? 'Untitled Deck';
    const slug = await this.slugIndex.pickForNew(title);
    const deck: Deck = {
      id,
      slug,
      soulId: sid,
      title,
      author: input.author ?? '',
      slideIds: [],
      sectionIds: [],
      format,
      authoringModel,
      createdAt: now,
      updatedAt: now,
    };

    await this.deckStore.save(deck);
    this.slugIndex.register(slug, id);

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
    const did = await this.resolveRefOrThrow(input.deckId);
    const deck = await this.deckStore.get(did);
    if (!deck) {
      throw new DeckNotFoundError(input.deckId);
    }
    this.assertSlidesModel(deck, 'add_section');

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
      sourceKind: 'legacy_html',
      translationIssues: [],
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
    const did = await this.resolveRefOrThrow(input.deckId);
    const sid = slideId(input.slideId);

    const deck = await this.deckStore.get(did);
    if (!deck) {
      throw new DeckNotFoundError(input.deckId);
    }
    this.assertSlidesModel(deck, 'update_section');

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

    if (input.sourceKind !== undefined) {
      slide.sourceKind = input.sourceKind;
    }

    if (input.document !== undefined) {
      slide.document = input.document;
    }

    if (input.translationIssues !== undefined) {
      slide.translationIssues = input.translationIssues;
      if (input.translationIssues.length > 0 && input.document === undefined) {
        delete slide.document;
      }
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
    const did = await this.resolveRefOrThrow(deckIdStr);
    const sid = slideId(slideIdStr);

    const deck = await this.deckStore.get(did);
    if (!deck) {
      throw new DeckNotFoundError(deckIdStr);
    }
    this.assertSlidesModel(deck, 'remove_section');

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
    const did = await this.resolveRefOrThrow(deckIdStr);
    const deck = await this.deckStore.get(did);
    if (!deck) {
      throw new DeckNotFoundError(deckIdStr);
    }
    this.assertSlidesModel(deck, 'reorder_sections');

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
    const did = await this.resolveRefOrThrow(deckIdStr);
    const deck = await this.deckStore.get(did);
    if (!deck) {
      throw new DeckNotFoundError(deckIdStr);
    }

    const slides = await this.slideStore.getByDeck(did);
    const sections = await this.sectionStore.getByDeck(did);
    const revisions = await this.deckStore.getRevisions(did);

    // Sort by position
    const sortedSlides = slides.sort((a, b) => a.position - b.position);
    const sortedSections = sections.sort((a, b) => a.position - b.position);

    const slideSummaries: SlideSummary[] = sortedSlides.map((slide) => ({
      id: slide.id,
      position: slide.position,
      title: slide.metadata.title,
      type: slide.metadata.type,
      isValid: slide.lastValidation?.passed ?? false,
      ...(slide.lastValidation?.styleScore
        ? { styleScore: slide.lastValidation.styleScore.overall }
        : {}),
    }));

    const sectionSummaries: SectionSummary[] = sortedSections.map((section) => ({
      id: section.id,
      position: section.position,
      kind: section.kind,
      title: section.metadata.title,
      isValid: section.lastValidation?.passed ?? false,
      ...(section.lastValidation?.styleScore
        ? { styleScore: section.lastValidation.styleScore.overall }
        : {}),
    }));

    const deckSlug = deck.slug ?? (await this.slugFor(deck.id)) ?? '';
    const soulSlug = (await this.soulService.slugFor(deck.soulId)) ?? '';

    return {
      id: deck.id,
      slug: deckSlug,
      soulId: deck.soulId,
      soulSlug,
      title: deck.title,
      author: deck.author,
      format: deck.format ?? DEFAULT_FORMAT,
      authoringModel: DeckService.resolveAuthoringModel(deck),
      slideCount: deck.slideIds.length,
      slides: slideSummaries,
      sectionCount: (deck.sectionIds ?? []).length,
      sections: sectionSummaries,
      revisionCount: revisions.length,
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
    };
  }

  /**
   * Legacy-safe reader that returns a deck's authoring model without
   * callers needing to read the full deck. Returns 'slides' for any
   * pre-v3 deck that lacks the field.
   */
  async getAuthoringModel(deckIdStr: string): Promise<AuthoringModel> {
    const did = await this.resolveRefOrThrow(deckIdStr);
    const deck = await this.deckStore.get(did);
    if (!deck) {
      throw new DeckNotFoundError(deckIdStr);
    }
    return DeckService.resolveAuthoringModel(deck);
  }

  /**
   * Resolve a deck's format, defaulting to slides_16_9 for legacy decks
   * that were created before the format field existed.
   *
   * @throws DeckNotFoundError if the deck does not exist.
   */
  async getDeckFormat(deckIdStr: string): Promise<FormatKind> {
    const did = await this.resolveRefOrThrow(deckIdStr);
    const deck = await this.deckStore.get(did);
    if (!deck) {
      throw new DeckNotFoundError(deckIdStr);
    }
    return deck.format ?? DEFAULT_FORMAT;
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
