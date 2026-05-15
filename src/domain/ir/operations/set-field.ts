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

// v4.22 — dotted field grammar for surgical text patches into nested
// shapes like RichText runs: `body[0].text` (the text of the first run
// in a RichText body). One segment per dot; each segment uses the
// same single-FIELD_RE grammar (identifier + optional [index]).
const DOTTED_FIELD_RE = /^[a-zA-Z_][a-zA-Z0-9_]*(?:\[\d+\])?(?:\.[a-zA-Z_][a-zA-Z0-9_]*(?:\[\d+\])?)*$/;

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

export function parseDottedFieldName(field: string): ParsedField[] {
  if (!DOTTED_FIELD_RE.test(field)) {
    throw new PenguiError(
      ErrorCode.INVALID_INPUT,
      `Invalid dotted field "${field}". Expected segments of "name" or "name[index]" joined by ".".`,
    );
  }
  return field.split('.').map((seg) => parseFieldName(seg));
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

/**
 * v4.22 — surgical text patch into a string-typed field on a node.
 *
 * Cuts edit-path output token cost for code-heavy slides: instead of
 * re-emitting the entire ~1.5 KB SQL when changing one column name,
 * the agent emits a find/replace pair and the server splices it.
 *
 * `field` accepts the dotted grammar (`name`, `name[idx]`, or
 * `name.subname[idx].sub`) so it can address a RichText run's `text`
 * (`body[0].text`) or a code_block's `code` field (`code`).
 *
 * Validation:
 *   - The resolved field must be a string. Throws INVALID_INPUT
 *     otherwise.
 *   - `find` must occur EXACTLY once in the field value. Zero
 *     occurrences → NOT_FOUND. More than one → INVALID_INPUT
 *     (ambiguous patch — caller must extend `find` to be unique).
 *   - `replace` is taken verbatim. No regex semantics, no group
 *     references; the patch is a plain string splice.
 *
 * Returns the new root; input is not mutated.
 */
export function applyTextPatchAtPath<T extends SlideIR | SectionIR>(
  root: T,
  path: IRPath,
  field: string,
  find: string,
  replace: string,
): T {
  if (path.length < 2) {
    badPath(path, 'path must address a node (length ≥ 2)');
  }
  if (find.length === 0) {
    throw new PenguiError(
      ErrorCode.INVALID_INPUT,
      'Text patch `find` must be a non-empty string.',
    );
  }
  const segments = parseDottedFieldName(field);
  const next = structuredClone(root) as T;
  const cursor = resolveNode(next, path);
  const nodeRoot = cursor.container[cursor.index] as Record<string, unknown>;

  // Walk all but the last segment to reach the parent container of
  // the leaf string. Throws on any step that misses (non-array index,
  // non-object descent, out-of-range index).
  let containerObj: Record<string, unknown> = nodeRoot;
  let containerArr: unknown[] | null = null;
  let leafIndexInArr: number | null = null;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i];
    const value = containerObj[seg.name];
    if (seg.index === undefined) {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new PenguiError(
          ErrorCode.INVALID_INPUT,
          `Field "${seg.name}" is not an object on the patch path.`,
        );
      }
      containerObj = value as Record<string, unknown>;
      containerArr = null;
      leafIndexInArr = null;
    } else {
      if (!Array.isArray(value)) {
        throw new PenguiError(
          ErrorCode.INVALID_INPUT,
          `Field "${seg.name}" is not an array on the patch path.`,
        );
      }
      if (seg.index < 0 || seg.index >= value.length) {
        throw new PenguiError(
          ErrorCode.INVALID_INPUT,
          `Index ${seg.index} out of range for "${seg.name}" (length ${value.length}).`,
        );
      }
      const child = value[seg.index];
      if (typeof child !== 'object' || child === null || Array.isArray(child)) {
        throw new PenguiError(
          ErrorCode.INVALID_INPUT,
          `Array slot "${seg.name}[${seg.index}]" is not an object — cannot descend further.`,
        );
      }
      containerObj = child as Record<string, unknown>;
      containerArr = value as unknown[];
      leafIndexInArr = seg.index;
    }
  }

  const leaf = segments[segments.length - 1];
  let leafValue: unknown;
  if (leaf.index === undefined) {
    leafValue = containerObj[leaf.name];
  } else {
    const arr = containerObj[leaf.name];
    if (!Array.isArray(arr)) {
      throw new PenguiError(
        ErrorCode.INVALID_INPUT,
        `Leaf field "${leaf.name}" is not an array.`,
      );
    }
    if (leaf.index < 0 || leaf.index >= arr.length) {
      throw new PenguiError(
        ErrorCode.INVALID_INPUT,
        `Index ${leaf.index} out of range for leaf "${leaf.name}" (length ${arr.length}).`,
      );
    }
    leafValue = arr[leaf.index];
  }

  if (typeof leafValue !== 'string') {
    throw new PenguiError(
      ErrorCode.INVALID_INPUT,
      `Cannot patch field "${field}": value is not a string (got ${typeof leafValue}).`,
    );
  }

  const firstAt = leafValue.indexOf(find);
  if (firstAt < 0) {
    throw new PenguiError(
      ErrorCode.SLIDE_TEXT_EDIT_NOT_FOUND,
      `Text patch: \`find\` not found in field "${field}".`,
    );
  }
  if (leafValue.indexOf(find, firstAt + find.length) >= 0) {
    throw new PenguiError(
      ErrorCode.INVALID_INPUT,
      `Text patch: \`find\` matches more than once in field "${field}". Extend the snippet so it is unique.`,
    );
  }

  const nextLeaf =
    leafValue.slice(0, firstAt) + replace + leafValue.slice(firstAt + find.length);

  if (leaf.index === undefined) {
    containerObj[leaf.name] = nextLeaf;
  } else {
    // structuredClone on the root already gave us a deep copy, so we
    // can write through directly without worrying about shared refs.
    const arr = containerObj[leaf.name] as unknown[];
    const nextArr = arr.slice();
    nextArr[leaf.index] = nextLeaf;
    containerObj[leaf.name] = nextArr;
    // If the leaf is itself inside an array slot we descended into,
    // re-stamp the parent so the (sliced) clone is referenced. With
    // structuredClone'd root the inner objects ARE the clones, so this
    // is belt-and-suspenders — the parent already points at the same
    // object we mutated.
    if (containerArr !== null && leafIndexInArr !== null) {
      containerArr[leafIndexInArr] = containerObj;
    }
  }
  return next;
}
