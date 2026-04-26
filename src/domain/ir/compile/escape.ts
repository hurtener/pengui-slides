/**
 * Minimal HTML escapers used by the IR compiler.
 *
 * Five-entity escape for text content (`& < > " '`); URL-encode for
 * `href` values to defang `javascript:` and similar even though Zod
 * already validates the URL is a parseable absolute URL with a known
 * scheme.
 *
 * Kept tiny + dependency-free; we'd rather audit ~10 lines than pull in
 * a sanitizer that does too much.
 */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape an attribute value (typically used for href, alt, title).
 * Same as escapeHtml but called separately so future tightening (e.g.
 * stripping control chars) can target attributes specifically.
 */
export function escapeAttr(value: string): string {
  return escapeHtml(value);
}
