/**
 * Error codes and custom error classes for Pengui Slides.
 */

export enum ErrorCode {
  // Soul errors
  SOUL_NOT_FOUND = 'SOUL_NOT_FOUND',
  SOUL_ALREADY_EXISTS = 'SOUL_ALREADY_EXISTS',
  SOUL_NOT_APPROVED = 'SOUL_NOT_APPROVED',
  SOUL_ALREADY_APPROVED = 'SOUL_ALREADY_APPROVED',
  SOUL_INVALID = 'SOUL_INVALID',

  // Deck errors
  DECK_NOT_FOUND = 'DECK_NOT_FOUND',
  DECK_EMPTY = 'DECK_EMPTY',

  // Slide errors
  SLIDE_NOT_FOUND = 'SLIDE_NOT_FOUND',
  SLIDE_INVALID_HTML = 'SLIDE_INVALID_HTML',
  SLIDE_INVALID_POSITION = 'SLIDE_INVALID_POSITION',
  SLIDE_TEXT_EDIT_NOT_FOUND = 'SLIDE_TEXT_EDIT_NOT_FOUND',
  SLIDE_TEXT_EDIT_INVALID = 'SLIDE_TEXT_EDIT_INVALID',
  SLIDE_REVISION_CONFLICT = 'SLIDE_REVISION_CONFLICT',

  // Section errors (continuous-document mode)
  SECTION_NOT_FOUND = 'SECTION_NOT_FOUND',
  SECTION_INVALID_FRAGMENT = 'SECTION_INVALID_FRAGMENT',
  SECTION_INVALID_POSITION = 'SECTION_INVALID_POSITION',

  // Authoring-model mismatch (wrong verb for deck's model)
  WRONG_AUTHORING_MODEL = 'WRONG_AUTHORING_MODEL',

  // Validation errors
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  VALIDATION_HARD_ERROR = 'VALIDATION_HARD_ERROR',

  // Metadata errors
  METADATA_PARSE_ERROR = 'METADATA_PARSE_ERROR',
  METADATA_MISSING = 'METADATA_MISSING',

  // Rendering errors
  RENDER_FAILED = 'RENDER_FAILED',
  BROWSER_LAUNCH_FAILED = 'BROWSER_LAUNCH_FAILED',

  // Export errors
  EXPORT_FAILED = 'EXPORT_FAILED',
  EXPORT_NO_SLIDES = 'EXPORT_NO_SLIDES',
  EXPORT_TRANSLATION_BLOCKED = 'EXPORT_TRANSLATION_BLOCKED',
  FORMAT_NOT_EXPORTABLE = 'FORMAT_NOT_EXPORTABLE',
  UNKNOWN_FORMAT = 'UNKNOWN_FORMAT',
  GOOGLE_AUTH_MISSING = 'GOOGLE_AUTH_MISSING',

  // Page chrome errors
  PAGE_CHROME_INVALID_JSON = 'PAGE_CHROME_INVALID_JSON',

  // Asset errors
  ASSET_NOT_FOUND = 'ASSET_NOT_FOUND',
  ASSET_INVALID_MIME = 'ASSET_INVALID_MIME',

  // General
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
}

