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

export class AssetNotFoundError extends PenguiError {
  constructor(assetId: string) {
    super(ErrorCode.ASSET_NOT_FOUND, `Asset not found: ${assetId}`, { assetId });
  }
}
