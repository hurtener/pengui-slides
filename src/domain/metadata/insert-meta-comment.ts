/**
 * Place an HTML comment above the appropriate root element in a fragment,
 * idempotently replacing any prior occurrence.
 *
 * Both the slide-side `MetadataEmbedder` and the section-side
 * `embedSectionMeta` follow the same shape:
 *   1. Strip any existing meta comment matching `existingRegex`.
 *   2. Walk `rootCandidates` regexes in order; insert the comment
 *      immediately before the first match.
 *   3. If none match, prepend the comment to the fragment.
 *
 * The two embedders only differ in (a) which comment marker they use
 * (`@slide-meta` vs `@section-meta`), and (b) which root selectors they
 * accept (slide expects `<div class="...slide...">`; section expects
 * `<section>` with an any-element fallback so the validator can still
 * surface the separate root-not-section error).
 *
 * Centralized here so the same bug class can't reappear in one embedder
 * while being fixed in the other.
 */

export function insertMetaComment(
  html: string,
  comment: string,
  existingRegex: RegExp,
  rootCandidates: RegExp[],
): string {
  const stripped = html.replace(existingRegex, '');
  for (const rx of rootCandidates) {
    const m = stripped.match(rx);
    if (m && m.index !== undefined) {
      return stripped.slice(0, m.index) + comment + '\n' + stripped.slice(m.index);
    }
  }
  return comment + '\n' + stripped;
}
