/**
 * Deck, Slide, and Section types for Pengui Slides.
 */

import type {
  DeckId,
  SlideId,
  SectionId,
  SoulId,
  RevisionId,
  ISOTimestamp,
} from './common.js';
import type { FormatKind } from './format.js';
import type { SlideMetadata } from './metadata.js';
import type { ValidationResult } from './validation.js';
import type {
  SlideDocument,
  SlideSourceKind,
  SlideTranslationIssue,
} from './slide-document.js';
import type { PageChromeDirective } from './page-chrome.js';
import type { SectionKind, SectionSummary } from './section.js';
import type { SlideIR } from '../domain/ir/slide-ir.js';

// ── Authoring Model ───────────────────────────────────────────────

/**
 * Which authoring pipeline applies to this deck.
 *
 * - `'slides'`: one HTML doc per page (slides_16_9 today; legacy print
 *   decks pre-v3 are treated as slides when read).
 * - `'document'`: continuous document composed from Section fragments.
 *
 * Always derivable from `deck.format` at creation time, but stored
 * explicitly because (a) it's the discriminant the service layer + MCP
 * tools use, and (b) future formats may want to override the default.
 */
export type AuthoringModel = 'slides' | 'document';

// ── Slide Entity ──────────────────────────────────────────────────

export interface Slide {
  id: SlideId;
  deckId: DeckId;
  position: number;
  /**
   * The Pengui v4.5 source of truth: a structured IR tree the agent
   * authored. The compiler in `src/domain/ir/compile/` turns this into
   * `html` deterministically; soul-token changes propagate without
   * per-slide rewrites.
   */
  ir: SlideIR;
  /**
   * Compiled HTML — DERIVED from `ir`. Re-emitted on every add/update
   * so the App, exporters, and validators that still consume HTML get
   * a current snapshot. Do NOT edit `html` directly; mutate `ir` and
   * recompile.
   */
  html: string;
  sourceKind: SlideSourceKind;
  document?: SlideDocument;
  translationIssues: SlideTranslationIssue[];
  metadata: SlideMetadata;
  lastValidation?: ValidationResult;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

// ── Document Meta (document-model decks) ──────────────────────────

/**
 * Deck-level configuration for continuous documents. Consumed by the
 * DocumentComposer. None of these are required; reasonable defaults
 * apply per geometry.
 */
export interface DocumentMeta {
  /** Running chrome (header/footer + page numbers). */
  chrome?: PageChromeDirective;
  /**
   * Page box margins. Strings in CSS units (e.g. `"18mm"`). When absent,
   * the composer derives margins from `geometry.safeAreaInsetPx`.
   */
  pageMargin?: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
  /**
   * TOC auto-generation. When set, the composer fills in any `kind: 'toc'`
   * section whose fragment is the empty sentinel.
   */
  toc?: {
    maxDepth?: number;
    includeKinds?: SectionKind[];
  };
}

// ── Deck Entity ───────────────────────────────────────────────────

export interface Deck {
  id: DeckId;
  /**
   * Human-readable handle derived from `title`. Stable once assigned
   * (renaming the title does not change the slug). Absent on pre-v4 records;
   * services backfill lazily on first access. Writes always include it.
   */
  slug?: string;
  soulId: SoulId;
  title: string;
  author: string;
  slideIds: SlideId[];
  /** Parallel list for document-model decks. Empty for slide-model decks. */
  sectionIds: SectionId[];
  /**
   * Output format for this deck. Absent on legacy decks; the deck-service
   * treats a missing value as `slides_16_9` at read time. New decks always
   * carry this field — see CreateDeckInput.
   */
  format?: FormatKind;
  /**
   * Which authoring pipeline this deck uses. Absent on pre-v3 decks; the
   * deck-service treats a missing value as `'slides'` at read time. New
   * decks always carry this field — derived from `format` at creation.
   */
  authoringModel?: AuthoringModel;
  /** Document-model configuration. Only meaningful when authoringModel = 'document'. */
  documentMeta?: DocumentMeta;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

// ── Deck Revisions ────────────────────────────────────────────────

export type DeckMutationType =
  | 'deck_created'
  | 'slide_added'
  | 'slide_updated'
  | 'slide_removed'
  | 'slides_reordered'
  | 'section_added'
  | 'section_updated'
  | 'section_removed'
  | 'sections_reordered'
  | 'document_meta_updated';

export interface DeckRevision {
  id: RevisionId;
  deckId: DeckId;
  type: DeckMutationType;
  description: string;
  slideIdsSnapshot: SlideId[];
  /**
   * Only set for document-model mutations. Legacy revisions written
   * before v3 omit this field; readers tolerate that.
   */
  sectionIdsSnapshot?: SectionId[];
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
  slug: string;
  soulId: SoulId;
  soulSlug: string;
  title: string;
  author: string;
  format: FormatKind;
  authoringModel: AuthoringModel;
  /** Non-empty when authoringModel = 'slides'. */
  slides: SlideSummary[];
  slideCount: number;
  /** Non-empty when authoringModel = 'document'. */
  sections: SectionSummary[];
  sectionCount: number;
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
  /**
   * Explicit authoring model override. Omitted callers get the default
   * for the chosen format (print → document, slides_16_9 → slides).
   */
  authoringModel?: AuthoringModel;
}

export interface AddSlideInput {
  deckId: string;
  /**
   * Structured IR tree. Replaces the v4.x `html` field. The DeckService
   * compiles to HTML via `compileSlideIRToHtml`, embeds @slide-meta,
   * and stores both the IR and the compiled HTML on the Slide record.
   */
  ir: SlideIR;
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
  /** New IR tree. When provided, recompiles HTML and refreshes
   *  revisionHash. When omitted, the existing IR is preserved. */
  ir?: SlideIR;
  sourceKind?: SlideSourceKind;
  document?: SlideDocument;
  translationIssues?: SlideTranslationIssue[];
  metadata?: Partial<AddSlideInput['metadata']>;
  lastValidation?: ValidationResult;
}
