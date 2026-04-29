/**
 * parseRichText — DOM → IR `RichText` runs.
 *
 * Inverse of `src/domain/ir/compile/rich-text-renderer.ts`. Walks the
 * children of a `[data-ir-path]` text-bearing element, accumulates the
 * inline marks active at each text node, and emits a flat array of
 * `TextRun`s suitable for round-tripping through `apply_slide_node_edit`.
 *
 * Supported marks: bold (`<strong>`/`<b>`), italic (`<em>`/`<i>`),
 * code (`<code>`), strike (`<s>`/`<strike>`/`<del>`), sup (`<sup>`),
 * sub (`<sub>`), link (`<a href>`), color (`<span class="pengui-text-…">`).
 *
 * Adjacent runs with identical marks are merged so a single bold span
 * doesn't produce a chain of one-character runs after the user types.
 * Empty-text runs are dropped.
 */

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
  sup?: boolean;
  sub?: boolean;
  link?: string;
  color?: string;
}

interface ActiveMarks {
  bold?: true;
  italic?: true;
  code?: true;
  strike?: true;
  sup?: true;
  sub?: true;
  link?: string;
  color?: string;
}

const COLOR_CLASS_PREFIX = 'pengui-text-';

/**
 * Parse a contentEditable `Element` (or `DocumentFragment`) into a flat
 * `TextRun[]`. The root itself is not consulted for marks — marks come
 * from descendant tag names. Children are walked in document order.
 */
export function parseRichTextFromElement(root: Element | DocumentFragment): TextRun[] {
  const out: TextRun[] = [];
  for (const child of Array.from(root.childNodes)) {
    walk(child, {}, out);
  }
  return mergeAdjacent(out);
}

/**
 * Convenience: parse an HTML string into runs by reusing the browser's
 * own parser. Returns an empty array for empty / whitespace-only HTML.
 */
export function parseRichTextFromHtml(html: string): TextRun[] {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return parseRichTextFromElement(tpl.content);
}

function walk(node: Node, active: ActiveMarks, out: TextRun[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.nodeValue ?? '').replace(/ /g, ' ');
    if (text.length === 0) return;
    out.push(runFromMarks(text, active));
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as Element;
  // Soft line breaks become explicit newlines so the user's Enter inside
  // a contentEditable produces visible separation in the resulting run.
  if (el.tagName === 'BR') {
    out.push(runFromMarks('\n', active));
    return;
  }

  // Skip our own injected overlay nodes — the structure-mode toolbar is
  // part of the iframe DOM and must not bleed into the parsed runs.
  if ((el as HTMLElement).dataset?.penguiOverlay) return;

  const next: ActiveMarks = { ...active };
  switch (el.tagName) {
    case 'STRONG':
    case 'B':
      next.bold = true;
      break;
    case 'EM':
    case 'I':
      next.italic = true;
      break;
    case 'CODE':
      next.code = true;
      break;
    case 'S':
    case 'STRIKE':
    case 'DEL':
      next.strike = true;
      break;
    case 'SUP':
      next.sup = true;
      delete next.sub;
      break;
    case 'SUB':
      next.sub = true;
      delete next.sup;
      break;
    case 'A': {
      const href = (el as HTMLAnchorElement).getAttribute('href') ?? '';
      if (href) next.link = href;
      break;
    }
    case 'SPAN': {
      const cls = (el as HTMLElement).className;
      if (typeof cls === 'string') {
        const match = cls.split(/\s+/).find((c) => c.startsWith(COLOR_CLASS_PREFIX));
        if (match) {
          next.color = match.slice(COLOR_CLASS_PREFIX.length).replace(/-/g, '_');
        }
      }
      break;
    }
    // Block-level elements (p, div, h1, …) are flattened — their
    // children are walked with the parent's marks unchanged. Block
    // separation becomes an inline newline so users typing a paragraph
    // break inside a single prose node still see the separation in the
    // round-tripped run text.
    case 'P':
    case 'DIV':
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6':
    case 'LI': {
      // Flatten — but if there's a previous run, prepend a newline
      // boundary so the visual block-break survives.
      if (out.length > 0) out.push(runFromMarks('\n', active));
      break;
    }
    default:
      break;
  }

  for (const child of el.childNodes) {
    walk(child, next, out);
  }
}

function runFromMarks(text: string, marks: ActiveMarks): TextRun {
  const run: TextRun = { text };
  if (marks.bold) run.bold = true;
  if (marks.italic) run.italic = true;
  if (marks.code) run.code = true;
  if (marks.strike) run.strike = true;
  if (marks.sup) run.sup = true;
  else if (marks.sub) run.sub = true;
  if (marks.link) run.link = marks.link;
  if (marks.color) run.color = marks.color;
  return run;
}

/**
 * Collapse consecutive runs that share identical mark sets so the
 * agent-side `apply_slide_node_edit` payload stays compact.
 */
function mergeAdjacent(runs: TextRun[]): TextRun[] {
  if (runs.length < 2) return runs.filter((r) => r.text.length > 0);
  const out: TextRun[] = [];
  for (const run of runs) {
    if (run.text.length === 0) continue;
    const prev = out[out.length - 1];
    if (prev && sameMarks(prev, run)) {
      prev.text += run.text;
    } else {
      out.push({ ...run });
    }
  }
  return out;
}

function sameMarks(a: TextRun, b: TextRun): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.code === !!b.code &&
    !!a.strike === !!b.strike &&
    !!a.sup === !!b.sup &&
    !!a.sub === !!b.sub &&
    (a.link ?? '') === (b.link ?? '') &&
    (a.color ?? '') === (b.color ?? '')
  );
}
