import type { DeckService } from '../decks/deck-service.js';
import type { ValidationService } from '../validation/validation-service.js';
import type { RenderService } from '../rendering/render-service.js';
import type { MetadataEmbedder } from '../metadata/metadata-embedder.js';
import type { Logger } from '../../infrastructure/logger.js';
import type { Slide } from '../../types/deck.js';
import type { EditorState, EditorThumbnail, ApplyTextEditInput } from '../../types/editor.js';
import { soulId } from '../../types/common.js';
import { DeckNotFoundError, SlideNotFoundError, SlideRevisionConflictError } from '../../types/errors.js';
import { TextEditableNormalizer } from './text-editable-normalizer.js';

export class EditorService {
  private readonly normalizer = new TextEditableNormalizer();

  constructor(
    private readonly deckService: DeckService,
    private readonly validationService: ValidationService,
    private readonly renderService: RenderService,
    private readonly metadataEmbedder: MetadataEmbedder,
    private readonly logger: Logger,
  ) {}

  async getEditorState(deckId: string, slideId?: string): Promise<EditorState> {
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

    if (ensuredSlide.metadata.revisionHash !== selectedSlide.metadata.revisionHash) {
      summary = await this.deckService.getDeckSummary(deckId);
    }

    const slides = await Promise.all(
      summary.slides.map((slideSummary) => this.deckService.getSlide(slideSummary.id as string)),
    );

    const previews = await this.renderService.renderPreview(slides);
    const previewMap = new Map(previews.map((preview) => [preview.slideId, preview]));
    const slideSummaryMap = new Map(summary.slides.map((slideSummary) => [slideSummary.id as string, slideSummary]));

    const thumbnails: EditorThumbnail[] = slides.map((slide) => {
      const preview = previewMap.get(slide.id as string);
      const summaryEntry = slideSummaryMap.get(slide.id as string);
      return {
        slideId: slide.id as string,
        position: slide.position,
        title: slide.metadata.title,
        type: slide.metadata.type,
        imageBase64: preview?.imageBase64 ?? '',
        isValid: summaryEntry?.isValid ?? false,
        ...(summaryEntry?.styleScore !== undefined ? { styleScore: summaryEntry.styleScore } : {}),
      };
    });

    const finalSelectedSlide = slides.find((slide) => (slide.id as string) === selectedSlideId) ?? ensuredSlide;
    const selectedPreview = thumbnails.find((thumbnail) => thumbnail.slideId === selectedSlideId);
    if (!selectedPreview) {
      throw new DeckNotFoundError(deckId);
    }

    return {
      deck: summary,
      selectedSlide: {
        slideId: finalSelectedSlide.id as string,
        position: finalSelectedSlide.position,
        html: finalSelectedSlide.html,
        metadata: finalSelectedSlide.metadata,
        lastValidation: finalSelectedSlide.lastValidation ?? null,
        revisionHash: finalSelectedSlide.metadata.revisionHash,
      },
      thumbnails,
      selectedPreview,
    };
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

    const ensuredSlide = await this.ensureEditableMarkup(
      input.deckId,
      slide,
      (await this.deckService.getDeckSummary(input.deckId)).soulId as string,
    );
    const edited = this.normalizer.applyTextEdit(
      ensuredSlide.html,
      input.editId,
      input.text,
    );

    if (edited.changed) {
      await this.persistSlideHtml(input.deckId, ensuredSlide, edited.html);
      this.logger.info('Applied text edit', {
        deckId: input.deckId,
        slideId: input.slideId,
        editId: input.editId,
      });
    }

    return this.getEditorState(input.deckId, input.slideId);
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

    await this.persistSlideHtml(deckId, slide, normalized.html, soulIdStr);
    return this.deckService.getSlide(slide.id as string);
  }

  private async persistSlideHtml(
    deckId: string,
    slide: Slide,
    rawHtml: string,
    soulIdStr?: string,
  ): Promise<void> {
    const embeddedHtml = this.metadataEmbedder.update(rawHtml, slide.metadata);
    await this.deckService.updateSlide({
      deckId,
      slideId: slide.id as string,
      html: embeddedHtml,
    });

    const validation = await this.validationService.validateSlide(
      embeddedHtml,
      soulId(soulIdStr ?? ((await this.deckService.getDeckSummary(deckId)).soulId as string)),
    );

    await this.deckService.updateSlide({
      deckId,
      slideId: slide.id as string,
      lastValidation: validation,
    });
  }
}
