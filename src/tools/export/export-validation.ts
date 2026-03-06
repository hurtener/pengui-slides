import type { ServiceContainer } from '../../container.js';
import type { Slide } from '../../types/deck.js';
import { soulId } from '../../types/common.js';
import { ErrorCode, PenguiError } from '../../types/errors.js';

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
