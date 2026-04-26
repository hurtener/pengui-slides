import type { ServiceContainer } from '../../container.js';
import type { Deck, Slide } from '../../types/deck.js';
import type { Section } from '../../types/section.js';
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
    position: number;
    error_count: number;
    warning_count: number;
    issues: Array<{
      id: string;
      rule: string;
      severity: string;
      stage: string;
      message: string;
      fixSuggestion?: string;
    }>;
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
      const errorIssues = validation.issues.filter((i) => i.severity === 'error');
      failedSlides.push({
        slide_id: slide.id as string,
        title: slide.metadata.title,
        position: slide.position,
        error_count: validation.errorCount,
        warning_count: validation.warningCount,
        issues: errorIssues.slice(0, 20).map((i) => ({
          id: i.id,
          rule: i.rule,
          severity: i.severity,
          stage: i.stage,
          message: i.message,
          ...(i.fixSuggestion ? { fixSuggestion: i.fixSuggestion } : {}),
        })),
      });
    }
  }

  if (failedSlides.length > 0) {
    throw new PenguiError(
      ErrorCode.VALIDATION_HARD_ERROR,
      `Cannot export deck: ${failedSlides.length}/${slides.length} slide(s) failed full validation. ` +
        `See \`failed_slides[].issues\` for the specific Stage 1/Stage 2 errors and how to fix them. ` +
        `Tip: call \`validate_deck_for_export\` to preview these errors without attempting an export.`,
      {
        deckId,
        failed_slides: failedSlides,
      },
    );
  }
}

/**
 * Validate every Section of a document-model deck, at full render depth
 * (Stage 1 + Stage 2 on the composed document). Mirrors
 * `validateSlidesForExport` but operates on Sections. Throws
 * VALIDATION_HARD_ERROR if the composed document has any error-severity
 * issues; otherwise persists per-section validation results.
 */
export async function validateSectionsForExport(
  container: ServiceContainer,
  deck: Deck,
  soulIdStr: string,
  sections: Section[],
): Promise<void> {
  if (sections.length === 0) {
    throw new PenguiError(
      ErrorCode.EXPORT_NO_SLIDES,
      'Cannot export an empty document. Add at least one section first.',
      { deckId: deck.id },
    );
  }

  const validation = await container.validationService.validateDocument(
    deck,
    sections,
    soulId(soulIdStr),
    'full',
    container.assetService,
  );

  // Store a per-section slice of the aggregated issues. Issue ids are
  // prefixed with `sec-N:` by validateDocument; we split them back.
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const prefix = `sec-${i + 1}:`;
    const issues = validation.issues
      .filter((issue) => issue.id.startsWith(prefix))
      .map((issue) => ({ ...issue, id: issue.id.slice(prefix.length) }));

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;
    const infoCount = issues.filter((i) => i.severity === 'info').length;

    await container.documentService.updateSection({
      deckId: deck.id as string,
      sectionId: section.id as string,
      lastValidation: {
        passed: errorCount === 0,
        issues,
        styleScore: validation.styleScore,
        errorCount,
        warningCount,
        infoCount,
        stage1ElapsedMs: validation.stage1ElapsedMs,
        stage2ElapsedMs: validation.stage2ElapsedMs,
        stage2Skipped: validation.stage2Skipped,
        validatedAt: validation.validatedAt,
      },
    });
  }

  if (!validation.passed) {
    const hardIssues = validation.issues.filter((i) => i.severity === 'error');
    // Group issues by section index so the agent can see which section
    // emitted each error rather than chasing through a flat list.
    const failedSections = new Map<
      number,
      Array<{ id: string; rule: string; severity: string; stage: string; message: string; fixSuggestion?: string }>
    >();
    for (const issue of hardIssues) {
      const match = issue.id.match(/^sec-(\d+):/);
      const idx = match ? Number(match[1]) - 1 : -1;
      if (!failedSections.has(idx)) failedSections.set(idx, []);
      failedSections.get(idx)!.push({
        id: match ? issue.id.slice(match[0].length) : issue.id,
        rule: issue.rule,
        severity: issue.severity,
        stage: issue.stage,
        message: issue.message,
        ...(issue.fixSuggestion ? { fixSuggestion: issue.fixSuggestion } : {}),
      });
    }

    throw new PenguiError(
      ErrorCode.VALIDATION_HARD_ERROR,
      `Cannot export document: ${hardIssues.length} validation error(s) across ${failedSections.size} section(s). ` +
        `See \`failed_sections[].issues\` for the specific Stage 1/Stage 2 errors and how to fix them. ` +
        `Tip: call \`validate_deck_for_export\` to preview these errors without attempting an export.`,
      {
        deckId: deck.id,
        error_count: hardIssues.length,
        failed_sections: Array.from(failedSections.entries()).map(([idx, issues]) => {
          const section = idx >= 0 && idx < sections.length ? sections[idx] : null;
          return {
            ...(section
              ? {
                  section_id: section.id as string,
                  position: section.position,
                  kind: section.kind,
                  title: section.metadata.title,
                }
              : {}),
            issues: issues.slice(0, 20),
          };
        }),
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
      const translationState = container.slideDocumentService.buildTranslationState(
        compilation,
        workingSlide.sourceKind,
      );

      await container.deckService.updateSlide({
        deckId,
        slideId: workingSlide.id as string,
        sourceKind: translationState.sourceKind,
        document: translationState.document ?? undefined,
        translationIssues: translationState.translationIssues,
      });

      workingSlide = await container.deckService.getSlide(workingSlide.id as string);
    }

    const isExportable =
      workingSlide.sourceKind === 'document_v1' || workingSlide.sourceKind === 'authored_ir';
    if (
      !isExportable
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
