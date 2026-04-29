/**
 * Decode a `data-ir-path` attribute value (e.g. `"body,2,left,1"`) into
 * the structural array shape the MCP tools accept. Inverse of the IR
 * compiler's `irPathToString`. Numeric segments come back as numbers.
 *
 * Empty input → empty array.
 */
export function decodeIrPath(s: string): ReadonlyArray<string | number> {
  if (!s) return [];
  return s.split(',').map((seg) => (/^\d+$/.test(seg) ? Number(seg) : seg));
}

/**
 * `true` when `descendant` lives inside `ancestor` — including the
 * "is the same path" case. Used to reject drops into a node's own
 * subtree before round-tripping to the server (the server also rejects,
 * but a fast pre-check keeps the UX snappy).
 */
export function isPathInside(
  descendant: ReadonlyArray<string | number>,
  ancestor: ReadonlyArray<string | number>,
): boolean {
  if (descendant.length < ancestor.length) return false;
  for (let i = 0; i < ancestor.length; i += 1) {
    if (descendant[i] !== ancestor[i]) return false;
  }
  return true;
}
