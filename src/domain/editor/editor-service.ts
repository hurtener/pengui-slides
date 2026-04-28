import type { DeckService } from '../decks/deck-service.js';
import type { SoulService } from '../souls/soul-service.js';
import type { RenderService } from '../rendering/render-service.js';
import type { Logger } from '../../infrastructure/logger.js';
import type { Slide } from '../../types/deck.js';
import type { EditorState, EditorThumbnail, ApplyTextEditInput } from '../../types/editor.js';
import type { SlideDocument, SlideTextElement } from '../../types/slide-document.js';
import type {
  SessionView,
  SetActiveWorkspaceInput,
} from '../../types/session.js';
import { DeckEmptyError, DeckNotFoundError, SlideNotFoundError, SlideRevisionConflictError } from '../../types/errors.js';
import { TextEditableNormalizer } from './text-editable-normalizer.js';
import {
  buildSnapshotValidationPresentation,
  buildValidationDelta,
  buildValidationPresentation,
  healthFromPresentation,
} from '../validation/validation-presentation.js';
import type { ValidationResult } from '../../types/validation.js';
import type { SlideDocumentService } from '../documents/index.js';
import { compileSlideIRToHtml } from '../ir/index.js';
import { DEFAULT_FORMAT, getFormat } from '../formats/format-registry.js';
import { MetadataEmbedder } from '../metadata/metadata-embedder.js';
import { soulId } from '../../types/common.js';

export class EditorService {
  private readonly normalizer = new TextEditableNormalizer();
  private readonly metadataEmbedder = new MetadataEmbedder();
  private session: SessionView = { openPanels: [] };

  constructor(
    private readonly deckService: DeckService,
    private readonly soulService: SoulService,
    private readonly renderService: RenderService,
    private readonly slideDocumentService: SlideDocumentService,
    private readonly logger: Logger,
  ) {}

  async getEditorState(deckId: string, slideId?: string): Promise<EditorState> {
    return this.buildEditorState(deckId, slideId);
  }

  // ── Session (v4) ─────────────────────────────────────────────────

  /**
   * Return the current workspace session as a light-weight view.
   * Used by `get_session` (model-visible) so the agent can avoid
   * asking "which deck?" on every turn.
   */
  async getSession(): Promise<SessionView> {
    // Rebuild derived fields in case the deck/soul was renamed or deleted
    // since the app last declared.
    const view: SessionView = { openPanels: this.session.openPanels };
    if (this.session.updatedAt) view.updatedAt = this.session.updatedAt;
    if (this.session.activeWorkflow) view.activeWorkflow = this.session.activeWorkflow;
    if (this.session.activeDeck) {
      const summary = await this.deckService
        .getDeckSummary(this.session.activeDeck.id)
        .catch(() => null);
      if (summary) {
        view.activeDeck = {
          id: summary.id,
          slug: summary.slug,
          title: summary.title,
          format: summary.format,
          authoringModel: summary.authoringModel,
        };
      }
    }
    if (this.session.activeSoul) {
      const got = await this.soulService
        .get(this.session.activeSoul.id)
        .catch(() => null);
      if (got) {
        const soul = got.soul;
        view.activeSoul = {
          id: soul.id,
          slug: soul.slug ?? (await this.soulService.slugFor(soul.id)) ?? '',
          name: soul.name,
          status: soul.status,
        };
      }
    }
    return view;
  }

  /**
   * Update the active session. Called by the app-only `set_active_workspace`
   * tool (Wave 3). Nullable refs clear the corresponding slot.
   */
  async setActiveWorkspace(input: SetActiveWorkspaceInput): Promise<SessionView> {
    if (input.deckRef === null) {
      delete this.session.activeDeck;
    } else if (input.deckRef !== undefined) {
      const did = await this.deckService.resolveRefOrThrow(input.deckRef);
      const summary = await this.deckService.getDeckSummary(did);
      this.session.activeDeck = {
        id: summary.id,
        slug: summary.slug,
        title: summary.title,
        format: summary.format,
        authoringModel: summary.authoringModel,
      };
    }
    if (input.soulRef === null) {
      delete this.session.activeSoul;
    } else if (input.soulRef !== undefined) {
      const sid = await this.soulService.resolveRefOrThrow(input.soulRef);
      const got = await this.soulService.get(sid);
      const soul = got.soul;
      this.session.activeSoul = {
        id: soul.id,
        slug: soul.slug ?? (await this.soulService.slugFor(soul.id)) ?? '',
        name: soul.name,
        status: soul.status,
      };
    }
    if (input.workflow === null) {
      delete this.session.activeWorkflow;
    } else if (input.workflow !== undefined) {
      this.session.activeWorkflow = input.workflow;
    }
    if (input.openPanels !== undefined) {
      this.session.openPanels = [...input.openPanels];
    }
    this.session.updatedAt = new Date().toISOString();
    return this.getSession();
  }

