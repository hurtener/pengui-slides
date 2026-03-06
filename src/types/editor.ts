import type { DeckSummary } from './deck.js';
import type { SlideMetadata } from './metadata.js';
import type { ValidationResult } from './validation.js';

export interface EditorThumbnail {
  slideId: string;
  position: number;
  title: string;
  type: string;
  imageBase64: string;
  isValid: boolean;
  styleScore?: number;
}

export interface EditorSelectedSlide {
  slideId: string;
  position: number;
  html: string;
  metadata: SlideMetadata;
  lastValidation: ValidationResult | null;
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
