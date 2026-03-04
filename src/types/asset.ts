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

export interface Asset {
  id: AssetId;
  name: string;
  filename: string;
  mimeType: AssetMimeType;
  scope: AssetScope;
  role: 'logo' | 'content';
  sizeBytes: number;
  width?: number;
  height?: number;
  createdAt: ISOTimestamp;
}

/** The ref protocol used in slide HTML: asset://ASSET_ID */
export const ASSET_PROTOCOL = 'asset://';
