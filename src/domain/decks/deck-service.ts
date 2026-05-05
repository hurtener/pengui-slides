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
  getFormat,
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
import {
  compileSlideIRToHtml,
  duplicateNodeAtPath,
  insertNodeAtPath,
  lintNodesForMode,
  moveNodeAtPath,
  removeNodeAtPath,
  replaceNodeAtPath,
  setNodeFieldAtPath,
  type IRPath,
} from '../ir/index.js';
import { resolveChartRefs } from '../rendering/chart-resolver.js';
import { buildFontFaceCss } from '../souls/font-registry.js';
import type { SlideNode, DeckChrome } from '../ir/index.js';
import { ErrorCode, PenguiError } from '../../types/errors.js';
import { MetadataEmbedder } from '../metadata/metadata-embedder.js';

/**
 * v4.14: derive the chrome-related compile args for a slide at a given
 * position within a deck. Centralises the cover-suppression rule
 * (showOnCover === false at position 0 → no chrome) so both addSlide
 * and updateSlide stay in sync.
 *
 * Returns an object the caller spreads into compileSlideIRToHtml. When
 * the deck has no chrome configured, returns the empty subset (the
 * compiler treats `chrome === undefined` as "no chrome").
 *
 * `slidePosition` is the 0-indexed position; the chrome renderer adds 1
 * for human display.
 */