  async applyTextEdit(input: ApplyTextEditInput): Promise<EditorState> {
    const slide = await this.deckService.getSlide(input.slideId);

    if ((slide.deckId as string) !== input.deckId) {
      throw new DeckNotFoundError(input.deckId);
    }

    if (slide.sourceKind === 'authored_ir') {
      throw new Error(
        'EDITOR_HTML_MUTATION_DISABLED: slide is IR-first (sourceKind=authored_ir); ' +
          'HTML-mutation editor flows are disabled until the IR-aware editor surface ships in v4.6.',
      );
    }

    if (slide.metadata.revisionHash !== input.expectedRevisionHash) {
      throw new SlideRevisionConflictError(
        input.slideId,
        input.expectedRevisionHash,
        slide.metadata.revisionHash,
      );
    }

    const previousValidation = slide.lastValidation ?? null;
    const ensuredSlide = await this.ensureEditableMarkup(
      input.deckId,
      slide,
      (await this.deckService.getDeckSummary(input.deckId)).soulId as string,
    );
    const currentDocument = await this.ensureDocumentState(input.deckId, ensuredSlide);
    const edited = this.normalizer.applyTextEdit(ensuredSlide.html, input.editId, input.text);

    if (edited.changed) {
      const nextDocument = currentDocument
        ? this.applyTextToDocument(currentDocument, input.editId, input.text)
        : null;
      await this.persistSlideState(
        input.deckId,
        ensuredSlide,
        edited.html,
        nextDocument,
      );
      this.logger.info('Applied text edit', {
        deckId: input.deckId,
        slideId: input.slideId,
        editId: input.editId,
      });
    }

    return this.buildEditorState(input.deckId, input.slideId, previousValidation);
  }

