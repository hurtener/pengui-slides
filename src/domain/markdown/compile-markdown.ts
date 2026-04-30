/**
 * compile_markdown — markdown → IR `LeafSlideNode[]` (v4.10).
 *
 * A small, hand-rolled, line-based markdown compiler. Pure transformation:
 * no deck / soul context, no asset lookups (the caller is expected to have
 * already resolved any asset slugs to ids via `find_asset_by_slug`). The
 * output is an array of leaf nodes ready to feed straight into
 * `insert_slide_node` / `insert_section_node`.
 *
 * Coverage (v4.10):
 *   - `# H1` … `###### H6` → `heading` with matching `level`
 *   - paragraphs (one or more contiguous non-list, non-heading lines)
 *     → `prose` with newline runs preserved
 *   - `- bullet` / `* bullet` / `+ bullet` → bullet `list`
 *   - `1. numbered` → numbered `list`
 *   - `- [ ]` / `- [x]` → checklist `list`
 *   - `> quote` (one or more contiguous lines, blockquote-prefixed)
 *     → `quote` (multi-line collapsed with newline runs)
 *   - `---` / `***` / `___` (alone on a line) → `divider`
 *   - inline marks: **bold**, *italic*, `code`, ~~strike~~, [link](href)
 *   - `![alt](asset_id)` → `image` with `asset_id` (alt becomes caption iff
 *     non-empty); URLs (http(s)://) are NOT supported and emit a warning.
 *
 * Out of scope (warning emitted, line skipped):
 *   - tables (`| a | b |` syntax)
 *   - fenced code blocks (``` ... ```)
 *   - HTML passthrough
 *   - reference-style links / images
 *
 * Why no third-party library: WYSIWYG-compound filter favors structured-
 * block primitives over HTML-first scaffolding. We only need the subset
 * agents will plausibly emit, and we want the output shape under our
 * direct control.
 */

import type {
  LeafSlideNode,
  HeadingNode,
  ProseNode,
  ListNode,
  QuoteNode,
  DividerNode,
  ImageNode,
} from '../ir/nodes.js';
import type { TextRun, RichText } from '../ir/rich-text.js';

// ── public surface ───────────────────────────────────────────────

export type WarningKind =
  | 'fenced_code_skipped'
  | 'table_skipped'
  | 'html_passthrough_skipped'
  | 'image_url_skipped'
  | 'unrecognised_line';

export interface CompileWarning {
  kind: WarningKind;
  /** 1-based line number where the issue was detected. */
  line: number;
  /** Short human-readable note. */
  message: string;
}

export interface CompileResult {
  nodes: LeafSlideNode[];
  warnings: CompileWarning[];
}

