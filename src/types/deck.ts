/**
 * Deck and slide types for Pengui Slides.
 */

import type { DeckId, SlideId, SoulId, RevisionId, ISOTimestamp } from './common.js';
import type { FormatKind } from './format.js';
import type { SlideMetadata } from './metadata.js';
import type { ValidationResult } from './validation.js';
import type {
  SlideDocument,
  SlideSourceKind,
  SlideTranslationIssue,
} from './slide-document.js';

// ── Slide Entity ──────────────────────────────────────────────────

export interface Slide {
  id: SlideId;
  deckId: DeckId;
  position: number;
  html: string;
  sourceKind: SlideSourceKind;
  document?: SlideDocument;
  translationIssues: SlideTranslationIssue[];
  metadata: SlideMetadata;
  lastValidation?: ValidationResult;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

// ── Deck Entity ───────────────────────────────────────────────────

export interface Deck {
  id: DeckId;
  soulId: SoulId;
  title: string;
  author: string;
  slideIds: SlideId[];
  /**
   * Output format for this deck. Absent on legacy decks; the deck-service
   * treats a missing value as `slides_16_9` at read time. New decks always
   * carry this field — see CreateDeckInput.
   */
  format?: FormatKind;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

// ── Deck Revisions ────────────────────────────────────────────────

export type DeckMutationType =
  | 'deck_created'
  | 'slide_added'
  | 'slide_updated'
  | 'slide_removed'
  | 'slides_reordered';

export interface DeckRevision {
  id: RevisionId;
  deckId: DeckId;
  type: DeckMutationType;
  description: string;
  slideIdsSnapshot: SlideId[];
  contentHash: string;
  createdAt: ISOTimestamp;
  createdBy?: string;
}

// ── Deck Summary (lightweight, no HTML) ───────────────────────────

export interface SlideSummary {
  id: SlideId;
  position: number;
  title: string;
  type: string;
  isValid: boolean;
  styleScore?: number;
}

export interface DeckSummary {
  id: DeckId;
  soulId: SoulId;
  title: string;
  author: string;
  format: FormatKind;
  slideCount: number;
  slides: SlideSummary[];
  revisionCount: number;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

// ── Input types ───────────────────────────────────────────────────

export interface CreateDeckInput {
  soulId: string;
  title?: string;
  author?: string;
  /**
   * Output format. Omission preserves legacy behavior (slides_16_9).
   */
  format?: FormatKind;
}

export interface AddSlideInput {
  deckId: string;
  html: string;
  metadata: {
    title: string;
    type: string;
    narrative: string;
    keyPoints?: string[];
    dataPoints?: Array<{
      label: string;
      value: string | number;
      unit?: string;
      source?: string;
      period?: string;
      trend?: string;
    }>;
    tags?: string[];
    audience?: string;
    confidentiality?: string;
    sources?: Array<{
      url?: string;
      title?: string;
      quoteSpan?: string;
      confidence?: number;
      retrievedAt?: string;
    }>;
  };
  position?: number;
}

export interface UpdateSlideInput {
  deckId: string;
  slideId: string;
  html?: string;
  sourceKind?: SlideSourceKind;
  document?: SlideDocument;
  translationIssues?: SlideTranslationIssue[];
  metadata?: Partial<AddSlideInput['metadata']>;
  lastValidation?: ValidationResult;
}
