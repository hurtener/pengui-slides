import type { DeckSummary } from './deck.js';
import type { SlideMetadata } from './metadata.js';
import type { ValidationDelta, ValidationPresentation, ValidationResult, SlideHealth } from './validation.js';
import type { SlideDocument, SlideSourceKind, SlideTranslationIssue } from './slide-document.js';
import type { SlideIR } from '../domain/ir/index.js';

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
  /**
   * v4.6: the structured IR tree the agent authored. Present on every
   * slide created via add_slide. The App reads this for the structured
   * outline panel and as the source of truth for in-place node edits via
   * apply_node_edit / apply_run_edit. Pre-v4.5 slides won't have it.
   */
  ir: SlideIR | null;
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