  private async buildEditorState(
    deckId: string,
    slideId?: string,
    previousSelectedValidation: ValidationResult | null = null,
  ): Promise<EditorState> {
    let summary = await this.deckService.getDeckSummary(deckId);
    if (summary.slideCount === 0 || summary.slides.length === 0) {
      // Distinct from DeckNotFoundError: the deck exists, it just has
      // no slides yet. Surfacing the right code lets agents skip the
      // "is this a stale build?" debugging detour the v4 → v4.1 cycle
      // exposed.
      throw new DeckEmptyError(deckId, 'slides', 'open the slide editor');
    }

    const selectedSlideId = slideId ?? (summary.slides[0].id as string);
    const selectedSlide = await this.deckService.getSlide(selectedSlideId);
    if ((selectedSlide.deckId as string) !== deckId) {
      throw new SlideNotFoundError(selectedSlideId);
    }

    const ensuredSlide = await this.ensureEditableMarkup(
      deckId,
      selectedSlide,
      summary.soulId as string,
    );
    const selectedDocument = await this.ensureDocumentState(deckId, ensuredSlide);

    if (ensuredSlide.metadata.revisionHash !== selectedSlide.metadata.revisionHash) {
      summary = await this.deckService.getDeckSummary(deckId);
    }

    const slides = await Promise.all(
      summary.slides.map((slideSummary) => this.deckService.getSlide(slideSummary.id as string)),
    );

    // v4.8.5: replace the selected slide's stored copy with the
    // ensured-editable refresh so downstream consumers (preview HTML,
    // App pin bridge) see the in-memory regenerated html with
    // data-ir-path attributes. Other slides keep their stored copy —
    // only the active slide drives the iframe / pin flow.
    const ensuredIdx = slides.findIndex((s) => (s.id as string) === selectedSlideId);
    if (ensuredIdx >= 0) {
      slides[ensuredIdx] = ensuredSlide;
    }

    const previews = await this.renderService.renderPreview(slides, undefined, summary.format);
    const previewMap = new Map(previews.map((preview) => [preview.slideId, preview]));
    const slideSummaryMap = new Map(summary.slides.map((slideSummary) => [slideSummary.id as string, slideSummary]));

    const thumbnails: EditorThumbnail[] = slides.map((slide) => {
      const preview = previewMap.get(slide.id as string);
      const summaryEntry = slideSummaryMap.get(slide.id as string);
      const validationPresentation = buildSnapshotValidationPresentation(slide.lastValidation ?? null);
      return {
        slideId: slide.id as string,
        position: slide.position,
        title: slide.metadata.title,
        type: slide.metadata.type,
        imageBase64: preview?.imageBase64 ?? '',
        isValid: summaryEntry?.isValid ?? false,
        health: healthFromPresentation(validationPresentation),
        hasNewIssues: false,
        blockingCount: validationPresentation.blockingCount,
        validationPresentation,
        ...(summaryEntry?.styleScore !== undefined ? { styleScore: summaryEntry.styleScore } : {}),
      };
    });

    const finalSelectedSlide = slides.find((slide) => (slide.id as string) === selectedSlideId) ?? ensuredSlide;
    const selectedPreview = thumbnails.find((thumbnail) => thumbnail.slideId === selectedSlideId);
    if (!selectedPreview) {
      throw new DeckNotFoundError(deckId);
    }

    const validationDelta = buildValidationDelta(
      finalSelectedSlide.lastValidation ?? null,
      previousSelectedValidation,
    );
    const validationPresentation = previousSelectedValidation
      ? buildValidationPresentation(validationDelta)
      : buildSnapshotValidationPresentation(finalSelectedSlide.lastValidation ?? null);
    const selectedThumbnail = thumbnails.find((thumbnail) => thumbnail.slideId === selectedSlideId);
    if (selectedThumbnail) {
      selectedThumbnail.health = healthFromPresentation(validationPresentation);
      selectedThumbnail.hasNewIssues = validationDelta.introducedIssues.length > 0;
      selectedThumbnail.blockingCount = validationPresentation.blockingCount;
      selectedThumbnail.validationPresentation = validationPresentation;
    }

    return {
      deck: summary,
      selectedSlide: {
        slideId: finalSelectedSlide.id as string,
        position: finalSelectedSlide.position,
        html: finalSelectedSlide.html,
        ir: finalSelectedSlide.ir ?? null,
        sourceKind: finalSelectedSlide.sourceKind,
        document: selectedDocument,
        translationIssues: finalSelectedSlide.translationIssues,
        editableExportReady: (
          finalSelectedSlide.sourceKind === 'document_v1'
          || finalSelectedSlide.sourceKind === 'authored_ir'
        )
          && !finalSelectedSlide.translationIssues.some((issue) => issue.severity === 'error'),
        metadata: finalSelectedSlide.metadata,
        lastValidation: finalSelectedSlide.lastValidation ?? null,
        validationPresentation,
        validationDelta,
        revisionHash: finalSelectedSlide.metadata.revisionHash,
      },
      thumbnails,
      selectedPreview: selectedThumbnail ?? selectedPreview,
    };
  }

  private async ensureEditableMarkup(
    deckId: string,
    slide: Slide,
    soulIdStr: string,
  ): Promise<Slide> {
    // v4.8.5 — pin-mode in the App needs `data-ir-path` attributes the
    // IR compiler started emitting in this release. Pre-v4.8.5 slides
    // have stored HTML compiled before the attribute existed; the App's
    // pin bridge would silently fail on them. When we detect a stale
    // authored_ir slide on retrieval, recompile from IR in-memory.
    //
    // We deliberately do NOT persist via updateSlide — that would
    // create a "Slide updated" revision history entry and re-run the
    // full validation pipeline on every editor open. The IR is
    // unchanged; only the cached HTML drifted. The next genuine
    // user-driven update_slide / apply_slide_node_edit will persist
    // fresh HTML naturally.
    //
    // Only triggers for authored_ir slides; legacy_html / document_v1
    // sourceKinds don't carry IR and are out of scope for pin support.
    if (
      slide.sourceKind === 'authored_ir'
      && slide.ir
      && !slide.html.includes('data-ir-path=')
    ) {
      const refreshed = await this.recompileSlideInMemory(deckId, slide, soulIdStr);
      if (refreshed) return refreshed;
    }
    return slide;
  }

