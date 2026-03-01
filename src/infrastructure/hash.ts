/**
 * SHA-256 content hashing for revision tracking.
 */

import { createHash } from 'node:crypto';

export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Compute a content hash for a set of slide HTMLs (in order).
 * Used for deck-level revision hashing.
 */
export function hashSlideContents(htmls: string[]): string {
  const combined = htmls.join('\n---SLIDE-BOUNDARY---\n');
  return sha256(combined);
}
