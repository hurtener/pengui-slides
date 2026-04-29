/**
 * Per-node-type HTML emitters, shared between slide-mode and
 * section-mode compilers.
 *
 * Output classes use the `pengui-*` namespace so the matching CSS
 * (slide-css.ts / section-css.ts) styles them via Soul tokens. The
 * compiler emits TOKEN-only styling — never literal hex / px.
 *
 * Asset references emit `asset://UUID` URIs; the existing
 * `asset-resolver.ts` swaps these for data URIs at render boundaries
 * so we keep this compiler synchronous and base64-free.
 *
 * v4.8.5 — every node root carries `data-ir-path="body,N[,key,M…]"`,
 * the structural pointer that `replaceNodeAtPath` accepts. The MCP App
 * reads this attribute on pin-mode click; the agent reads it back from
 * `list_comments` and feeds it straight into `apply_slide_node_edit`.
 * No second compiler, no DOM-walking heuristics — the truth lives where
 * it always lived: in the IR path itself.
 */

import type {
  BibliographyNode,
  CalloutNode,
  DividerNode,
  GridNode,
  HeadingNode,
  HeroNode,
  ImageNode,
  LeafSlideNode,
  ListNode,
  PageBreakNode,
  ProseNode,
  QuoteNode,
  SectionDividerNode,
  SlideNode,
  TableNode,
  TocNode,
  TwoColumnNode,
} from '../nodes.js';
import type { IRPath } from '../operations/replace-node.js';
import { irPathToString } from '../path-encoding.js';
import { ErrorCode, PenguiError } from '../../../types/errors.js';
import { escapeAttr } from './escape.js';
import { renderRichText } from './rich-text-renderer.js';

/** Build the `data-ir-path="…"` attribute fragment for a given path. */
function pathAttr(path: IRPath): string {
  // No path → no attribute. Defensive guard for callers (e.g. tests)
  // that render a single node without a parent context.
  if (path.length === 0) return '';
  return ` data-ir-path="${escapeAttr(irPathToString(path))}"`;
}

/**
 * Compile a single SlideNode at the given IR path.
 *
 * `path` is the structural pointer that addresses this node inside the
 * containing SlideIR / SectionIR (e.g. `["body", 0]` or
 * `["body", 2, "left", 1]`). It's emitted as a `data-ir-path` attribute
 * on the node's root element so the App and the agent share the same
 * coordinate system.
 */
export function renderNode(node: SlideNode, path: IRPath = []): string {
  const attr = pathAttr(path);
  switch (node.type) {
    case 'hero':
      return renderHero(node, attr);
    case 'prose':
      return renderProse(node, attr);
    case 'image':
      return renderImage(node, attr);
    case 'callout':
      return renderCallout(node, attr);
    case 'heading':
      return renderHeading(node, attr);
    case 'list':
      return renderList(node, attr);
    case 'divider':
      return renderDivider(node, attr);
    case 'quote':
      return renderQuote(node, attr);
    case 'table':
      return renderTable(node, attr);
    case 'two_column':
      return renderTwoColumn(node, path, attr);
    case 'grid':
      return renderGrid(node, path, attr);
    case 'toc':
      return renderToc(node, attr);
    case 'section_divider':
      return renderSectionDivider(node, attr);
    case 'bibliography':
      return renderBibliography(node, attr);
    case 'page_break':
      return renderPageBreak(node, attr);
  }
}

/**
 * Build a `data-ir-rt-field="<name>"` attribute fragment. Used by the
 * MCP App in v4.9c to make rich-text fields directly editable inline:
 * a click on a marked element activates contentEditable; on commit the
 * App posts the parsed body back through `apply_slide_field_edit` /
 * `apply_section_field_edit`. The field name addresses one slot inside
 * the IR node carrying the closest `data-ir-path` ancestor.
 */
function fieldAttr(field: string): string {
  return ` data-ir-rt-field="${escapeAttr(field)}"`;
}

function renderHero(node: HeroNode, dataAttr: string): string {
  const align = node.align ?? 'left';
  const parts: string[] = [];
  if (node.eyebrow && node.eyebrow.length > 0) {
    parts.push(
      `<p class="pengui-hero-eyebrow"${fieldAttr('eyebrow')}>${renderRichText(node.eyebrow)}</p>`,
    );
  }
  parts.push(
    `<h1 class="pengui-hero-title"${fieldAttr('title')}>${renderRichText(node.title)}</h1>`,
  );
  if (node.subtitle && node.subtitle.length > 0) {
    parts.push(
      `<p class="pengui-hero-subtitle"${fieldAttr('subtitle')}>${renderRichText(node.subtitle)}</p>`,
    );
  }
  return `<div class="pengui-hero pengui-align-${align}"${dataAttr}>${parts.join('')}</div>`;
}

function renderProse(node: ProseNode, dataAttr: string): string {
  const align = node.align ?? 'left';
  return `<p class="pengui-prose pengui-align-${align}"${dataAttr}${fieldAttr('body')}>${renderRichText(node.body)}</p>`;
}

