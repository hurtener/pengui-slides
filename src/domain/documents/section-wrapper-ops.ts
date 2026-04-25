/**
 * Surgical wrapper ops for section fragments.
 *
 * These back the MCP tools `promote_section_root` and `wrap_section_root`,
 * which let an agent fix the two most common structural-validation failures
 * (wrong root tag / multiple top-level elements) without re-emitting the
 * whole fragment.
 *
 * Both operations preserve children and attributes verbatim. Only the
 * outermost wrapper is rewritten or added. The `@section-meta` comment is
 * preserved in place; callers (DocumentService) re-embed it after mutation
 * anyway.
 */

import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { SectionKind } from '../../types/section.js';
import { PenguiError, ErrorCode } from '../../types/errors.js';

const PENGUI_SECTION_CLASS = 'pengui-section';
const KIND_CLASS_PREFIX_RE = /^pengui-(?:cover|chapter_header|toc|prose|figure|chart|diagram|table|callout|comparison|glossary|bibliography|quote|image)$/;

export interface TopLevelElementSummary {
  index: number;
  tag: string;
  id?: string;
  classes: string[];
}

/**
 * Describe the top-level element nodes in a fragment. Returns an ordered
 * list so tools can quote it back to the agent when asking for a child
 * order or recommending a wrap. Whitespace/comment nodes are ignored.
 */
export function summarizeTopLevelElements(html: string): TopLevelElementSummary[] {
  const $ = cheerio.load(html, { xmlMode: false });
  const body = $.root().find('body').contents();
  const elements = body.filter((_i, el) => el.type === 'tag');
  const out: TopLevelElementSummary[] = [];
  elements.each((i, el) => {
    const node = $(el);
    const tag = (el as { tagName?: string }).tagName?.toLowerCase() ?? 'unknown';
    const id = node.attr('id');
    const classAttr = node.attr('class') ?? '';
    const classes = classAttr.split(/\s+/).filter(Boolean);
    out.push({ index: i, tag, ...(id ? { id } : {}), classes });
  });
  return out;
}

/**
 * Promote the fragment's single root element into a
 * `<section class="pengui-section pengui-{kind}">`.
 *
 * Requires exactly one top-level element node. Preserves the root's
 * existing attributes (including inline style, id, data-*) and merges its
 * classes into the required `pengui-section` + `pengui-{kind}` pair.
 *
 * Throws if the fragment has zero or multiple top-level elements — callers
 * should route those cases to `wrapRootsInSection` instead.
 */
export function promoteRootToSection(
  html: string,
  kind: SectionKind,
): { html: string; changed: boolean } {
  const $ = cheerio.load(html, { xmlMode: false });
  const body = $.root().find('body');
  const elements = body.contents().filter((_i, el) => el.type === 'tag');

  if (elements.length === 0) {
    throw new PenguiError(
      ErrorCode.SECTION_INVALID_FRAGMENT,
      'Cannot promote root: the section fragment has no top-level element. Add content or resubmit with update_section before calling promote_section_root.',
      { topLevelElementCount: 0 },
    );
  }
  if (elements.length > 1) {
    throw new PenguiError(
      ErrorCode.SECTION_INVALID_FRAGMENT,
      `Cannot promote root: the section fragment has ${elements.length} top-level elements. promote_section_root only works when there is exactly one. Call wrap_section_root instead — it will bundle all top-level elements into a single <section>.`,
      { topLevelElementCount: elements.length, suggestedTool: 'wrap_section_root' },
    );
  }

  const root = elements.first();
  const tagName = (elements[0] as { tagName?: string }).tagName?.toLowerCase();
  const existingClasses = (root.attr('class') ?? '').split(/\s+/).filter(Boolean);

  // Strip stale `pengui-{other-kind}` classes so a kind change via
  // update_section followed by promote_section_root doesn't leave two
  // conflicting kind classes on the wrapper.
  const filteredExisting = existingClasses.filter(
    (c) => !(KIND_CLASS_PREFIX_RE.test(c) && c !== `pengui-${kind}`),
  );
  const requiredClasses = [PENGUI_SECTION_CLASS, `pengui-${kind}`];
  const mergedClasses = dedupe([...requiredClasses, ...filteredExisting]);

  const alreadySection = tagName === 'section';
  const alreadyHasClasses = requiredClasses.every((c) => existingClasses.includes(c));
  const hasStaleKindClass = existingClasses.some(
    (c) => KIND_CLASS_PREFIX_RE.test(c) && c !== `pengui-${kind}`,
  );
  if (alreadySection && alreadyHasClasses && !hasStaleKindClass) {
    return { html, changed: false };
  }

  root.attr('class', mergedClasses.join(' '));

  // Rename tag if not already <section>. Cheerio has no direct rename, so
  // clone attrs + children onto a fresh <section>.
  if (!alreadySection) {
    const newRoot = $('<section></section>');
    const attrs = (elements[0] as { attribs?: Record<string, string> }).attribs ?? {};
    for (const [name, value] of Object.entries(attrs)) {
      newRoot.attr(name, value);
    }
    // Move children over. cheerio's .html() round-trip preserves markup.
    newRoot.html(root.html() ?? '');
    root.replaceWith(newRoot);
  }

  return { html: serializeBody($), changed: true };
}