export function compileMarkdown(input: string): CompileResult {
  const lines = input.replace(/\r\n?/g, '\n').split('\n');
  const out: LeafSlideNode[] = [];
  const warnings: CompileWarning[] = [];

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i] ?? '';
    const line = raw.trimEnd();
    const lineNo = i + 1;

    // ── Blank line ──────────────────────────────────────────────
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // ── Fenced code (```), unsupported in v4.10 ─────────────────
    if (/^\s*```/.test(line)) {
      // Skip until the closing fence (or EOF).
      warnings.push({
        kind: 'fenced_code_skipped',
        line: lineNo,
        message: 'Fenced code blocks are not supported yet — block dropped.',
      });
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i] ?? '')) i += 1;
      if (i < lines.length) i += 1; // consume the closing fence
      continue;
    }

    // ── Table (`|` syntax), unsupported ────────────────────────
    if (line.startsWith('|') && line.includes('|', 1)) {
      warnings.push({
        kind: 'table_skipped',
        line: lineNo,
        message: 'Markdown tables are not supported yet — block dropped.',
      });
      while (
        i < lines.length &&
        (lines[i] ?? '').startsWith('|') &&
        (lines[i] ?? '').includes('|', 1)
      ) {
        i += 1;
      }
      continue;
    }

    // ── HTML passthrough, unsupported ──────────────────────────
    if (/^\s*<[a-zA-Z!]/.test(line)) {
      warnings.push({
        kind: 'html_passthrough_skipped',
        line: lineNo,
        message: 'Raw HTML is not supported — line dropped.',
      });
      i += 1;
      continue;
    }

    // ── Heading ────────────────────────────────────────────────
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      const text = parseInline(headingMatch[2]);
      const node: HeadingNode = { type: 'heading', level, text };
      out.push(node);
      i += 1;
      continue;
    }

    // ── Divider ────────────────────────────────────────────────
    if (/^(?:---|\*\*\*|___)\s*$/.test(line)) {
      const node: DividerNode = { type: 'divider' };
      out.push(node);
      i += 1;
      continue;
    }

    // ── Image (single line, alone) ─────────────────────────────
    const imageMatch = /^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(line);
    if (imageMatch) {
      const alt = imageMatch[1];
      const target = imageMatch[2].trim();
      if (/^https?:\/\//i.test(target) || /^\/\//.test(target)) {
        warnings.push({
          kind: 'image_url_skipped',
          line: lineNo,
          message:
            'Images by URL are not supported — pre-upload the asset and reference it by id.',
        });
        i += 1;
        continue;
      }
      const node: ImageNode = {
        type: 'image',
        asset_id: target,
        ...(alt ? { alt } : {}),
      };
      out.push(node);
      i += 1;
      continue;
    }

    // ── Blockquote ─────────────────────────────────────────────
    if (/^\s*>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i] ?? '')) {
        const stripped = (lines[i] ?? '').replace(/^\s*>\s?/, '');
        buf.push(stripped);
        i += 1;
      }
      const body = parseInlineMultiline(buf);
      const node: QuoteNode = { type: 'quote', body };
      out.push(node);
      continue;
    }

    // ── Lists ──────────────────────────────────────────────────
    const listKind = detectListKind(line);
    if (listKind) {
      const items: RichText[] = [];
      while (i < lines.length) {
        const li = lines[i] ?? '';
        if (li.trim() === '') break;
        const liKind = detectListKind(li);
        if (!liKind || liKind.style !== listKind.style) break;
        items.push(parseInline(liKind.text));
        i += 1;
      }
      if (items.length > 0) {
        const node: ListNode = {
          type: 'list',
          style: listKind.style,
          items,
        };
        out.push(node);
        continue;
      }
    }

    // ── Paragraph (default) ────────────────────────────────────
    const paragraphLines: string[] = [];
    while (i < lines.length) {
      const pl = lines[i] ?? '';
      if (pl.trim() === '') break;
      // Stop the paragraph the moment the line looks like a different
      // block kind so consecutive headings / lists don't get folded
      // into a paragraph above them.
      if (
        /^(#{1,6})\s+/.test(pl) ||
        /^(?:---|\*\*\*|___)\s*$/.test(pl) ||
        /^\s*>/.test(pl) ||
        detectListKind(pl) ||
        /^\s*!\[[^\]]*\]\([^)]+\)\s*$/.test(pl) ||
        /^\s*```/.test(pl) ||
        (pl.startsWith('|') && pl.includes('|', 1))
      ) {
        break;
      }
      paragraphLines.push(pl);
      i += 1;
    }
    if (paragraphLines.length > 0) {
      const body = parseInlineMultiline(paragraphLines);
      const node: ProseNode = { type: 'prose', body };
      out.push(node);
      continue;
    }

    // Unreachable in well-formed markdown; guard against infinite loops.
    warnings.push({
      kind: 'unrecognised_line',
      line: lineNo,
      message: `Could not classify line: ${line.slice(0, 60)}`,
    });
    i += 1;
  }

  return { nodes: out, warnings };
}

// ── helpers ──────────────────────────────────────────────────────

interface ListKind {
  style: 'bullet' | 'numbered' | 'checklist';
  text: string;
}

/**
 * Detect whether `line` is a list item; return the style + the
 * trimmed item text. Recognised forms:
 *   `- foo`, `* foo`, `+ foo`             → bullet
 *   `1. foo`, `42. foo`                    → numbered
 *   `- [ ] foo`, `- [x] foo`, `* [ ] foo`  → checklist
 */
function detectListKind(line: string): ListKind | null {
  // Checklist must be checked before plain bullet — `- [ ]` matches the
  // bullet pattern too.
  const checklist = /^\s*[-*+]\s+\[[ xX]\]\s+(.*)$/.exec(line);
  if (checklist) return { style: 'checklist', text: checklist[1] };
  const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
  if (bullet) return { style: 'bullet', text: bullet[1] };
  const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
  if (numbered) return { style: 'numbered', text: numbered[1] };
  return null;
}

/**
 * Parse multiple lines into a single RichText, preserving line breaks
 * as newline runs between content runs. Used for paragraphs and
 * blockquotes.
 */
function parseInlineMultiline(lines: ReadonlyArray<string>): RichText {
  const out: TextRun[] = [];
  for (let li = 0; li < lines.length; li += 1) {
    if (li > 0) out.push({ text: '\n' });
    for (const run of parseInline(lines[li] ?? '')) out.push(run);
  }
  return out.length > 0 ? out : [{ text: '' }];
}