function renderImage(node: ImageNode, dataAttr: string): string {
  const fit = node.fit ?? 'contain';
  // Author-supplied alt wins; caption is the fallback. Empty string is a
  // valid intentional value (decorative image — screen readers skip it).
  const altText =
    typeof node.alt === 'string'
      ? node.alt
      : node.caption && node.caption.length > 0
        ? node.caption.map((r) => r.text).join('')
        : '';
  const captionHtml =
    node.caption && node.caption.length > 0
      ? `<figcaption class="pengui-image-caption"${fieldAttr('caption')}>${renderRichText(node.caption)}</figcaption>`
      : '';
  return (
    `<figure class="pengui-image pengui-image-${fit}"${dataAttr}>` +
    `<img src="asset://${escapeAttr(node.asset_id)}" alt="${escapeAttr(altText)}" />` +
    captionHtml +
    `</figure>`
  );
}

function renderCallout(node: CalloutNode, dataAttr: string): string {
  const titleHtml = node.title && node.title.length > 0
    ? `<p class="pengui-callout-title"${fieldAttr('title')}>${renderRichText(node.title)}</p>`
    : '';
  return (
    `<aside class="pengui-callout pengui-callout-${node.kind}"${dataAttr}>` +
    titleHtml +
    `<div class="pengui-callout-body"${fieldAttr('body')}>${renderRichText(node.body)}</div>` +
    `</aside>`
  );
}

function renderHeading(node: HeadingNode, dataAttr: string): string {
  const align = node.align ?? 'left';
  const tag = `h${node.level}`;
  return `<${tag} class="pengui-heading pengui-heading-${node.level} pengui-align-${align}"${dataAttr}${fieldAttr('text')}>${renderRichText(node.text)}</${tag}>`;
}

function renderList(node: ListNode, dataAttr: string): string {
  const tag = node.style === 'numbered' ? 'ol' : 'ul';
  const items = node.items
    .map(
      (item, i) =>
        `<li class="pengui-list-item"${fieldAttr(`items[${i}]`)}>${renderRichText(item)}</li>`,
    )
    .join('');
  return `<${tag} class="pengui-list pengui-list-${node.style}"${dataAttr}>${items}</${tag}>`;
}

function renderDivider(node: DividerNode, dataAttr: string): string {
  const spacing = node.spacing ?? 'md';
  return `<hr class="pengui-divider pengui-divider-${spacing}"${dataAttr} />`;
}

function renderQuote(node: QuoteNode, dataAttr: string): string {
  const attribution =
    node.attribution && node.attribution.length > 0
      ? `<cite class="pengui-quote-attribution"${fieldAttr('attribution')}>${renderRichText(node.attribution)}</cite>`
      : '';
  return (
    `<blockquote class="pengui-quote"${dataAttr}>` +
    `<p class="pengui-quote-body"${fieldAttr('body')}>${renderRichText(node.body)}</p>` +
    attribution +
    `</blockquote>`
  );
}

function renderTable(node: TableNode, dataAttr: string): string {
  // Render-time consistency check (the schema can't .refine inside a
  // discriminatedUnion). Defer the diagnostic to validation rather than
  // throwing — agents see it as a normal Stage 1 issue.
  // For now, pad short rows with empty cells so the HTML stays well-formed.
  const headers = node.headers ?? null;
  const expectedCols = headers
    ? headers.length
    : Math.max(...node.rows.map((r) => r.length));

  const captionHtml =
    node.caption && node.caption.length > 0
      ? `<caption class="pengui-table-caption">${renderRichText(node.caption)}</caption>`
      : '';

  const headHtml = headers
    ? `<thead><tr>${headers.map((h) => `<th class="pengui-table-th" scope="col">${renderRichText(h)}</th>`).join('')}</tr></thead>`
    : '';

  const bodyHtml = `<tbody>${node.rows
    .map((row) => {
      const cells: string[] = [];
      for (let i = 0; i < expectedCols; i++) {
        const cell = row[i];
        cells.push(`<td class="pengui-table-td">${cell ? renderRichText(cell) : ''}</td>`);
      }
      return `<tr>${cells.join('')}</tr>`;
    })
    .join('')}</tbody>`;

  return `<table class="pengui-table"${dataAttr}>${captionHtml}${headHtml}${bodyHtml}</table>`;
}

function renderTwoColumn(node: TwoColumnNode, path: IRPath, dataAttr: string): string {
  const ratio = node.ratio ?? '1:1';
  const ratioClass = ratio.replace(':', '-'); // "1:2" → "1-2"
  const gap = node.gap ?? 'md';
  const left = node.left
    .map((n: LeafSlideNode, i) => renderNode(n, [...path, 'left', i]))
    .join('');
  const right = node.right
    .map((n: LeafSlideNode, i) => renderNode(n, [...path, 'right', i]))
    .join('');
  return (
    `<div class="pengui-two-column pengui-two-column-${ratioClass} pengui-gap-${gap}"${dataAttr}>` +
    `<div class="pengui-two-column-left">${left}</div>` +
    `<div class="pengui-two-column-right">${right}</div>` +
    `</div>`
  );
}

