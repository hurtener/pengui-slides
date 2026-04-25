/**
 * Section metadata embedder.
 *
 * Mirrors slide-side `MetadataEmbedder`. Given a section HTML fragment plus
 * the stored `SectionMetadata`, returns the fragment with a canonical
 * `<!-- @section-meta {...} -->` comment immediately above the root
 * `<section>` (or above the first element node, as a fallback).
 *
 * Called from `DocumentService.addSection` / `.updateSection` so the comment
 * is guaranteed to match the stored struct. Agents never have to emit the
 * comment themselves — the stored metadata is the source of truth.
 */

import type { SectionMetadata } from '../../types/section.js';
import { commentSafeStringify } from '../metadata/comment-safe-json.js';
import { insertMetaComment } from '../metadata/insert-meta-comment.js';

const SECTION_META_REGEX = /<!--\s*@section-meta\s+[\s\S]*?-->\s*\r?\n?/;
const SECTION_ROOT_REGEX = /(<section\b[^>]*>)/i;
const ANY_TAG_REGEX = /(<[a-z][^>]*>)/i;

/**
 * Produce fragment HTML with an up-to-date `@section-meta` comment above the
 * root section element. Idempotent: an existing comment is replaced, not
 * duplicated. Comment lives at the top of the fragment (outside the
 * section wrapper) so the validator's `<section>` root-element check still
 * sees a single top-level element.
 *
 * Placement falls back from `<section>` → first element tag → bare prepend,
 * so the structural validator can still locate the comment even when the
 * agent emitted a malformed root.
 */
export function embedSectionMeta(html: string, metadata: SectionMetadata): string {
  return insertMetaComment(
    html,
    formatSectionMetaComment(metadata),
    SECTION_META_REGEX,
    [SECTION_ROOT_REGEX, ANY_TAG_REGEX],
  );
}

function formatSectionMetaComment(metadata: SectionMetadata): string {
  return `<!-- @section-meta ${commentSafeStringify(metadata)} -->`;
}
