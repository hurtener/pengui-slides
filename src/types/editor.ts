import type { DeckSummary } from './deck.js';
import type { SlideMetadata } from './metadata.js';
import type { ValidationDelta, ValidationPresentation, ValidationResult, SlideHealth } from './validation.js';
import type { SlideDocument, SlideSourceKind, SlideTranslationIssue } from './slide-document.js';

export interface EditorThumbnail {
  slideId: string;
  position: number;
  title: string;
  type: string;
  imageBase64: string;
  isValid: boolean;
  health: SlideHealth;
  hasNewIssues: boolean;
  blockingCount: number;
  validationPresentation: ValidationPresentation;
  styleScore?: number;
}

export interface EditorSelectedSlide {
  slideId: string;
  position: number;
  html: string;
  sourceKind: SlideSourceKind;
  document: SlideDocument | null;
  translationIssues: SlideTranslationIssue[];
  editableExportReady: boolean;
  metadata: SlideMetadata;
  lastValidation: ValidationResult | null;
  validationPresentation: ValidationPresentation;
  validationDelta: ValidationDelta;
  revisionHash: string;
}

export interface EditorState {
  deck: DeckSummary;
  selectedSlide: EditorSelectedSlide;
  thumbnails: EditorThumbnail[];
  selectedPreview: EditorThumbnail;
}

export interface ApplyTextEditInput {
  deckId: string;
  slideId: string;
  editId: string;
  text: string;
  expectedRevisionHash: string;
}