function chromeArgsFor(
  deck: Pick<Deck, 'chrome'>,
  slidePosition: number,
  totalSlideCount: number,
): {
  chrome?: DeckChrome;
  slidePosition?: number;
  slideCount?: number;
} {
  const chrome = deck.chrome;
  if (!chrome) return {};
  const isCover = slidePosition === 0;
  if (isCover && chrome.showOnCover !== true) return {};
  return {
    chrome,
    slidePosition: slidePosition + 1,
    slideCount: totalSlideCount,
  };
}

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
  private readonly metadataEmbedder = new MetadataEmbedder();

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

    const modeIssues = lintNodesForMode(input.ir.body, 'slide');
    if (modeIssues.length > 0) {
      throw new PenguiError(
        ErrorCode.SLIDE_INVALID_HTML,
        `Slide IR contains doc-only nodes: ${modeIssues
          .map((m) => `${m.path} (${m.nodeType})`)
          .join(', ')}. ${modeIssues[0].message}`,
      );
    }

    const soul = await this.soulStore.get(deck.soulId);
    if (!soul) {
      throw new SoulNotFoundError(deck.soulId as string);
    }

    const now = this.clock.now();
    const position = input.position ?? deck.slideIds.length;

    // v4.5: compile the IR to HTML deterministically. Soul tokens flow
    // in via the compiler emitting var() references; no post-emit
    // substitution required.
    // v4.14: thread deck.chrome through the compiler. Cover suppression
    // (showOnCover === false at position 0) is decided by chromeArgsFor.
    // The post-add slide count for position-N math is `position + 1`
    // when this slide is being appended; for non-trailing inserts the
    // existing count grows by 1 too. Either way: deck.slideIds.length + 1.
    const geometry = getFormat(deck.format ?? DEFAULT_FORMAT).geometry;
    const chromeArgs = chromeArgsFor(deck, position, deck.slideIds.length + 1);
    // v4.15: inject @font-face data: URIs for bundled fonts the soul
    // references. Empty string when soul uses only system fonts.
    const fontFaceCss = buildFontFaceCss(soul);
    const rawHtml = compileSlideIRToHtml({ ir: input.ir, soul, geometry, fontFaceCss, ...chromeArgs });
    // v4.12: swap chart placeholders for real ECharts SVG. No-op when
    // the slide has no chart nodes.
    const compiledHtml = resolveChartRefs(rawHtml, soul.layers);

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
      revisionHash: sha256(compiledHtml),
    };

    // Embed @slide-meta into the compiled HTML so validators / exporters
    // see the canonical metadata block — same contract as legacy slides.
    const embeddedHtml = this.metadataEmbedder.embed(compiledHtml, metadata);

    const slide: Slide = {
      id: generateSlideId(),
      deckId: deck.id,
      position,
      ir: input.ir,
      html: embeddedHtml,
      sourceKind: 'authored_ir',
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

    // v4.5: when IR changes, recompile HTML and refresh revisionHash.
    let recompiled = false;
    if (input.ir !== undefined) {
      const modeIssues = lintNodesForMode(input.ir.body, 'slide');
      if (modeIssues.length > 0) {
        throw new PenguiError(
          ErrorCode.SLIDE_INVALID_HTML,
          `Slide IR contains doc-only nodes: ${modeIssues
            .map((m) => `${m.path} (${m.nodeType})`)
            .join(', ')}. ${modeIssues[0].message}`,
        );
      }
      const soul = await this.soulStore.get(deck.soulId);
      if (!soul) {
        throw new SoulNotFoundError(deck.soulId as string);
      }
      const geometry = getFormat(deck.format ?? DEFAULT_FORMAT).geometry;
      // v4.14: thread chrome through the recompile path too, otherwise
      // updating a slide's IR would silently strip chrome on next render.
      const chromeArgs = chromeArgsFor(deck, slide.position, deck.slideIds.length);
      const fontFaceCss = buildFontFaceCss(soul);
      slide.ir = input.ir;
      slide.html = resolveChartRefs(
        compileSlideIRToHtml({ ir: input.ir, soul, geometry, fontFaceCss, ...chromeArgs }),
        soul.layers,
      );
      slide.metadata.revisionHash = sha256(slide.html);
      recompiled = true;
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

    // Re-embed @slide-meta whenever IR or metadata changed so the
    // canonical comment stays in sync with both. Validation looks for it.
    if (recompiled || input.metadata) {
      slide.html = this.metadataEmbedder.embed(slide.html, slide.metadata);
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

  // ── apply_slide_node_edit (v4.6) ────────────────────────────────

  /**
   * Replace a single node inside a slide's IR tree at the given path,
   * then recompile + revalidate. Lets the agent / App make targeted
   * edits without resubmitting the full body. The slide must be
   * authored_ir; legacy_html slides have no IR to mutate.
   *
   * Path semantics: `["body", i, ...]` — see `replaceNodeAtPath` for
   * the full grammar. Throws INVALID_INPUT for malformed paths or for
   * replacements that violate the leaf-only rule inside two_column.
   */
  async applySlideNodeEdit(input: {
    deckId: string;
    slideId: string;
    path: IRPath;
    newNode: SlideNode;
  }): Promise<Slide> {
    const sid = slideId(input.slideId);
    const existing = await this.slideStore.get(sid);
    if (!existing) {
      throw new SlideNotFoundError(input.slideId);
    }
    if (existing.sourceKind !== 'authored_ir' || !existing.ir) {
      throw new SlideNotFoundError(
        `Slide "${input.slideId}" has no IR (sourceKind=${existing.sourceKind}); apply_slide_node_edit only works on IR-authored slides.`,
      );
    }
    const nextIR = replaceNodeAtPath(existing.ir, input.path, input.newNode);
    return this.updateSlide({
      deckId: input.deckId,
      slideId: input.slideId,
      ir: nextIR,
    });
  }

  // ── v4.9 structural ops ─────────────────────────────────────────
  //
  // Each op recompiles the IR via the existing updateSlide pipeline so
  // mode-aware lint, validation, and revision tracking all run as
  // normal. Pin migration (rewriting comment ir_paths to follow shifted
  // siblings or moved subtrees) is performed by the MCP tool layer
  // after the service call returns — keeps DeckService free of a
  // CommentService dependency and the cycle that would create.

  /** Insert a node into a slide's IR. Indices ≥ position shift up by 1. */
  async insertSlideNode(input: {
    deckId: string;
    slideId: string;
    parentPath: IRPath;
    position: number;
    newNode: SlideNode;
  }): Promise<Slide> {
    const existing = await this.requireAuthoredIRSlide(input.slideId);
    const nextIR = insertNodeAtPath(existing.ir!, input.parentPath, input.position, input.newNode);
    return this.updateSlide({
      deckId: input.deckId,
      slideId: input.slideId,
      ir: nextIR,
    });
  }

  /** Remove a node. Indices > removed index shift down by 1. */
  async removeSlideNode(input: {
    deckId: string;
    slideId: string;
    path: IRPath;
  }): Promise<Slide> {
    const existing = await this.requireAuthoredIRSlide(input.slideId);
    const nextIR = removeNodeAtPath(existing.ir!, input.path);
    return this.updateSlide({
      deckId: input.deckId,
      slideId: input.slideId,
      ir: nextIR,
    });
  }

  /** Duplicate a node; clone lands at `position ?? sourceIndex + 1`. */
  async duplicateSlideNode(input: {
    deckId: string;
    slideId: string;
    path: IRPath;
    position?: number;
  }): Promise<Slide> {
    const existing = await this.requireAuthoredIRSlide(input.slideId);
    const nextIR = duplicateNodeAtPath(existing.ir!, input.path, input.position);
    return this.updateSlide({
      deckId: input.deckId,
      slideId: input.slideId,
      ir: nextIR,
    });
  }

  /** Move a node within or across containers. Returns the new path. */
  async moveSlideNode(input: {
    deckId: string;
    slideId: string;
    fromPath: IRPath;
    toParentPath: IRPath;
    toPosition: number;
  }): Promise<{ slide: Slide; newPath: IRPath }> {
    const existing = await this.requireAuthoredIRSlide(input.slideId);
    const { root: nextIR, newPath } = moveNodeAtPath(
      existing.ir!,
      input.fromPath,
      input.toParentPath,
      input.toPosition,
    );
    const slide = await this.updateSlide({
      deckId: input.deckId,
      slideId: input.slideId,
      ir: nextIR,
    });
    return { slide, newPath };
  }

  /**
   * v4.9c — write one named field of an IR node. The MCP App calls
   * this when the user finishes editing a `[data-ir-rt-field]`
   * element inline. Field grammar mirrors `setNodeFieldAtPath`:
   * `"title"` for a top-level field, `"items[2]"` for an array slot.
   */
  async applySlideFieldEdit(input: {
    deckId: string;
    slideId: string;
    path: IRPath;
    field: string;
    value: unknown;
  }): Promise<Slide> {
    const existing = await this.requireAuthoredIRSlide(input.slideId);
    const nextIR = setNodeFieldAtPath(existing.ir!, input.path, input.field, input.value);
    return this.updateSlide({
      deckId: input.deckId,
      slideId: input.slideId,
      ir: nextIR,
    });
  }

  /**
   * v4.10: bulk-insert N nodes contiguously into one container, with
   * a single updateSlide / lint at the end. Used by `compile_markdown`
   * when called with a target — avoids the agent having to echo the
   * compiled IR through context and replay N insert tool calls.
   *
   * Each subsequent node lands at `position + i`; the IR mutation
   * runs on the in-memory clone N times, then the slide is recompiled
   * + revalidated once.
   */
  async insertSlideNodesBulk(input: {
    deckId: string;
    slideId: string;
    parentPath: IRPath;
    position: number;
    nodes: ReadonlyArray<SlideNode>;
  }): Promise<{ slide: Slide; insertedPaths: IRPath[] }> {
    const existing = await this.requireAuthoredIRSlide(input.slideId);
    let nextIR = existing.ir!;
    const insertedPaths: IRPath[] = [];
    for (let i = 0; i < input.nodes.length; i += 1) {
      const at = input.position + i;
      nextIR = insertNodeAtPath(nextIR, input.parentPath, at, input.nodes[i]);
      insertedPaths.push([...input.parentPath, at]);
    }
    const slide = await this.updateSlide({
      deckId: input.deckId,
      slideId: input.slideId,
      ir: nextIR,
    });
    return { slide, insertedPaths };
  }

  private async requireAuthoredIRSlide(slideIdStr: string): Promise<Slide> {
    const sid = slideId(slideIdStr);
    const existing = await this.slideStore.get(sid);
    if (!existing) {
      throw new SlideNotFoundError(slideIdStr);
    }
    if (existing.sourceKind !== 'authored_ir' || !existing.ir) {
      throw new PenguiError(
        ErrorCode.SLIDE_INVALID_HTML,
        `Slide "${slideIdStr}" has no IR (sourceKind=${existing.sourceKind}); structural ops require IR-authored slides.`,
      );
    }
    return existing;
  }

  // ── Recompile slides for a soul (v4.6) ──────────────────────────

  /**
   * Recompile every IR-authored slide that lives in a deck linked to
   * `soulId`. Used by `apply_token_override` to propagate a token change
   * through every existing slide so the App's preview / exports reflect
   * the new value. Only authored_ir slides are touched — legacy_html
   * slides keep their stored HTML unchanged.
   *
   * Returns counts so the caller can report how much work happened.
   * Failures are collected, not thrown — one bad slide should not abort
   * the whole token override.
   */
  async recompileSlidesForSoul(soulIdArg: import('../../types/common.js').SoulId): Promise<{
    recompiledCount: number;
    skippedCount: number;
    failures: Array<{ slideId: string; deckId: string; error: string }>;
  }> {
    const allDecks = await this.deckStore.list();
    const affectedDecks = allDecks.filter(
      (d) => (d.soulId as string) === (soulIdArg as string)
        && DeckService.resolveAuthoringModel(d) === 'slides',
    );

    let recompiledCount = 0;
    let skippedCount = 0;
    const failures: Array<{ slideId: string; deckId: string; error: string }> = [];

    for (const deck of affectedDecks) {
      const slides = await this.slideStore.getByDeck(deck.id);
      for (const slide of slides) {
        if (slide.sourceKind !== 'authored_ir' || !slide.ir) {
          skippedCount += 1;
          continue;
        }
        try {
          await this.updateSlide({
            deckId: deck.id as string,
            slideId: slide.id as string,
            ir: slide.ir,
          });
          recompiledCount += 1;
        } catch (err) {
          failures.push({
            slideId: slide.id as string,
            deckId: deck.id as string,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    this.logger.info('Recompiled slides for soul token change', {
      soulId: soulIdArg as string,
      recompiledCount,
      skippedCount,
      failureCount: failures.length,
    });

    return { recompiledCount, skippedCount, failures };
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
      ...(deck.chrome ? { chrome: deck.chrome } : {}),
      createdAt: deck.createdAt,
      updatedAt: deck.updatedAt,
    };
  }

  /**
   * Lightweight deck list for the v4 workspace UI + agent-facing `list_decks`.
   * One entry per deck; no HTML, no revisions, no slide/section detail.
   */
  async listDecks(): Promise<Array<{
    id: DeckId;
    slug: string;
    soulId: string;
    soulSlug: string;
    title: string;
    author: string;
    format: FormatKind;
    authoringModel: AuthoringModel;
    slideCount: number;
    sectionCount: number;
    createdAt: string;
    updatedAt: string;
  }>> {
    const decks = await this.deckStore.list();
    // Sort newest first.
    decks.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return Promise.all(
      decks.map(async (deck) => ({
        id: deck.id,
        slug: deck.slug ?? (await this.slugFor(deck.id)) ?? '',
        soulId: deck.soulId as string,
        soulSlug: (await this.soulService.slugFor(deck.soulId)) ?? '',
        title: deck.title,
        author: deck.author,
        format: deck.format ?? DEFAULT_FORMAT,
        authoringModel: DeckService.resolveAuthoringModel(deck),
        slideCount: deck.slideIds.length,
        sectionCount: (deck.sectionIds ?? []).length,
        createdAt: deck.createdAt,
        updatedAt: deck.updatedAt,
      })),
    );
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
