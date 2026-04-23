/**
 * Human-readable slug helpers for v4 identity.
 *
 * Slugs are derived from a title/name, lowercase kebab-case, ASCII only.
 * Collisions are resolved by appending a numeric suffix (`-2`, `-3`, ...).
 * Slugs are stable once assigned — rename does not change the slug.
 */

const MAX_BASE_LEN = 60;
const FALLBACK = 'untitled';

// Combining-mark range used to strip diacritics after NFKD normalisation.
const DIACRITIC_RE = /[̀-ͯ]/g;

/**
 * Normalise a string into slug base form. Deterministic, pure.
 * - Lowercases.
 * - Strips diacritics (NFKD + combining-mark removal).
 * - Replaces any run of non-alphanumeric chars with `-`.
 * - Trims leading/trailing `-`.
 * - Caps length at MAX_BASE_LEN.
 * - Falls back to `untitled` when empty.
 */
export function slugify(input: string): string {
  const normalised = input
    .normalize('NFKD')
    .replace(DIACRITIC_RE, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_BASE_LEN)
    .replace(/-+$/g, '');
  return normalised || FALLBACK;
}

/**
 * Pick a unique slug from `input`, avoiding any slug already in `taken`.
 * Returns the base when free, or `base-2`, `base-3`, ... on collision.
 */
export function deriveSlug(input: string, taken: ReadonlySet<string>): string {
  const base = slugify(input);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
