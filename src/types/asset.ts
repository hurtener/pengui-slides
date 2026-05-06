/**
 * Asset types for Pengui Slides.
 *
 * Assets are images (logos, content photos, illustrations) that the LLM
 * references via lightweight `asset://ID` refs in slide HTML.
 * Binary data is never exposed to the LLM — refs are resolved to
 * data URIs only at the render/export boundary.
 */

import type { AssetId, SoulId, DeckId, ISOTimestamp } from './common.js';

export type AssetMimeType = 'image/png' | 'image/svg+xml' | 'image/jpeg';

export type AssetScope =
  | { type: 'soul'; soulId: SoulId }
  | { type: 'deck'; deckId: DeckId }
  | { type: 'global' };

/**
 * Asset categorisation. v4.16 widened from `'logo' | 'content'` to add
 * the design-team-quality categories the App-side asset picker uses to
 * filter binders. Backwards compatibility: legacy `'content'` values are
 * read as-is and surfaced under the `'photo'` filter in the App.
 *
 * Roles are an organisational tag — the renderer / compiler don't read
 * them. The decoration node accepts any asset by `asset_id`; uploading
 * something tagged `'photo'` instead of `'illustration'` doesn't change
 * how it renders.
 */
export type AssetRole =
  | 'logo'           // brand mark / corporate identity
  | 'illustration'   // hand-drawn / vector / decorative imagery
  | 'screenshot'     // app UI capture, often paired with image.frame
  | 'photo'          // photographic content (people, places, products)
  | 'icon'           // small inline mark (NOT the lucide curated set)
  | 'content';       // legacy v4.15-and-earlier — surfaces as 'photo' in the App

export interface Asset {
  id: AssetId;
  name: string;
  filename: string;
  mimeType: AssetMimeType;
  scope: AssetScope;
  role: AssetRole;
  sizeBytes: number;
  width?: number;
  height?: number;
  createdAt: ISOTimestamp;
}

/** The ref protocol used in slide HTML: asset://ASSET_ID */
export const ASSET_PROTOCOL = 'asset://';