  /**
   * Recompile a slide's HTML from IR in-memory (no persistence). Used
   * by `ensureEditableMarkup` to refresh pre-v4.8.5 stored HTML so the
   * App's pin bridge finds `data-ir-path` anchors. Returns null if the
   * deck or soul lookup fails — caller falls back to the stale HTML.
   */
  private async recompileSlideInMemory(
    deckId: string,
    slide: Slide,
    soulIdStr: string,
  ): Promise<Slide | null> {
    if (!slide.ir) return null;
    try {
      const summary = await this.deckService.getDeckSummary(deckId);
      const got = await this.soulService.get(soulId(soulIdStr));
      if (!got) return null;
      const geometry = getFormat(summary.format ?? DEFAULT_FORMAT).geometry;
      const compiledHtml = compileSlideIRToHtml({ ir: slide.ir, soul: got.soul, geometry });
      const embedded = this.metadataEmbedder.embed(compiledHtml, slide.metadata);
      this.logger.info('Refreshed pre-v4.8.5 slide html in-memory', {
        slideId: slide.id,
      });
      return { ...slide, html: embedded };
    } catch (err) {
      this.logger.warn('Failed to refresh slide html in-memory; serving stored html', {
        slideId: slide.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  private async ensureDocumentState(deckId: string, slide: Slide): Promise<SlideDocument | null> {
    if (!this.slideDocumentService.needsEditorCompilation(slide)) {
      return slide.document ?? null;
    }

    const compilation = await this.slideDocumentService.compileSlideHtml(
      slide.html,
      slide.metadata.revisionHash,
    );
    const translationState = this.slideDocumentService.buildTranslationState(compilation, slide.sourceKind);

    await this.deckService.updateSlide({
      deckId,
      slideId: slide.id as string,
      sourceKind: translationState.sourceKind,
      document: translationState.document ?? undefined,
      translationIssues: translationState.translationIssues,
    });

    const refreshed = await this.deckService.getSlide(slide.id as string);
    return refreshed.document ?? null;
  }

  private applyTextToDocument(
    document: SlideDocument,
    editId: string,
    text: string,
  ): SlideDocument {
    const elements = document.elements.map((element) => {
      if (element.kind !== 'text') {
        return element;
      }

      const textElement = element as SlideTextElement;
      if (textElement.editId !== editId && textElement.id !== editId) {
        return element;
      }

      return {
        ...textElement,
        text,
        paragraphs: text.split('\n').map((line) => ({
          text: line,
          runs: [{
            text: line,
            color: textElement.style.color,
            fontFamily: textElement.style.fontFamily,
            fontSize: textElement.style.fontSize,
            bold: (textElement.style.fontWeight ?? 400) >= 600,
            italic: textElement.style.fontStyle === 'italic',
          }],
        })),
      };
    });

    return {
      ...document,
      elements,
    };
  }

  private async persistSlideState(
    _deckId: string,
    _slide: Slide,
    _rawHtml: string,
    _document?: SlideDocument | null,
    _soulIdStr?: string,
  ): Promise<void> {
    // v4.5: slides are IR-first. Direct HTML mutation through the editor
    // is no longer supported — the WYSIWYG must mutate IR. The IR-aware
    // editor mutation surface lands in v4.6+. Raising here makes
    // apply_text_edit fail loudly rather than silently dropping changes.
    throw new Error(
      'EDITOR_HTML_MUTATION_DISABLED: slides are IR-first in v4.5; HTML-mutation editor flows ' +
        'are disabled until the IR-aware editor surface ships in v4.6.',
    );
  }
}
