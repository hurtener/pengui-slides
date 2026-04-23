import type { DeckService } from '../decks/deck-service.js';
import type { SoulService } from '../souls/soul-service.js';
import type { ValidationService } from '../validation/validation-service.js';
import type { RenderService } from '../rendering/render-service.js';
import type { MetadataEmbedder } from '../metadata/metadata-embedder.js';
import type { Logger } from '../../infrastructure/logger.js';
import type { Slide } from '../../types/deck.js';
import type { EditorState, EditorThumbnail, ApplyTextEditInput } from '../../types/editor.js';
import type { SlideDocument, SlideTextElement } from '../../types/slide-document.js';
import type {
  SessionView,
  SetActiveWorkspaceInput,
} from '../../types/session.js';
import { soulId } from '../../types/common.js';
import { DeckNotFoundError, SlideNotFoundError, SlideRevisionConflictError } from '../../types/errors.js';
import { TextEditableNormalizer } from './text-editable-normalizer.js';
import {
  buildSnapshotValidationPresentation,
  buildValidationDelta,
  buildValidationPresentation,
  healthFromPresentation,
} from '../validation/validation-presentation.js';
import type { ValidationResult } from '../../types/validation.js';
import type { SlideDocumentService } from '../documents/index.js';

export class EditorService {
  private readonly normalizer = new TextEditableNormalizer();
  private session: SessionView = { openPanels: [] };

  constructor(
    private readonly deckService: DeckService,
    private readonly soulService: SoulService,
    private readonly validationService: ValidationService,
    private readonly renderService: RenderService,
    private readonly metadataEmbedder: MetadataEmbedder,
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
      throw new DeckNotFoundError(deckId);
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
        sourceKind: finalSelectedSlide.sourceKind,
        document: selectedDocument,
        translationIssues: finalSelectedSlide.translationIssues,
        editableExportReady: finalSelectedSlide.sourceKind === 'document_v1'
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
    const normalized = this.normalizer.normalize(slide.html);
    if (!normalized.changed) {
      return slide;
    }

    this.logger.info('Normalizing slide for text editing', {
      deckId,
      slideId: slide.id,
    });

    await this.persistSlideState(deckId, slide, normalized.html, undefined, soulIdStr);
    return this.deckService.getSlide(slide.id as string);
  }

  private async ensureDocumentState(deckId: string, slide: Slide): Promise<SlideDocument | null> {
    if (!this.slideDocumentService.needsCompilation(slide)) {
      return slide.document ?? null;
    }

    const compilation = await this.slideDocumentService.compileSlideHtml(
      slide.html,
      slide.metadata.revisionHash,
    );
    const translationState = this.slideDocumentService.buildTranslationState(compilation);

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
    deckId: string,
    slide: Slide,
    rawHtml: string,
    document?: SlideDocument | null,
    soulIdStr?: string,
  ): Promise<void> {
    const embeddedHtml = this.metadataEmbedder.update(rawHtml, slide.metadata);
    const updateInput: Parameters<typeof this.deckService.updateSlide>[0] = {
      deckId,
      slideId: slide.id as string,
      html: embeddedHtml,
    };

    if (document !== undefined) {
      updateInput.sourceKind = document ? 'document_v1' : 'legacy_html';
      updateInput.document = document ?? undefined;
      updateInput.translationIssues = document ? [] : slide.translationIssues;
    }

    await this.deckService.updateSlide(updateInput);

    const deckSummary = await this.deckService.getDeckSummary(deckId);
    const validation = await this.validationService.validateSlide(
      embeddedHtml,
      soulId(soulIdStr ?? (deckSummary.soulId as string)),
      'lint',
      deckSummary.format,
    );

    await this.deckService.updateSlide({
      deckId,
      slideId: slide.id as string,
      lastValidation: validation,
    });
  }
}
