/**
 * Document Service for Pengui Slides (continuous-document mode).
 *
 * Mirrors DeckService for document-model decks: creates, updates, and
 * reorders Sections (HTML fragments) inside a deck, and maintains the
 * deck's `sectionIds` ordering + `documentMeta`. Every mutation produces
 * a DeckRevision via a dedicated RevisionTracker.
 *
 * See SPEC-v3.md for the full design.
 */

import type { DeckId, SectionId } from '../../types/common.js';
import { sectionId } from '../../types/common.js';
import type { Deck, DocumentMeta } from '../../types/deck.js';
import type {
  Section,
  SectionMetadata,
  AddSectionInput,
  UpdateSectionInput,
} from '../../types/section.js';
import {
  DeckNotFoundError,
  SectionNotFoundError,
  WrongAuthoringModelError,
} from '../../types/errors.js';
import type { IDeckStore, ISectionStore, ISoulStore } from '../../storage/interfaces.js';
import {
  generateSectionId,
  sha256,
  type Clock,
} from '../../infrastructure/index.js';
import type { Logger } from '../../infrastructure/index.js';
import { DeckService } from '../decks/deck-service.js';
import { RevisionTracker } from '../decks/revision-tracker.js';
import { embedSectionMeta } from './section-meta-embedder.js';
import {
  promoteRootToSection,
  summarizeTopLevelElements,
  wrapRootsInSection,
  type TopLevelElementSummary,
} from './section-wrapper-ops.js';
import {
  buildSoulTokenLookups,
  substituteSoulTokens,
  type SoulTokenLookups,
  type TokenSubstitution,
} from '../souls/index.js';

export class DocumentService {
  private readonly deckStore: IDeckStore;
  private readonly sectionStore: ISectionStore;
  private readonly soulStore: ISoulStore;
  private readonly deckService: DeckService;
  private readonly clock: Clock;
  private readonly logger: Logger;
  private readonly revisionTracker: RevisionTracker;

  constructor(
    deckStore: IDeckStore,
    sectionStore: ISectionStore,
    soulStore: ISoulStore,
    deckService: DeckService,
    clock: Clock,
    logger: Logger,
    revisionTracker?: RevisionTracker,
  ) {
    this.deckStore = deckStore;
    this.sectionStore = sectionStore;
    this.soulStore = soulStore;
    this.deckService = deckService;
    this.clock = clock;
    this.logger = logger;
    this.revisionTracker = revisionTracker ?? new RevisionTracker(clock);
  }

  /**
   * Build the soul's reverse lookups (color + spacing + radius) for
   * auto-substitution. Returns empty maps (which makes substituteSoulTokens
   * a no-op) when the soul is missing — defensive, since add/update would
   * have failed earlier in normal flow if the soul were genuinely gone.
   */
  private async tokenLookupsForDeck(deck: Deck): Promise<SoulTokenLookups> {
    const soul = await this.soulStore.get(deck.soulId);
    if (!soul) return { color: new Map(), spacing: new Map(), radius: new Map(), font: new Map() };
    return buildSoulTokenLookups(soul.layers);
  }

  /** Resolve a UUID or slug to a DeckId. Delegates to DeckService. */
  private async resolveDeckRef(ref: string): Promise<DeckId> {
    return this.deckService.resolveRefOrThrow(ref);
  }

  // ── Authoring-model guard ────────────────────────────────────────

