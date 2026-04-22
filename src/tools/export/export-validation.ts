import type { ServiceContainer } from '../../container.js';
import type { Slide } from '../../types/deck.js';
import { soulId } from '../../types/common.js';
import {
  ErrorCode,
  ExportTranslationBlockedError,
  PenguiError,
} from '../../types/errors.js';

export async function validateSlidesForExport(
  container: ServiceContainer,
  deckId: string,
  soulIdStr: string,
  slides: Slide[],
): Promise<void> {
  if (slides.length === 0) {
    throw new PenguiError(
      ErrorCode.EXPORT_NO_SLIDES,
      'Cannot export an empty deck.',
      { deckId },
    );
  }

  // Resolve the deck's format so Stage 1 / Stage 2 checks receive the
  // correct page geometry. Without this, print decks would be validated
  // against 1920×1080 slide defaults and overflow-detection would flag
  // A4-sized content as off-canvas.
  const deckFormat = await container.deckService.getDeckFormat(deckId);

  const failedSlides: Array<{
    slide_id: string;
    title: string;
    error_count: number;
    warning_count: number;
  }> = [];

  for (const slide of slides) {
    const validation = await container.validationService.validateSlide(
      slide.html,
      soulId(soulIdStr),
      'full',
      deckFormat,
    );

    await container.deckService.updateSlide({
      deckId,
      slideId: slide.id as string,
      lastValidation: validation,
    });

    if (!validation.passed) {
      failedSlides.push({
        slide_id: slide.id as string,
        title: slide.metadata.title,
        error_count: validation.errorCount,
        warning_count: validation.warningCount,
      });
    }
  }

  if (failedSlides.length > 0) {
    throw new PenguiError(
      ErrorCode.VALIDATION_HARD_ERROR,
      'Cannot export deck because one or more slides failed full validation.',
      {
        deckId,
        failed_slides: failedSlides,
      },
    );
  }
}

export async function ensureSlidesReadyForEditableExport(
  container: ServiceContainer,
  deckId: string,
  slides: Slide[],
): Promise<Slide[]> {
  const refreshedSlides: Slide[] = [];
  const blockedSlides: Array<Record<string, unknown>> = [];

  for (const slide of slides) {
    let workingSlide = slide;
    if (container.slideDocumentService.needsCompilation(workingSlide)) {
      const compilation = await container.slideDocumentService.compileSlideHtml(
        workingSlide.html,
        workingSlide.metadata.revisionHash,
      );
      const translationState = container.slideDocumentService.buildTranslationState(compilation);

      await container.deckService.updateSlide({
        deckId,
        slideId: workingSlide.id as string,
        sourceKind: translationState.sourceKind,
        document: translationState.document ?? undefined,
        translationIssues: translationState.translationIssues,
      });

      workingSlide = await container.deckService.getSlide(workingSlide.id as string);
    }

    if (
      workingSlide.sourceKind !== 'document_v1'
      || !workingSlide.document
      || workingSlide.translationIssues.some((issue) => issue.severity === 'error')
    ) {
      blockedSlides.push({
        slide_id: workingSlide.id,
        title: workingSlide.metadata.title,
        translation_issues: workingSlide.translationIssues,
      });
    }

    refreshedSlides.push(workingSlide);
  }

  if (blockedSlides.length > 0) {
    throw new ExportTranslationBlockedError(
      'Cannot export editable slides because one or more slides could not be translated into native slide objects.',
      { failed_slides: blockedSlides },
    );
  }

  return refreshedSlides;
}
