/**
 * Store interfaces for Pengui Slides.
 *
 * All methods return Promises so the backing implementation can be
 * swapped from in-memory Maps to a real database without changing
 * the call-site code.
 */

import type {
  AssetId,
  CommentId,
  DeckId,
  SlideId,
  SectionId,
  SoulId,
} from '../types/common.js';
import type { DesignSoul, LayoutRecipe, SoulStatus } from '../types/design-soul.js';
import type { Deck, DeckRevision, Slide } from '../types/deck.js';
import type { Section } from '../types/section.js';
import type { Asset, AssetRole, AssetScope } from '../types/asset.js';
import type { Comment, ListCommentsFilter } from '../types/comment.js';

// ── Soul Store ───────────────────────────────────────────────────

export interface ISoulStore {
  save(soul: DesignSoul): Promise<void>;
  get(id: SoulId): Promise<DesignSoul | undefined>;
  list(statusFilter?: SoulStatus | 'all'): Promise<DesignSoul[]>;
  delete(id: SoulId): Promise<boolean>;
  saveRecipes(soulId: SoulId, recipes: LayoutRecipe[]): Promise<void>;
  getRecipes(soulId: SoulId): Promise<LayoutRecipe[]>;
  addRecipe(soulId: SoulId, recipe: LayoutRecipe): Promise<void>;
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

// ── Section Store (continuous-document mode) ─────────────────────

export interface ISectionStore {
  save(section: Section): Promise<void>;
  get(id: SectionId): Promise<Section | undefined>;
  getByDeck(deckId: DeckId): Promise<Section[]>;
  delete(id: SectionId): Promise<boolean>;
  deleteByDeck(deckId: DeckId): Promise<number>;
}

// ── Asset Store ──────────────────────────────────────────────────

export interface AssetListFilter {
  scope?: AssetScope['type'];
  soulId?: SoulId;
  deckId?: DeckId;
  role?: AssetRole;
}

export interface IAssetStore {
  saveMetadata(asset: Asset): Promise<void>;
  saveData(id: AssetId, data: Buffer): Promise<void>;
  getMetadata(id: AssetId): Promise<Asset | undefined>;
  getData(id: AssetId): Promise<Buffer | undefined>;
  list(filter?: AssetListFilter): Promise<Asset[]>;
  delete(id: AssetId): Promise<boolean>;
}

// ── Comment Store ────────────────────────────────────────────────

export interface ICommentStore {
  save(comment: Comment): Promise<void>;
  get(id: CommentId): Promise<Comment | undefined>;
  listByDeck(deckId: DeckId, filter?: ListCommentsFilter): Promise<Comment[]>;
  delete(id: CommentId): Promise<boolean>;
  deleteByDeck(deckId: DeckId): Promise<number>;
}