export class PenguiError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'PenguiError';
    this.code = code;
    this.details = details;
  }

  toJSON(): Record<string, unknown> {
    return {
      error: true,
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export class SoulNotFoundError extends PenguiError {
  constructor(soulId: string) {
    super(ErrorCode.SOUL_NOT_FOUND, `Design Soul not found: ${soulId}`, { soulId });
  }
}

export class SoulNotApprovedError extends PenguiError {
  constructor(soulId: string) {
    super(ErrorCode.SOUL_NOT_APPROVED, `Design Soul not approved: ${soulId}`, { soulId });
  }
}

export class DeckNotFoundError extends PenguiError {
  constructor(deckId: string) {
    super(ErrorCode.DECK_NOT_FOUND, `Deck not found: ${deckId}`, { deckId });
  }
}

export class SlideNotFoundError extends PenguiError {
  constructor(slideId: string) {
    super(ErrorCode.SLIDE_NOT_FOUND, `Slide not found: ${slideId}`, { slideId });
  }
}

export class SectionNotFoundError extends PenguiError {
  constructor(sectionId: string) {
    super(ErrorCode.SECTION_NOT_FOUND, `Section not found: ${sectionId}`, { sectionId });
  }
}

/**
 * Thrown when a verb targets the wrong authoring model — e.g. add_slide
 * on a document-model deck, or add_section on a slides-model deck. The
 * error names the expected tool so callers (LLMs) can recover in one turn.
 */
export class WrongAuthoringModelError extends PenguiError {
  constructor(
    deckId: string,
    got: 'slides' | 'document',
    expected: 'slides' | 'document',
    suggestedTool: string,
    helpResource: string,
  ) {
    super(
      ErrorCode.WRONG_AUTHORING_MODEL,
      `This deck uses the '${expected}' authoring model but the call targeted the '${got}' model. ` +
        `Use ${suggestedTool} instead. See ${helpResource} for the authoring guide.`,
      { deckId, got, expected, suggestedTool, helpResource },
    );
  }
}

export class SlideTextEditNotFoundError extends PenguiError {
  constructor(editId: string) {
    super(ErrorCode.SLIDE_TEXT_EDIT_NOT_FOUND, `Editable text node not found: ${editId}`, { editId });
  }
}

export class SlideTextEditInvalidError extends PenguiError {
  constructor(editId: string, message: string) {
    super(ErrorCode.SLIDE_TEXT_EDIT_INVALID, message, { editId });
  }
}

export class SlideRevisionConflictError extends PenguiError {
  constructor(slideId: string, expectedRevisionHash: string, actualRevisionHash: string) {
    super(
      ErrorCode.SLIDE_REVISION_CONFLICT,
      `Slide revision conflict for ${slideId}. Reload the latest slide state and try again.`,
      { slideId, expectedRevisionHash, actualRevisionHash },
    );
  }
}

export class RenderError extends PenguiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.RENDER_FAILED, message, details);
  }
}

export class ExportError extends PenguiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.EXPORT_FAILED, message, details);
  }
}

export class ExportTranslationBlockedError extends PenguiError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(ErrorCode.EXPORT_TRANSLATION_BLOCKED, message, details);
  }
}

export class GoogleAuthMissingError extends PenguiError {
  constructor() {
    super(
      ErrorCode.GOOGLE_AUTH_MISSING,
      'Google Slides export requires either PENGUI_GOOGLE_ACCESS_TOKEN or service account credentials.',
    );
  }
}

export class FormatNotExportableError extends PenguiError {
  constructor(deckFormat: string, attemptedTool: string, suggestedTool: string) {
    super(
      ErrorCode.FORMAT_NOT_EXPORTABLE,
      `Deck format "${deckFormat}" cannot be exported by ${attemptedTool}. Use ${suggestedTool} instead.`,
      { deckFormat, attemptedTool, suggestedTool },
    );
  }
}

export class UnknownFormatError extends PenguiError {
  constructor(format: string, known: string[]) {
    super(
      ErrorCode.UNKNOWN_FORMAT,
      `Unknown format "${format}". Known formats: ${known.join(', ')}.`,
      { format, known },
    );
  }
}

export class AssetNotFoundError extends PenguiError {
  constructor(assetId: string) {
    super(ErrorCode.ASSET_NOT_FOUND, `Asset not found: ${assetId}`, { assetId });
  }
}

/**
 * Thrown by strict callers that want to treat a malformed @page-chrome
 * directive as a hard error. The PDF exporter itself tolerates bad JSON and
 * returns a warning instead of throwing — this class is available for callers
 * that prefer strict validation.
 */
export class PageChromeInvalidJsonError extends PenguiError {
  constructor(slideId: string, parseError: string) {
    super(
      ErrorCode.PAGE_CHROME_INVALID_JSON,
      `Slide "${slideId}" has a malformed @page-chrome directive: ${parseError}`,
      { slideId, parseError },
    );
  }
}
