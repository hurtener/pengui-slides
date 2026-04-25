/**
 * Stringify a value as JSON safe to embed inside an HTML comment.
 *
 * Any `--` sequence in the output is rewritten as `--` so a payload
 * containing `-->` (e.g. a narrative ending in an arrow) cannot close the
 * surrounding `<!-- ... -->` early. `JSON.parse` decodes `-` back to
 * `-` natively, so the read path is unchanged.
 *
 * Used by both `metadata-embedder` (slides) and `section-meta-embedder`
 * (sections); kept in one place so the same bug class can't reappear in
 * one embedder while being fixed in the other.
 */
export function commentSafeStringify(
  value: unknown,
  space: string | number = 2,
): string {
  return JSON.stringify(value, null, space).replace(/--/g, '-\\u002d');
}