/**
 * Wrap every top-level element (and preserved comment/text sibling) in a
 * new `<section class="pengui-section pengui-{kind}">`. If `childOrder` is
 * provided, reorder top-level elements by their original indices before
 * wrapping — useful when the agent wants to fix source-order mistakes
 * without rewriting content.
 *
 * Existing `@section-meta` comments at the top level are left outside the
 * new wrapper; the caller re-embeds anyway.
 */
export function wrapRootsInSection(
  html: string,
  kind: SectionKind,
  childOrder?: number[],
): { html: string; changed: boolean } {
  const $ = cheerio.load(html, { xmlMode: false });
  const body = $.root().find('body');
  const elements = body.contents().filter((_i, el) => el.type === 'tag');

  if (elements.length === 0) {
    throw new PenguiError(
      ErrorCode.SECTION_INVALID_FRAGMENT,
      'Cannot wrap roots: the section fragment has no top-level element. Add content via update_section first.',
      { topLevelElementCount: 0 },
    );
  }

  // Validate child_order first so bad input is rejected even when the
  // wrapper is already in a conforming state (otherwise INVALID_INPUT
  // would be silently swallowed by the no-op short-circuit below).
  if (childOrder && childOrder.length > 0) {
    validateChildOrder(childOrder, elements.length);
  }

  // If the fragment is already a single conforming section AND no
  // child_order was supplied (or it's the trivial [0]), this is a no-op.
  if (elements.length === 1) {
    const only = elements.first();
    const tag = (elements[0] as { tagName?: string }).tagName?.toLowerCase();
    const classes = (only.attr('class') ?? '').split(/\s+/).filter(Boolean);
    if (
      tag === 'section'
      && classes.includes(PENGUI_SECTION_CLASS)
      && classes.includes(`pengui-${kind}`)
    ) {
      return { html, changed: false };
    }
  }

  const ordered: AnyNode[] = [];
  if (childOrder && childOrder.length > 0) {
    for (const idx of childOrder) {
      ordered.push(elements[idx]);
    }
  } else {
    elements.each((_i, el) => {
      ordered.push(el);
    });
  }

  const wrapper = $(
    `<section class="${PENGUI_SECTION_CLASS} pengui-${kind}"></section>`,
  );
  for (const el of ordered) {
    wrapper.append($(el));
  }

  // Rebuild body: drop original top-level elements, keep non-element
  // nodes (comments, whitespace) in place, then append the wrapper.
  body.contents().each((_i, el) => {
    if (el.type === 'tag') {
      $(el).remove();
    }
  });
  body.append(wrapper);

  return { html: serializeBody($), changed: true };
}

function validateChildOrder(order: number[], total: number): void {
  const seen = new Set<number>();
  for (const idx of order) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= total) {
      throw new PenguiError(
        ErrorCode.INVALID_INPUT,
        `Invalid child_order for wrap_section_root: index ${idx} is out of range. Valid indices are 0 through ${total - 1}.`,
        { index: idx, topLevelElementCount: total },
      );
    }
    if (seen.has(idx)) {
      throw new PenguiError(
        ErrorCode.INVALID_INPUT,
        `Invalid child_order for wrap_section_root: index ${idx} appears more than once. child_order must be a permutation.`,
        { duplicateIndex: idx },
      );
    }
    seen.add(idx);
  }
  if (order.length !== total) {
    throw new PenguiError(
      ErrorCode.INVALID_INPUT,
      `Invalid child_order for wrap_section_root: provided ${order.length} indices but the fragment has ${total} top-level elements. child_order must contain every index exactly once.`,
      { providedCount: order.length, topLevelElementCount: total },
    );
  }
}

function dedupe<T>(items: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function serializeBody($: cheerio.CheerioAPI): string {
  // cheerio.load synthesises an html/body envelope; we want just the
  // fragment inside body.
  return $.root().find('body').html() ?? '';
}