/**
 * Parse a single line into a RichText. Recognises:
 *   `**bold**`, `__bold__`         → run.bold
 *   `*italic*`, `_italic_`         → run.italic
 *   `~~strike~~`                   → run.strike
 *   `` `code` ``                   → run.code
 *   `[label](href)`                → run.link
 *
 * Marks compose: `**[hot _link_](href)**` produces a single run with
 * bold + italic + link. Unrecognised syntax falls through as plain text.
 */
function parseInline(input: string): RichText {
  const runs: TextRun[] = [];
  walkInline(input, {}, runs);
  return mergeAdjacent(runs);
}

interface ActiveMarks {
  bold?: true;
  italic?: true;
  strike?: true;
  code?: true;
  link?: string;
}

function walkInline(input: string, marks: ActiveMarks, out: TextRun[]): void {
  let i = 0;
  while (i < input.length) {
    const remaining = input.slice(i);

    // Inline code — `` `…` ``. Code disables every other inline mark
    // inside it (matches CommonMark).
    if (remaining.startsWith('`')) {
      const close = remaining.indexOf('`', 1);
      if (close > 0) {
        out.push(makeRun(remaining.slice(1, close), { ...marks, code: true }));
        i += close + 1;
        continue;
      }
    }

    // Bold (** or __). Must come before italic so `**foo**` doesn't
    // parse as `*` + `*foo*` + `*`.
    if (remaining.startsWith('**') || remaining.startsWith('__')) {
      const delim = remaining.slice(0, 2);
      const close = remaining.indexOf(delim, 2);
      if (close > 0) {
        walkInline(remaining.slice(2, close), { ...marks, bold: true }, out);
        i += close + 2;
        continue;
      }
    }

    // Italic (* or _). Single delimiter — but skip when the next char
    // is also `*`/`_` (already covered by bold above).
    if (
      (remaining.startsWith('*') && !remaining.startsWith('**')) ||
      (remaining.startsWith('_') && !remaining.startsWith('__'))
    ) {
      const delim = remaining[0];
      // Look for a matching closing delimiter that isn't part of a
      // `**` or `__` cluster.
      let close = -1;
      for (let k = 1; k < remaining.length; k += 1) {
        if (remaining[k] === delim && remaining[k + 1] !== delim) {
          close = k;
          break;
        }
      }
      if (close > 0) {
        walkInline(remaining.slice(1, close), { ...marks, italic: true }, out);
        i += close + 1;
        continue;
      }
    }

    // Strikethrough (~~).
    if (remaining.startsWith('~~')) {
      const close = remaining.indexOf('~~', 2);
      if (close > 0) {
        walkInline(remaining.slice(2, close), { ...marks, strike: true }, out);
        i += close + 2;
        continue;
      }
    }

    // Link [label](href).
    const linkMatch = /^\[([^\]]*)\]\(([^)]+)\)/.exec(remaining);
    if (linkMatch) {
      const label = linkMatch[1];
      const href = linkMatch[2].trim();
      walkInline(label, { ...marks, link: href }, out);
      i += linkMatch[0].length;
      continue;
    }

    // Plain text: gather up to the next interesting boundary.
    let next = remaining.length;
    for (const tok of ['`', '**', '__', '*', '_', '~~', '[']) {
      const idx = remaining.indexOf(tok, 1);
      if (idx >= 0 && idx < next) next = idx;
    }
    if (next === 0) next = 1; // safety
    out.push(makeRun(remaining.slice(0, next), marks));
    i += next;
  }
}

function makeRun(text: string, marks: ActiveMarks): TextRun {
  if (text === '') return { text: '' };
  const run: TextRun = { text };
  if (marks.bold) run.bold = true;
  if (marks.italic) run.italic = true;
  if (marks.strike) run.strike = true;
  if (marks.code) run.code = true;
  if (marks.link) run.link = marks.link;
  return run;
}

/**
 * Merge adjacent runs with identical mark sets so the output isn't
 * needlessly fragmented after recursive descent.
 */
function mergeAdjacent(runs: TextRun[]): TextRun[] {
  const out: TextRun[] = [];
  for (const r of runs) {
    if (r.text === '') continue;
    const last = out[out.length - 1];
    if (last && sameMarks(last, r)) {
      out.push({ ...last, text: last.text + r.text });
      out.splice(out.length - 2, 1);
    } else {
      out.push(r);
    }
  }
  return out.length > 0 ? out : [{ text: '' }];
}

function sameMarks(a: TextRun, b: TextRun): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.strike === !!b.strike &&
    !!a.code === !!b.code &&
    (a.link ?? '') === (b.link ?? '')
  );
}
