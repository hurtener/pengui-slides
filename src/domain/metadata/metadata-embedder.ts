/**
 * Metadata Embedder for Pengui Slides.
 *
 * Inserts or updates `<!-- @slide-meta {...} -->` comments in slide HTML.
 * The metadata comment is placed immediately before the slide's root div
 * element so it travels with the markup but does not render visually.
 *
 * Placement is delegated to the shared `insertMetaComment` util so the
 * slide and section embedders cannot drift apart on the
 * strip-then-insert logic.
 */

import type { SlideMetadata } from '../../types/metadata.js';
import { commentSafeStringify } from './comment-safe-json.js';
import { insertMetaComment } from './insert-meta-comment.js';

const SLIDE_META_REGEX = /<!--\s*@slide-meta\s+[\s\S]*?\s*-->\n?/;
const SLIDE_DIV_REGEX = /(<div[^>]*class=["'][^"']*\bslide\b[^"']*["'][^>]*>)/i;

export class MetadataEmbedder {
  /** Insert (or replace) the metadata comment in slide HTML. */
  embed(html: string, metadata: SlideMetadata): string {
    return insertMetaComment(
      html,
      this.formatComment(metadata),
      SLIDE_META_REGEX,
      [SLIDE_DIV_REGEX],
    );
  }

  /** Alias for `embed`. Kept for callers that want intent-revealing names. */
  update(html: string, metadata: SlideMetadata): string {
    return this.embed(html, metadata);
  }

  private formatComment(metadata: SlideMetadata): string {
    return `<!-- @slide-meta ${commentSafeStringify(metadata)} -->`;
  }
}
