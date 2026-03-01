/**
 * Store interfaces for Pengui Slides.
 *
 * All methods return Promises so the backing implementation can be
 * swapped from in-memory Maps to a real database without changing
 * the call-site code.
 */

import type { DeckId, SlideId, SoulId } from '../types/common.js';
import type { DesignSoul, SkeletonTemplate, SoulStatus } from '../types/design-soul.js';
import type { Deck, DeckRevision, Slide } from '../types/deck.js';

// ── Soul Store ───────────────────────────────────────────────────

export interface ISoulStore {
  save(soul: DesignSoul): Promise<void>;
  get(id: SoulId): Promise<DesignSoul | undefined>;
  list(statusFilter?: SoulStatus | 'all'): Promise<DesignSoul[]>;
  delete(id: SoulId): Promise<boolean>;
  saveSkeletons(soulId: SoulId, templates: SkeletonTemplate[]): Promise<void>;
  getSkeletons(soulId: SoulId): Promise<SkeletonTemplate[]>;
}

// ── Deck Store ───────────────────────────────────────────────────

export interface IDeckStore {
  save(deck: Deck): Promise<void>;
  get(id: DeckId): Promise<Deck | undefined>;
  list(): Promise<Deck[]>;
  delete(id: DeckId): Promise<boolean>;
  addRevision(revision: DeckRevision): Promise<void>;
  getRevisions(deckId: DeckId, limit?: number): Promise<DeckRevision[]>;
}

// ── Slide Store ──────────────────────────────────────────────────

export interface ISlideStore {
  save(slide: Slide): Promise<void>;
  get(id: SlideId): Promise<Slide | undefined>;
  getByDeck(deckId: DeckId): Promise<Slide[]>;
  delete(id: SlideId): Promise<boolean>;
  deleteByDeck(deckId: DeckId): Promise<number>;
}