  /**
   * Inline document-mode guard. DocumentService does not hold a reference
   * to DeckService, so it re-implements the guard using the static helper
   * and throws `WrongAuthoringModelError` directly.
   */
  private assertDocumentModel(deck: Deck, suggestedTool: string): void {
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

  // ── Add Section ──────────────────────────────────────────────────

  /**
   * Add a new section (content block) to a document-model deck.
   *
   * Auto-fills provenance metadata (generatedAt, soulId, deckId, position,
   * metaVersion='3.0', revisionHash) mirroring DeckService.addSlide.
   *
   * Also runs `substituteSoulTokens` against the active soul's token
   * lookups (color + spacing + radius) before persisting: any literal that
   * exactly matches a soul token is rewritten to `var(--token)`, and the
   * change set is returned so callers can echo it to the agent. The agent
   * learns the substitution from the response and emits the var() form on
   * the next turn.
   *
   * @throws DeckNotFoundError if the deck does not exist.
   * @throws WrongAuthoringModelError if the deck is slides-mode.
   */
  async addSection(
    input: AddSectionInput,
  ): Promise<{ section: Section; substitutions: TokenSubstitution[] }> {
    const did = await this.resolveDeckRef(input.deckId);
    const deck = await this.deckStore.get(did);
    if (!deck) {
      throw new DeckNotFoundError(input.deckId);
    }
    this.assertDocumentModel(deck, 'add_slide');

    const now = this.clock.now();
    const currentSectionIds = deck.sectionIds ?? [];
    const position = input.position ?? currentSectionIds.length;

    // Auto-substitute soul-known token literals (color, spacing, radius)
    // BEFORE building the meta hash, so the hash reflects what is actually
    // stored. Any literal the soul does not declare passes through
    // untouched and falls to the relevant compliance check at validation
    // time.
    const lookups = await this.tokenLookupsForDeck(deck);
    const sub = substituteSoulTokens(input.html, lookups);
    const sourceHtml = sub.html;

    const metadata: SectionMetadata = {
      title: input.metadata.title,
      kind: input.kind,
      narrative: input.metadata.narrative,
      ...(input.metadata.keyPoints ? { keyPoints: input.metadata.keyPoints } : {}),
      ...(input.metadata.tags ? { tags: input.metadata.tags } : {}),
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
      ...(input.metadata.chromeOverrides
        ? { chromeOverrides: { ...input.metadata.chromeOverrides } }
        : {}),

      // Auto-filled provenance
      generatedAt: now,
      soulId: deck.soulId as string,
      deckId: deck.id as string,
      position,
      metaVersion: '3.0',
      revisionHash: sha256(sourceHtml),
    };

    // `metadata.revisionHash` hashes the post-substitution HTML so the
    // hash matches what is stored. The stored HTML additionally carries
    // the embedded `@section-meta` comment so round-trip consumers
    // (exports, MCP App previews) see valid provenance without the agent
    // having to emit it.
    const embeddedHtml = embedSectionMeta(sourceHtml, metadata);

    const section: Section = {
      id: generateSectionId(),
      deckId: deck.id,
      position,
      html: embeddedHtml,
      kind: input.kind,
      breakHints: { ...(input.breakHints ?? {}) },
      metadata,
      createdAt: now,
      updatedAt: now,
    };

    // Insert the section ID at the correct position
    const updatedSectionIds = [...currentSectionIds];
    updatedSectionIds.splice(position, 0, section.id);

    // Persist the new section before reindexing (reindex reads existing rows).
    await this.sectionStore.save(section);

    // Reindex positions for sections after the insertion point
    await this.reindexPositions(updatedSectionIds, deck.id, position + 1);

    // Update deck
    deck.sectionIds = updatedSectionIds;
    deck.updatedAt = now;
    await this.deckStore.save(deck);

    // Record revision
    const allHtmls = await this.collectSectionHtmls(deck.id, updatedSectionIds);
    const revision = this.revisionTracker.createRevision({
      deckId: deck.id,
      type: 'section_added',
      description: `Section "${metadata.title}" added at position ${position}`,
      slideIdsSnapshot: [],
      slideHtmls: [],
      sectionIdsSnapshot: updatedSectionIds,
      sectionHtmls: allHtmls,
    });
    await this.deckStore.addRevision(revision);

    this.logger.info('Section added', {
      deckId: deck.id,
      sectionId: section.id,
      position,
      autoSubstitutions: sub.substitutions.length,
    });
    return { section, substitutions: sub.substitutions };
  }

  // ── Update Section ───────────────────────────────────────────────

  /**
   * Update a section's HTML / kind / break hints / metadata.
   *
   * When `input.html` is supplied, soul-known token literals (color,
   * spacing, radius) are auto-substituted before persisting (same logic as
   * `addSection`). The substitution log is returned alongside the updated
   * section.
   *
   * @throws DeckNotFoundError if the deck does not exist.
   * @throws SectionNotFoundError if the section does not exist.
   * @throws WrongAuthoringModelError if the deck is slides-mode.
   */
  async updateSection(
    input: UpdateSectionInput,
  ): Promise<{ section: Section; substitutions: TokenSubstitution[] }> {
    const did = await this.resolveDeckRef(input.deckId);
    const sid = sectionId(input.sectionId);

    const deck = await this.deckStore.get(did);
    if (!deck) {
      throw new DeckNotFoundError(input.deckId);
    }
    this.assertDocumentModel(deck, 'update_slide');

    const section = await this.sectionStore.get(sid);
    if (!section || (section.deckId as string) !== (did as string)) {
      throw new SectionNotFoundError(input.sectionId);
    }

    const now = this.clock.now();
    let htmlDirty = false;
    let metaDirty = false;
    let substitutions: TokenSubstitution[] = [];

    if (input.html !== undefined) {
      const lookups = await this.tokenLookupsForDeck(deck);
      const sub = substituteSoulTokens(input.html, lookups);
      substitutions = sub.substitutions;
      section.html = sub.html;
      section.metadata.revisionHash = sha256(sub.html);
      htmlDirty = true;
    }

    if (input.kind !== undefined) {
      section.kind = input.kind;
      section.metadata.kind = input.kind;
      metaDirty = true;
    }

    if (input.breakHints !== undefined) {
      section.breakHints = { ...section.breakHints, ...input.breakHints };
    }

    if (input.metadata) {
      const m = input.metadata;
      if (m.title !== undefined) section.metadata.title = m.title;
      if (m.narrative !== undefined) section.metadata.narrative = m.narrative;
      if (m.keyPoints !== undefined) section.metadata.keyPoints = m.keyPoints;
      if (m.tags !== undefined) section.metadata.tags = m.tags;
      if (m.sources !== undefined) {
        section.metadata.sources = m.sources.map((s) => ({
          ...(s.url ? { url: s.url } : {}),
          ...(s.title ? { title: s.title } : {}),
          ...(s.quoteSpan ? { quoteSpan: s.quoteSpan } : {}),
          ...(s.confidence !== undefined ? { confidence: s.confidence } : {}),
          ...(s.retrievedAt ? { retrievedAt: s.retrievedAt } : {}),
        }));
      }
      if (m.chromeOverrides !== undefined) {
        section.metadata.chromeOverrides = { ...m.chromeOverrides };
      }
      metaDirty = true;
    }

    if (input.lastValidation !== undefined) {
      section.lastValidation = input.lastValidation;
    }

    // Refresh the embedded `@section-meta` comment whenever HTML or any
    // metadata field changed. Also refresh when only metadata changed so
    // the stored comment stays in sync with the struct.
    if (htmlDirty || metaDirty) {
      section.html = embedSectionMeta(section.html, section.metadata);
    }

    section.updatedAt = now;
    await this.sectionStore.save(section);

    // Bump deck's updatedAt
    deck.updatedAt = now;
    await this.deckStore.save(deck);

    const sectionIds = deck.sectionIds ?? [];
    const allHtmls = await this.collectSectionHtmls(deck.id, sectionIds);
    const revision = this.revisionTracker.createRevision({
      deckId: deck.id,
      type: 'section_updated',
      description: `Section "${section.metadata.title}" updated`,
      slideIdsSnapshot: [],
      slideHtmls: [],
      sectionIdsSnapshot: sectionIds,
      sectionHtmls: allHtmls,
    });
    await this.deckStore.addRevision(revision);

    this.logger.info('Section updated', {
      deckId: deck.id,
      sectionId: section.id,
      autoSubstitutions: substitutions.length,
    });
    return { section, substitutions };
  }

  // ── Surgical wrapper repair (promote / wrap) ────────────────────
  //
  // These exist so agents can fix the two most common structural errors
  // (wrong root tag, multiple top-level elements) without re-emitting the
  // whole fragment. They're surfaced as MCP tools `promote_section_root`
  // and `wrap_section_root`; the structural validator's fix suggestions
  // name them directly.

  /**
   * Describe the top-level elements of a section fragment. Used by
   * `wrap_section_root` to echo back the structure so an agent can choose
   * a child ordering.
   */
  async listSectionTopLevelElements(
    deckRef: string,
    sectionIdStr: string,
  ): Promise<TopLevelElementSummary[]> {
    const did = await this.resolveDeckRef(deckRef);
    const sid = sectionId(sectionIdStr);
    const section = await this.sectionStore.get(sid);
    if (!section || (section.deckId as string) !== (did as string)) {
      throw new SectionNotFoundError(sectionIdStr);
    }
    return summarizeTopLevelElements(section.html);
  }

  /**
   * Promote a section's single root element into
   * `<section class="pengui-section pengui-{kind}">`, preserving attrs and
   * children. Throws if the fragment doesn't have exactly one top-level
   * element — callers should use `wrapSectionRoot` in that case.
   */
  async promoteSectionRoot(
    deckRef: string,
    sectionIdStr: string,
  ): Promise<Section> {
    const did = await this.resolveDeckRef(deckRef);
    const deck = await this.deckStore.get(did);
    if (!deck) throw new DeckNotFoundError(deckRef);
    this.assertDocumentModel(deck, 'update_slide');

    const sid = sectionId(sectionIdStr);
    const section = await this.sectionStore.get(sid);
    if (!section || (section.deckId as string) !== (did as string)) {
      throw new SectionNotFoundError(sectionIdStr);
    }

    const promoted = promoteRootToSection(section.html, section.kind);
    if (!promoted.changed) return section;

    section.html = embedSectionMeta(promoted.html, section.metadata);
    section.metadata.revisionHash = sha256(promoted.html);
    section.updatedAt = this.clock.now();

    await this.sectionStore.save(section);
    deck.updatedAt = section.updatedAt;
    await this.deckStore.save(deck);

    const sectionIds = deck.sectionIds ?? [];
    const allHtmls = await this.collectSectionHtmls(deck.id, sectionIds);
    const revision = this.revisionTracker.createRevision({
      deckId: deck.id,
      type: 'section_updated',
      description: `Section "${section.metadata.title}" root promoted to <section>`,
      slideIdsSnapshot: [],
      slideHtmls: [],
      sectionIdsSnapshot: sectionIds,
      sectionHtmls: allHtmls,
    });
    await this.deckStore.addRevision(revision);

    this.logger.info('Section root promoted', {
      deckId: deck.id,
      sectionId: section.id,
    });
    return section;
  }

  /**
   * Wrap every top-level element in a section fragment in a new
   * `<section class="pengui-section pengui-{kind}">`. Optional
   * `childOrder` reorders top-level elements by their original indices.
   */
  async wrapSectionRoot(
    deckRef: string,
    sectionIdStr: string,
    childOrder?: number[],
  ): Promise<Section> {
    const did = await this.resolveDeckRef(deckRef);
    const deck = await this.deckStore.get(did);
    if (!deck) throw new DeckNotFoundError(deckRef);
    this.assertDocumentModel(deck, 'update_slide');

    const sid = sectionId(sectionIdStr);
    const section = await this.sectionStore.get(sid);
    if (!section || (section.deckId as string) !== (did as string)) {
      throw new SectionNotFoundError(sectionIdStr);
    }

    const wrapped = wrapRootsInSection(section.html, section.kind, childOrder);
    if (!wrapped.changed) return section;

    section.html = embedSectionMeta(wrapped.html, section.metadata);
    section.metadata.revisionHash = sha256(wrapped.html);
    section.updatedAt = this.clock.now();

    await this.sectionStore.save(section);
    deck.updatedAt = section.updatedAt;
    await this.deckStore.save(deck);

    const sectionIds = deck.sectionIds ?? [];
    const allHtmls = await this.collectSectionHtmls(deck.id, sectionIds);
    const revision = this.revisionTracker.createRevision({
      deckId: deck.id,
      type: 'section_updated',
      description: `Section "${section.metadata.title}" top-level elements wrapped`,
      slideIdsSnapshot: [],
      slideHtmls: [],
      sectionIdsSnapshot: sectionIds,
      sectionHtmls: allHtmls,
    });
    await this.deckStore.addRevision(revision);

    this.logger.info('Section roots wrapped', {
      deckId: deck.id,
      sectionId: section.id,
    });
    return section;
  }

  // ── Get Section ──────────────────────────────────────────────────

  /**
   * Retrieve a single section by ID.
   *
   * @throws SectionNotFoundError if the section does not exist.
   */
  async getSection(id: string): Promise<Section> {
    const sid = sectionId(id);
    const section = await this.sectionStore.get(sid);
    if (!section) {
      throw new SectionNotFoundError(id);
    }
    return section;
  }

  // ── Remove Section ───────────────────────────────────────────────

  /**
   * Remove a section from its deck and delete it.
   *
   * @throws DeckNotFoundError if the deck does not exist.
   * @throws SectionNotFoundError if the section does not exist in the deck.
   * @throws WrongAuthoringModelError if the deck is slides-mode.
   */
  async removeSection(deckIdStr: string, sectionIdStr: string): Promise<void> {
    const did = await this.resolveDeckRef(deckIdStr);
    const sid = sectionId(sectionIdStr);

    const deck = await this.deckStore.get(did);
    if (!deck) {
      throw new DeckNotFoundError(deckIdStr);
    }
    this.assertDocumentModel(deck, 'remove_slide');

    const currentSectionIds = deck.sectionIds ?? [];
    const sectionIndex = currentSectionIds.findIndex(
      (id) => (id as string) === (sid as string),
    );
    if (sectionIndex === -1) {
      throw new SectionNotFoundError(sectionIdStr);
    }

    const now = this.clock.now();

    // Remove from deck's section list
    const updatedSectionIds = currentSectionIds.filter(
      (id) => (id as string) !== (sid as string),
    );

    // Delete first so reindex doesn't re-save the removed row
    await this.sectionStore.delete(sid);

    // Reindex positions for remaining sections
    await this.reindexPositions(updatedSectionIds, deck.id, sectionIndex);

    deck.sectionIds = updatedSectionIds;
    deck.updatedAt = now;
    await this.deckStore.save(deck);

    const allHtmls = await this.collectSectionHtmls(deck.id, updatedSectionIds);
    const revision = this.revisionTracker.createRevision({
      deckId: deck.id,
      type: 'section_removed',
      description: `Section removed from position ${sectionIndex}`,
      slideIdsSnapshot: [],
      slideHtmls: [],
      sectionIdsSnapshot: updatedSectionIds,
      sectionHtmls: allHtmls,
    });
    await this.deckStore.addRevision(revision);

    this.logger.info('Section removed', {
      deckId: deck.id,
      sectionId: sid,
      position: sectionIndex,
    });
  }

  // ── Reorder Sections ─────────────────────────────────────────────

  /**
   * Reorder the sections in a deck to match the given section ID order.
   *
   * @throws DeckNotFoundError if the deck does not exist.
   * @throws WrongAuthoringModelError if the deck is slides-mode.
   */
  async reorderSections(deckIdStr: string, newOrder: string[]): Promise<Deck> {
    const did = await this.resolveDeckRef(deckIdStr);
    const deck = await this.deckStore.get(did);
    if (!deck) {
      throw new DeckNotFoundError(deckIdStr);
    }
    this.assertDocumentModel(deck, 'reorder_slides');

    const now = this.clock.now();
    const newSectionIds = newOrder.map((id) => sectionId(id));

    // Reindex all positions
    await this.reindexPositions(newSectionIds, deck.id, 0);

    deck.sectionIds = newSectionIds;
    deck.updatedAt = now;
    await this.deckStore.save(deck);

    const allHtmls = await this.collectSectionHtmls(deck.id, newSectionIds);
    const revision = this.revisionTracker.createRevision({
      deckId: deck.id,
      type: 'sections_reordered',
      description: 'Sections reordered',
      slideIdsSnapshot: [],
      slideHtmls: [],
      sectionIdsSnapshot: newSectionIds,
      sectionHtmls: allHtmls,
    });
    await this.deckStore.addRevision(revision);

    this.logger.info('Sections reordered', { deckId: deck.id });
    return deck;
  }

  // ── List Sections ────────────────────────────────────────────────

  /**
   * Return every section of a deck, ordered by position.
   *
   * @throws DeckNotFoundError if the deck does not exist.
   */
  async listSections(deckIdStr: string): Promise<Section[]> {
    const did = await this.resolveDeckRef(deckIdStr);
    const deck = await this.deckStore.get(did);
    if (!deck) {
      throw new DeckNotFoundError(deckIdStr);
    }
    const sections = await this.sectionStore.getByDeck(did);
    return sections.sort((a, b) => a.position - b.position);
  }

  // ── Update Document Meta ─────────────────────────────────────────

  /**
   * Shallow-merge document-level meta (chrome, pageMargin, toc) into the
   * deck. Any field passed as `undefined` leaves the existing value alone;
   * any field passed explicitly (including `null`-ish shape) overwrites.
   *
   * @throws DeckNotFoundError if the deck does not exist.
   * @throws WrongAuthoringModelError if the deck is slides-mode.
   */
  async updateDocumentMeta(
    deckIdStr: string,
    meta: Partial<DocumentMeta>,
  ): Promise<Deck> {
    const did = await this.resolveDeckRef(deckIdStr);
    const deck = await this.deckStore.get(did);
    if (!deck) {
      throw new DeckNotFoundError(deckIdStr);
    }
    this.assertDocumentModel(deck, 'update_slide');

    const now = this.clock.now();
    const current: DocumentMeta = deck.documentMeta ?? {};
    const next: DocumentMeta = { ...current };

    // Deep-merge chrome and toc sub-fields so a caller passing a partial
    // object (e.g. { chrome: { pageNumber: true } }) keeps previously-set
    // siblings (e.g. runningTitle, footerAlign). pageMargin is atomic —
    // the four sides come as a tuple and all four are required.
    if (meta.chrome !== undefined) {
      next.chrome = { ...(current.chrome ?? {}), ...meta.chrome };
    }
    if (meta.pageMargin !== undefined) next.pageMargin = meta.pageMargin;
    if (meta.toc !== undefined) {
      next.toc = { ...(current.toc ?? {}), ...meta.toc };
    }

    deck.documentMeta = next;
    deck.updatedAt = now;
    await this.deckStore.save(deck);

    const sectionIds = deck.sectionIds ?? [];
    const allHtmls = await this.collectSectionHtmls(deck.id, sectionIds);
    const revision = this.revisionTracker.createRevision({
      deckId: deck.id,
      type: 'document_meta_updated',
      description: 'Document meta updated',
      slideIdsSnapshot: [],
      slideHtmls: [],
      sectionIdsSnapshot: sectionIds,
      sectionHtmls: allHtmls,
    });
    await this.deckStore.addRevision(revision);

    this.logger.info('Document meta updated', { deckId: deck.id });
    return deck;
  }

  // ── Private helpers ──────────────────────────────────────────────

  /**
   * Update the position field on sections from `startIndex` onward.
   * Mirrors DeckService.reindexPositions. Also reindexes
   * `section.metadata.position` so provenance stays in sync.
   */
  private async reindexPositions(
    sectionIds: SectionId[],
    _did: DeckId,
    startIndex: number,
  ): Promise<void> {
    for (let i = startIndex; i < sectionIds.length; i++) {
      const section = await this.sectionStore.get(sectionIds[i]);
      if (section) {
        if (section.position === i && section.metadata.position === i) {
          continue;
        }
        section.position = i;
        section.metadata.position = i;
        // Re-embed so the stored @section-meta comment stays in sync with
        // the struct. Without this, the comment's "position" field drifts
        // stale after every add/remove/reorder.
        section.html = embedSectionMeta(section.html, section.metadata);
        await this.sectionStore.save(section);
      }
    }
  }

  /**
   * Collect the HTML fragments of all sections for a deck in order,
   * for content hashing in the revision tracker.
   */
  private async collectSectionHtmls(
    _did: DeckId,
    sectionIds: SectionId[],
  ): Promise<string[]> {
    const htmls: string[] = [];
    for (const sid of sectionIds) {
      const section = await this.sectionStore.get(sid);
      if (section) {
        htmls.push(section.html);
      }
    }
    return htmls;
  }
}
