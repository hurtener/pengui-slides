/**
 * IR mutation: replace a single named field of a node at a given path.
 *
 * Used by `apply_slide_field_edit` / `apply_section_field_edit` (v4.9c)
 * for inline rich-text editing in the MCP App. The App walks up from
 * the clicked `[data-ir-rt-field]` element to the closest
 * `[data-ir-path]` ancestor, then submits the parsed `RichText` body
 * along with the field name. The server resolves the IR path, sets
 * the named field on the node, and re-runs the standard recompile +
 * mode-aware lint pipeline.
 *
 * Field grammar:
 *   - Plain identifier  → top-level node field (e.g. "title", "body").
 *   - "items[N]"        → array index inside the named field
 *                         (e.g. list.items[2]).
 *
 * The function is structurally agnostic — it never inspects the IR
 * node's `type`, only its keys. That means a "title" field write on a
 * hero, callout, toc, or section_divider all dispatch through the
 * same code path. Schema validation runs at the service-layer commit
 * (`updateSlide` / `updateSection` enforce the IR schema), so a
 * malformed write — e.g. setting "items[0]" on a node with no `items`
 * field — surfaces as `INVALID_INPUT` from the validator.
 *
 * Returns the new root; input is not mutated.
 */

import type { SlideIR, SectionIR } from '../slide-ir.js';
import type { IRPath } from './replace-node.js';
import { resolveNode, badPath } from './path-resolver.js';
import { ErrorCode, PenguiError } from '../../../types/errors.js';

const FIELD_RE = /^([a-zA-Z_][a-zA-Z0-9_]*)(?:\[(\d+)\])?$/;

export interface ParsedField {
  name: string;
  index?: number;
}

export function parseFieldName(field: string): ParsedField {
  const match = FIELD_RE.exec(field);
  if (!match) {
    throw new PenguiError(
      ErrorCode.INVALID_INPUT,
      `Invalid field name "${field}". Expected an identifier or "name[index]".`,
    );
  }
  const name = match[1];
  const idx = match[2];
  return idx !== undefined ? { name, index: Number(idx) } : { name };
}

/**
 * Set the field at `path → field` to `value`. Returns the new root.
 *
 * `value` is treated as opaque — typical use is a `RichText` body, but
 * the helper doesn't enforce a shape. Schema validation kicks in when
 * the resulting IR is committed via `updateSlide` / `updateSection`.
 */
export function setNodeFieldAtPath<T extends SlideIR | SectionIR>(
  root: T,
  path: IRPath,
  field: string,
  value: unknown,
): T {
  if (path.length < 2) {
    badPath(path, 'path must address a node (length ≥ 2)');
  }
  const parsed = parseFieldName(field);
  const next = structuredClone(root) as T;
  const cursor = resolveNode(next, path);
  const node = cursor.container[cursor.index] as Record<string, unknown>;

  if (parsed.index === undefined) {
    node[parsed.name] = value;
    return next;
  }

  const arr = node[parsed.name];
  if (!Array.isArray(arr)) {
    throw new PenguiError(
      ErrorCode.INVALID_INPUT,
      `Field "${parsed.name}" is not an array on node at path ${JSON.stringify([...path])}.`,
    );
  }
  if (parsed.index < 0 || parsed.index >= arr.length) {
    throw new PenguiError(
      ErrorCode.INVALID_INPUT,
      `Index ${parsed.index} out of range for "${parsed.name}" (length ${arr.length}).`,
    );
  }
  const nextArr = arr.slice();
  nextArr[parsed.index] = value;
  node[parsed.name] = nextArr;
  return next;
}
