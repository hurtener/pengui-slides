/**
 * Section entity types — continuous-document authoring model.
 *
 * A Section is a content BLOCK (HTML fragment) inside a continuous
 * print document. Unlike a Slide, a Section does not own a page: the
 * DocumentComposer concatenates sections and lets Chromium paginate.
 *
 * See SPEC-v3.md for the full design.
 */

import type { DeckId, SectionId, ISOTimestamp } from './common.js';
import type { ValidationResult } from './validation.js';

// ── SectionKind ───────────────────────────────────────────────────

/**
 * Section kinds drive break-behavior defaults and the structural lints
 * that fire against a section's HTML fragment. A kind of `figure`, for
 * example, imposes `break-inside: avoid` via the composer and requires
 * exactly one `<figure>` with `<figcaption>` in the fragment.
 */
export type SectionKind =
  | 'cover'
  | 'chapter_header'
  | 'toc'
  | 'prose'
  | 'figure'
  | 'chart'
  | 'diagram'
  | 'table'
  | 'callout'
  | 'comparison'
  | 'glossary'
  | 'bibliography'
  | 'quote'
  | 'image';

export const ALL_SECTION_KINDS: SectionKind[] = [
  'cover',
  'chapter_header',
  'toc',
  'prose',
  'figure',
  'chart',
  'diagram',
  'table',
  'callout',
  'comparison',
  'glossary',
  'bibliography',
  'quote',
  'image',
];

/**
 * Kinds that default to a full-page layout (min-height: 100vh + break-after).
 * The composer also emits `data-chrome="off"` for these so the running
 * header/footer is suppressed.
 */
export const FULL_PAGE_KINDS: ReadonlySet<SectionKind> = new Set([
  'cover',
  'chapter_header',
]);

/**
 * Kinds whose content must not split across pages. The composer emits
 * universal `break-inside: avoid` rules on the canonical wrapper classes
 * (.pengui-figure, .pengui-chart, .pengui-diagram, .pengui-callout,
 * .pengui-quote, .pengui-image), so Stage 1 also enforces that the
 * fragment includes the right wrapper.
 */
export const KEEP_TOGETHER_KINDS: ReadonlySet<SectionKind> = new Set([
  'figure',
  'chart',
  'diagram',
  'callout',
  'quote',
  'image',
]);

// ── Break hints ───────────────────────────────────────────────────

/**
 * Per-section overrides for pagination behavior. Undefined values fall
 * back to the kind's default. The composer resolves these to CSS
 * `break-before` / `break-inside` / `break-after` declarations on the
 * section's wrapper element.
 */
export interface SectionBreakHints {
  /** Force a page break before this section. Defaults by kind. */
  breakBefore?: 'auto' | 'page' | 'avoid';
  /** Force a page break after this section. Defaults by kind. */
  breakAfter?: 'auto' | 'page' | 'avoid';
  /** Prevent splitting across pages. Defaults by kind. */
  keepTogether?: boolean;
  /** Render as a full-page block (min-height: 100vh + break-after: page). */
  fullPage?: boolean;
}

// ── Metadata ──────────────────────────────────────────────────────

export interface SectionSource {
  url?: string;
  title?: string;
  quoteSpan?: string;
  confidence?: number;
  retrievedAt?: string;
}

/**
 * Per-section overrides for page chrome. Fall back to the deck-level
 * `DocumentMeta.chrome` directive.
 */
export interface SectionChromeOverrides {
  /** Suppress chrome on pages this section occupies. */
  hide?: boolean;
  /** Running title to show while this section is on the page. */
  runningTitle?: string;
  /** Reset the page counter at this section (e.g. Part II restarts at 1). */
  resetPageCounter?: boolean;
}

export interface SectionMetadata {
  title: string;
  kind: SectionKind;
  narrative: string;
  keyPoints?: string[];
  tags?: string[];
  sources?: SectionSource[];
  chromeOverrides?: SectionChromeOverrides;

  // Provenance — mirrors SlideMetadata auto-filled fields
  generatedAt: string;
  soulId: string;
  deckId: string;
  position: number;
  metaVersion: '3.0';
  revisionHash: string;
}

// ── Section Entity ────────────────────────────────────────────────

export interface Section {
  id: SectionId;
  deckId: DeckId;
  position: number;
  /**
   * HTML FRAGMENT. Must start with a single
   * `<section class="pengui-section pengui-{kind}">` wrapper. No
   * `<!DOCTYPE>`, `<html>`, `<head>`, `<body>`, `<script>`, no standalone
   * `<style>` blocks, no `:root` tokens (those are composed in once),
   * no fixed page-shaped dimensions. Section Stage 1 enforces this.
   */
  html: string;
  kind: SectionKind;
  breakHints: SectionBreakHints;
  metadata: SectionMetadata;
  lastValidation?: ValidationResult;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

// ── Input shapes (used by DocumentService + MCP tools) ────────────

export interface AddSectionInput {
  deckId: string;
  kind: SectionKind;
  html: string;
  metadata: {
    title: string;
    narrative: string;
    keyPoints?: string[];
    tags?: string[];
    sources?: SectionSource[];
    chromeOverrides?: SectionChromeOverrides;
  };
  breakHints?: SectionBreakHints;
  position?: number;
}

export interface UpdateSectionInput {
  deckId: string;
  sectionId: string;
  html?: string;
  kind?: SectionKind;
  breakHints?: SectionBreakHints;
  metadata?: Partial<AddSectionInput['metadata']>;
  lastValidation?: ValidationResult;
}

// ── Summaries (for list_sections / deck summaries) ────────────────

export interface SectionSummary {
  id: SectionId;
  position: number;
  kind: SectionKind;
  title: string;
  isValid: boolean;
  styleScore?: number;
}

// Marker used to disambiguate in discriminated container types.
export type SectionContainer = {
  kind: 'section';
  value: Section;
};
