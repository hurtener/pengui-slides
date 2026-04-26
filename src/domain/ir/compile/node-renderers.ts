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
 */

import type {
  CalloutNode,
  DividerNode,
  HeadingNode,
  HeroNode,
  ImageNode,
  LeafSlideNode,
  ListNode,
  ProseNode,
  QuoteNode,
  SlideNode,
  TableNode,
  TwoColumnNode,
} from '../nodes.js';
import { escapeAttr } from './escape.js';
import { renderRichText } from './rich-text-renderer.js';

export function renderNode(node: SlideNode): string {
  switch (node.type) {
    case 'hero':
      return renderHero(node);
    case 'prose':
      return renderProse(node);
    case 'image':
      return renderImage(node);
    case 'callout':
      return renderCallout(node);
    case 'heading':
      return renderHeading(node);
    case 'list':
      return renderList(node);
    case 'divider':
      return renderDivider(node);
    case 'quote':
      return renderQuote(node);
    case 'table':
      return renderTable(node);
    case 'two_column':
      return renderTwoColumn(node);
  }
}

function renderHero(node: HeroNode): string {
  const align = node.align ?? 'left';
  const parts: string[] = [];
  if (node.eyebrow && node.eyebrow.length > 0) {
    parts.push(`<p class="pengui-hero-eyebrow">${renderRichText(node.eyebrow)}</p>`);
  }
  parts.push(`<h1 class="pengui-hero-title">${renderRichText(node.title)}</h1>`);
  if (node.subtitle && node.subtitle.length > 0) {
    parts.push(`<p class="pengui-hero-subtitle">${renderRichText(node.subtitle)}</p>`);
  }
  return `<div class="pengui-hero pengui-align-${align}">${parts.join('')}</div>`;
}

function renderProse(node: ProseNode): string {
  const align = node.align ?? 'left';
  return `<p class="pengui-prose pengui-align-${align}">${renderRichText(node.body)}</p>`;
}

function renderImage(node: ImageNode): string {
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
      ? `<figcaption class="pengui-image-caption">${renderRichText(node.caption)}</figcaption>`
      : '';
  return (
    `<figure class="pengui-image pengui-image-${fit}">` +
    `<img src="asset://${escapeAttr(node.asset_id)}" alt="${escapeAttr(altText)}" />` +
    captionHtml +
    `</figure>`
  );
}

function renderCallout(node: CalloutNode): string {
  const titleHtml = node.title && node.title.length > 0
    ? `<p class="pengui-callout-title">${renderRichText(node.title)}</p>`
    : '';
  return (
    `<aside class="pengui-callout pengui-callout-${node.kind}">` +
    titleHtml +
    `<div class="pengui-callout-body">${renderRichText(node.body)}</div>` +
    `</aside>`
  );
}

function renderHeading(node: HeadingNode): string {
  const align = node.align ?? 'left';
  const tag = `h${node.level}`;
  return `<${tag} class="pengui-heading pengui-heading-${node.level} pengui-align-${align}">${renderRichText(node.text)}</${tag}>`;
}

function renderList(node: ListNode): string {
  const tag = node.style === 'numbered' ? 'ol' : 'ul';
  const items = node.items
    .map((item) => `<li class="pengui-list-item">${renderRichText(item)}</li>`)
    .join('');
  return `<${tag} class="pengui-list pengui-list-${node.style}">${items}</${tag}>`;
}

function renderDivider(node: DividerNode): string {
  const spacing = node.spacing ?? 'md';
  return `<hr class="pengui-divider pengui-divider-${spacing}" />`;
}

function renderQuote(node: QuoteNode): string {
  const attribution =
    node.attribution && node.attribution.length > 0
      ? `<cite class="pengui-quote-attribution">${renderRichText(node.attribution)}</cite>`
      : '';
  return (
    `<blockquote class="pengui-quote">` +
    `<p class="pengui-quote-body">${renderRichText(node.body)}</p>` +
    attribution +
    `</blockquote>`
  );
}

function renderTable(node: TableNode): string {
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

  return `<table class="pengui-table">${captionHtml}${headHtml}${bodyHtml}</table>`;
}

function renderTwoColumn(node: TwoColumnNode): string {
  const ratio = node.ratio ?? '1:1';
  const ratioClass = ratio.replace(':', '-'); // "1:2" → "1-2"
  const gap = node.gap ?? 'md';
  const left = node.left.map((n: LeafSlideNode) => renderNode(n)).join('');
  const right = node.right.map((n: LeafSlideNode) => renderNode(n)).join('');
  return (
    `<div class="pengui-two-column pengui-two-column-${ratioClass} pengui-gap-${gap}">` +
    `<div class="pengui-two-column-left">${left}</div>` +
    `<div class="pengui-two-column-right">${right}</div>` +
    `</div>`
  );
}

export function renderNodeList(nodes: SlideNode[]): string {
  return nodes.map(renderNode).join('');
}
