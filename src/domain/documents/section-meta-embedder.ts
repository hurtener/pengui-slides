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

const SECTION_META_REGEX = /<!--\s*@section-meta\s+[\s\S]*?-->\s*\r?\n?/;
const SECTION_ROOT_REGEX = /(<section\b[^>]*>)/i;
const ANY_TAG_REGEX = /(<[a-z][^>]*>)/i;

/**
 * Produce fragment HTML with an up-to-date `@section-meta` comment above the
 * root section element. Idempotent: an existing comment is replaced, not
 * duplicated. Comment lives at the top of the fragment (outside the
 * section wrapper) so the validator's `<section>` root-element check still
 * sees a single top-level element.
 */
export function embedSectionMeta(html: string, metadata: SectionMetadata): string {
  const comment = formatSectionMetaComment(metadata);
  const withoutExisting = html.replace(SECTION_META_REGEX, '');

  const sectionMatch = withoutExisting.match(SECTION_ROOT_REGEX);
  if (sectionMatch && sectionMatch.index !== undefined) {
    return (
      withoutExisting.slice(0, sectionMatch.index) +
      comment + '\n' +
      withoutExisting.slice(sectionMatch.index)
    );
  }

  // No `<section>` root — place the comment above the first element tag so
  // the structural validator can still locate and parse it when it reports
  // the (separate) root-not-section error.
  const anyTagMatch = withoutExisting.match(ANY_TAG_REGEX);
  if (anyTagMatch && anyTagMatch.index !== undefined) {
    return (
      withoutExisting.slice(0, anyTagMatch.index) +
      comment + '\n' +
      withoutExisting.slice(anyTagMatch.index)
    );
  }

  return comment + '\n' + withoutExisting;
}

function formatSectionMetaComment(metadata: SectionMetadata): string {
  // Match slide-meta formatting (pretty-printed JSON) for readability when
  // authors inspect the stored HTML.
  const json = JSON.stringify(metadata, null, 2);
  return `<!-- @section-meta ${json} -->`;
}
