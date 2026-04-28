/**
 * IR-path encoding for round-tripping between the IR-tree, the compiled
 * HTML, and the wire format.
 *
 * Encoding format: comma-separated. Numeric segments → integers; any
 * other segment → string. Examples:
 *
 *   ["body", 0]                      → "body,0"
 *   ["body", 2, "left", 1]           → "body,2,left,1"
 *   ["body", 3, "cells", 1, 0]       → "body,3,cells,1,0"
 *
 * Why comma-separated and not JSON: the encoded form ends up in HTML
 * attribute values (`data-ir-path`). Commas don't need entity-escaping;
 * JSON brackets and quotes do. This keeps the rendered HTML readable
 * and the App-side parser trivial.
 *
 * This format is safe because the structural keys we use today (`body`,
 * `left`, `right`, `cells`) and integer indices contain no commas. New
 * keys must follow the same rule.
 */

import type { IRPath } from './operations/replace-node.js';

const NUMERIC_RE = /^\d+$/;

/** Encode an IRPath to its `data-ir-path` string form. */
export function irPathToString(path: IRPath): string {
  return path.join(',');
}

/**
 * Decode a `data-ir-path` string to an IRPath array. Numeric-only
 * segments become numbers; everything else stays as a string. Returns
 * `null` for the empty string (no path).
 */
export function irPathFromString(s: string): IRPath | null {
  const trimmed = s.trim();
  if (trimmed.length === 0) return null;
  return trimmed.split(',').map((seg) => (NUMERIC_RE.test(seg) ? Number(seg) : seg));
}
