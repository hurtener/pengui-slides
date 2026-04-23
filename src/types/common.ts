/**
 * Branded ID types and shared primitives for Pengui Slides.
 *
 * Branded types prevent accidental mixing of SoulId/DeckId/SlideId
 * at compile time while remaining plain strings at runtime.
 */

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

// ── Branded ID Types ──────────────────────────────────────────────

export type SoulId = Brand<string, 'SoulId'>;
export type DeckId = Brand<string, 'DeckId'>;
export type SlideId = Brand<string, 'SlideId'>;
export type SectionId = Brand<string, 'SectionId'>;
export type RevisionId = Brand<string, 'RevisionId'>;
export type TemplateId = Brand<string, 'TemplateId'>;
export type AssetId = Brand<string, 'AssetId'>;

// ── Factory Functions ─────────────────────────────────────────────

export function soulId(id: string): SoulId {
  return id as SoulId;
}
export function deckId(id: string): DeckId {
  return id as DeckId;
}
export function slideId(id: string): SlideId {
  return id as SlideId;
}
export function sectionId(id: string): SectionId {
  return id as SectionId;
}
export function revisionId(id: string): RevisionId {
  return id as RevisionId;
}
export function templateId(id: string): TemplateId {
  return id as TemplateId;
}
export function assetId(id: string): AssetId {
  return id as AssetId;
}

// ── Timestamps ────────────────────────────────────────────────────

/** ISO 8601 timestamp string */
export type ISOTimestamp = string;

// ── Pagination ────────────────────────────────────────────────────

export interface PaginationParams {
  offset: number;
  limit: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}