function renderGrid(node: GridNode, path: IRPath, dataAttr: string): string {
  const cols = node.columns;
  const gap = node.gap ?? 'md';
  const align = node.align_items ?? 'start';
  // Render-time consistency: cell count must be a multiple of columns,
  // and ratio (if provided) must have exactly `columns` weights.
  if (node.cells.length % cols !== 0) {
    throw new PenguiError(
      ErrorCode.INVALID_INPUT,
      `grid.cells.length (${node.cells.length}) must be a multiple of columns (${cols})`,
    );
  }
  if (node.ratio) {
    const parts = node.ratio.split(':');
    if (parts.length !== cols) {
      throw new PenguiError(
        ErrorCode.INVALID_INPUT,
        `grid.ratio "${node.ratio}" has ${parts.length} parts but columns=${cols}`,
      );
    }
  }
  // Weighted grid template via inline style — converts ratio "2:1:1" to
  // "2fr 1fr 1fr". Default (no ratio) leaves it to the class repeat(N,1fr).
  const ratioStyle =
    node.ratio
      ? ` style="grid-template-columns: ${node.ratio
          .split(':')
          .map((w) => `${w}fr`)
          .join(' ')};"`
      : '';
  const cellsHtml = node.cells
    .map(
      (cell, rowIdx) =>
        `<div class="pengui-grid-cell">${cell
          .map((n: LeafSlideNode, j) => renderNode(n, [...path, 'cells', rowIdx, j]))
          .join('')}</div>`,
    )
    .join('');
  return (
    `<div class="pengui-grid pengui-grid-cols-${cols} pengui-gap-${gap} pengui-grid-align-${align}"${ratioStyle}${dataAttr}>` +
    cellsHtml +
    `</div>`
  );
}

function renderToc(node: TocNode, dataAttr: string): string {
  const titleText = node.title && node.title.length > 0 ? renderRichText(node.title) : 'Contents';
  const includeKinds = node.include_kinds ?? ['chapter_header'];
  const maxDepth = node.max_depth ?? 1;
  // The doc composer fills in the <ol> via target-counter at print time.
  // We emit a placeholder marker the composer detects and rewrites.
  const dataInclude = escapeAttr(includeKinds.join(','));
  return (
    `<nav class="pengui-toc" data-pengui-toc="auto" data-pengui-toc-include="${dataInclude}" data-pengui-toc-depth="${maxDepth}"${dataAttr}>` +
    `<h2 class="pengui-toc-title">${titleText}</h2>` +
    `<ol class="pengui-toc-list"></ol>` +
    `</nav>`
  );
}

function renderSectionDivider(node: SectionDividerNode, dataAttr: string): string {
  const ornament = node.ornament ?? 'rule';
  const labelHtml =
    node.label && node.label.length > 0
      ? `<p class="pengui-section-divider-label">${renderRichText(node.label)}</p>`
      : '';
  const ornamentHtml =
    ornament === 'none'
      ? ''
      : `<span class="pengui-section-divider-ornament pengui-section-divider-ornament-${ornament}" aria-hidden="true"></span>`;
  return (
    `<div class="pengui-section-divider"${dataAttr}>` +
    ornamentHtml +
    labelHtml +
    `</div>`
  );
}

function renderBibliography(node: BibliographyNode, dataAttr: string): string {
  const titleText =
    node.title && node.title.length > 0 ? renderRichText(node.title) : 'References';
  const items = node.entries
    .map((entry) => {
      const idAttr = entry.id ? ` id="${escapeAttr(`bib-${entry.id}`)}"` : '';
      return `<li class="pengui-bibliography-item"${idAttr}>${renderRichText(entry.text)}</li>`;
    })
    .join('');
  // `<aside>` (not `<section>`) — when a bibliography node sits inside a
  // section wrapper, nested `<section>` is valid HTML5 but conflicts with
  // the structural lint's "single root section" framing and is awkward
  // semantically. Aside matches the existing pengui-callout precedent for
  // self-contained tangential content.
  return (
    `<aside class="pengui-bibliography"${dataAttr}>` +
    `<h2 class="pengui-bibliography-title">${titleText}</h2>` +
    `<ol class="pengui-bibliography-list">${items}</ol>` +
    `</aside>`
  );
}

function renderPageBreak(_node: PageBreakNode, dataAttr: string): string {
  return `<div class="pengui-page-break" aria-hidden="true"${dataAttr}></div>`;
}

/**
 * Compile a body array. The default `basePath` of `["body"]` matches
 * the IRPath grammar that `replaceNodeAtPath` enforces — every node
 * root ends up with `data-ir-path="body,…"`.
 */
export function renderNodeList(nodes: SlideNode[], basePath: IRPath = ['body']): string {
  return nodes.map((n, i) => renderNode(n, [...basePath, i])).join('');
}
