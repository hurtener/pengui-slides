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
  CardNode,
  ChartNode,
  ChipNode,
  DecorationNode,
  DividerNode,
  FlowNode,
  FlowStep,
  GridNode,
  HeadingNode,
  HeroNode,
  ImageNode,
  LeafBlockNode,
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
import { getIconSvg } from './icons.js';
import { getOrnamentDef } from './ornaments.js';
import { getConnectorSvg } from './connectors.js';
import { renderRichText } from './rich-text-renderer.js';

/** Build the `data-ir-path="…"` attribute fragment for a given path. */
function pathAttr(path: IRPath): string {
  // No path → no attribute. Defensive guard for callers (e.g. tests)
  // that render a single node without a parent context.
  if (path.length === 0) return '';
  return ` data-ir-path="${escapeAttr(irPathToString(path))}"`;
}

/**
 * Build a `data-ir-node-type="<type>"` fragment. v4.11 — gives the
 * editor's bridge a precise signal for "is this block a leaf the user
 * can morph?" without having to reason about descendant rt-fields
 * (which compounds also have through their leaf children).
 *
 * Editor-only attribute: rendered output looks identical to humans;
 * the export pipeline ignores unknown data-* attributes. No
 * CURRENT_COMPILER_REVISION bump needed.
 */
function typeAttr(type: SlideNode['type']): string {
  return ` data-ir-node-type="${escapeAttr(type)}"`;
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
  const attr = pathAttr(path) + typeAttr(node.type);
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
    case 'chart':
      return renderChart(node, attr);
    case 'card':
      return renderCard(node, path, attr);
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
    case 'decoration':
      return renderDecoration(node, attr);
    case 'flow':
      return renderFlow(node, path, attr);
    case 'chip':
      return renderChip(node, attr);
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
  const frame = node.frame ?? 'none';
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
  const imgHtml = `<img src="asset://${escapeAttr(node.asset_id)}" alt="${escapeAttr(altText)}" />`;
  // v4.16: frame chrome wraps the image in a device-styled shell. The
  // chrome itself is CSS-driven (titlebar bar, traffic-light dots, phone
  // bezel, etc. — see `.pengui-frame-*` rules in layout-css.ts). The
  // SlideDocument compiler also reads the `pengui-frame-*` class to
  // emit the chrome as native PPTX shapes for editable parity.
  const framedImg =
    frame === 'none'
      ? imgHtml
      : renderFramedImage(frame, imgHtml);
  const frameClass = frame === 'none' ? '' : ` pengui-image-framed pengui-image-frame-${frame}`;
  return (
    `<figure class="pengui-image pengui-image-${fit}${frameClass}"${dataAttr}>` +
    framedImg +
    captionHtml +
    `</figure>`
  );
}

/** v4.16 — wrap an `<img>` in device-frame chrome. The chrome consists
 *  of a frame container + per-frame chrome elements (titlebar, traffic
 *  lights, status bar, etc.) that CSS positions absolutely around the
 *  image. The image itself sits in `.pengui-frame-content`. */
function renderFramedImage(frame: ImageNode['frame'], imgHtml: string): string {
  const frameKind = frame ?? 'none';
  if (frameKind === 'browser') {
    return (
      `<div class="pengui-frame pengui-frame-browser" aria-hidden="true">` +
      `<div class="pengui-frame-titlebar">` +
      `<span class="pengui-frame-dot pengui-frame-dot-close"></span>` +
      `<span class="pengui-frame-dot pengui-frame-dot-min"></span>` +
      `<span class="pengui-frame-dot pengui-frame-dot-max"></span>` +
      `<div class="pengui-frame-urlbar"></div>` +
      `</div>` +
      `<div class="pengui-frame-content">${imgHtml}</div>` +
      `</div>`
    );
  }
  if (frameKind === 'phone') {
    return (
      `<div class="pengui-frame pengui-frame-phone" aria-hidden="true">` +
      `<div class="pengui-frame-statusbar"></div>` +
      `<div class="pengui-frame-content">${imgHtml}</div>` +
      `<div class="pengui-frame-home-indicator"></div>` +
      `</div>`
    );
  }
  if (frameKind === 'desktop') {
    return (
      `<div class="pengui-frame pengui-frame-desktop" aria-hidden="true">` +
      `<div class="pengui-frame-bezel">` +
      `<div class="pengui-frame-content">${imgHtml}</div>` +
      `</div>` +
      `<div class="pengui-frame-stand"></div>` +
      `<div class="pengui-frame-base"></div>` +
      `</div>`
    );
  }
  if (frameKind === 'laptop') {
    return (
      `<div class="pengui-frame pengui-frame-laptop" aria-hidden="true">` +
      `<div class="pengui-frame-bezel">` +
      `<div class="pengui-frame-content">${imgHtml}</div>` +
      `</div>` +
      `<div class="pengui-frame-keyboard"></div>` +
      `</div>`
    );
  }
  return imgHtml;
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

/**
 * Chart node — emits a `<figure>` wrapping the rendered SVG.
 *
 * The inner SVG body is produced by the server-side ECharts renderer
 * (`src/domain/rendering/chart-renderer.ts`) at a render-boundary pass
 * (`resolveChartRefs`, parallel to `resolveAssetRefs`). Compile here is
 * synchronous + token-only, so we emit a placeholder body and a
 * `data-pengui-chart-spec` attribute carrying base64-JSON of the
 * structural payload — the resolver hands this to ChartRenderer along
 * with the soul-derived ECharts theme.
 *
 * Visual classes (`pengui-chart-${chart_type}`) let the soul CSS hook
 * type-specific layout knobs (e.g. squarish container for radar/heatmap).
 */
function renderChart(node: ChartNode, dataAttr: string): string {
  const spec = {
    chart_type: node.chart_type,
    data: node.data,
    series_labels: node.series_labels,
    category_labels: node.category_labels,
    x_axis_title: node.x_axis_title,
    y_axis_title: node.y_axis_title,
    show_legend: node.show_legend,
    show_grid: node.show_grid,
    value_format: node.value_format,
  };
  const specB64 = Buffer.from(JSON.stringify(spec), 'utf8').toString('base64');
  const captionHtml =
    node.caption && node.caption.length > 0
      ? `<figcaption class="pengui-chart-caption"${fieldAttr('caption')}>${renderRichText(node.caption)}</figcaption>`
      : '';
  // Placeholder SVG kept token-clean (var(--color-*), var(--text-*)) so it
  // passes diagram-legibility if the figure ever gets exported pre-resolve.
  // Track C overwrites the placeholder body with real ECharts SVG.
  const placeholder =
    `<svg class="pengui-chart-svg" viewBox="0 0 800 480" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">` +
    `<rect x="0" y="0" width="800" height="480" fill="var(--color-surface)" />` +
    `<text x="400" y="240" text-anchor="middle" font-size="var(--text-md)" fill="var(--color-text-secondary)">chart pending</text>` +
    `</svg>`;
  return (
    `<figure class="pengui-chart pengui-chart-${node.chart_type}"${dataAttr} data-pengui-chart-spec="${specB64}">` +
    placeholder +
    captionHtml +
    `</figure>`
  );
}

/**
 * v4.13 — `card` node. Presentational wrapper around inner leaves with
 * an optional semantic accent (top-border tint) and a curated lucide
 * icon glyph. Nests one level: `card.body` is `LeafBlockNode[]`, which
 * excludes nested cards.
 *
 * The accent class drives both `border-top-color` (via the
 * `pengui-card-accent-{role}` rule in layout-css) AND the icon color
 * (the icon SVG uses `currentColor`, and the same accent rule sets the
 * card's text color on the icon container). Default (no accent) keeps
 * a neutral border in the soul's `--color-border`.
 */
function renderCard(node: CardNode, path: IRPath, dataAttr: string): string {
  const accentClass = node.accent
    ? ` pengui-card-accent-${node.accent.replace(/_/g, '-')}`
    : '';
  // v4.19 — fill + border style modifiers. Defaults match the v4.13
  // top-accent-only behaviour. See the matching CSS in layout-css.ts.
  const fillClass = node.fill && node.fill !== 'none'
    ? ` pengui-card-fill-${node.fill}`
    : '';
  const borderClass = node.border_style && node.border_style !== 'solid'
    ? ` pengui-card-border-${node.border_style}`
    : '';
  const iconHtml = node.icon
    ? `<span class="pengui-card-icon" aria-hidden="true">${getIconSvg(node.icon)}</span>`
    : '';
  const eyebrowHtml =
    node.eyebrow && node.eyebrow.length > 0
      ? `<p class="pengui-card-eyebrow"${fieldAttr('eyebrow')}>${renderRichText(node.eyebrow)}</p>`
      : '';
  const bodyHtml = node.body
    .map((n: LeafBlockNode, i) => renderNode(n, [...path, 'body', i]))
    .join('');
  return (
    `<article class="pengui-card${accentClass}${fillClass}${borderClass}"${dataAttr}>` +
    iconHtml +
    eyebrowHtml +
    `<div class="pengui-card-body">${bodyHtml}</div>` +
    `</article>`
  );
}

// v4.19 — chip / pill renderer. Inline visual primitive for category
// labels (CERTIFIED, PRECOMPUTED), workspace badges (● dev), and
// solution eyebrows. Tone variants drive background + text styling
// via CSS in layout-css.ts.
function renderChip(node: ChipNode, dataAttr: string): string {
  const accent = node.accent ?? 'accent';
  const tone = node.tone ?? 'tint';
  const accentClass = ` pengui-chip-accent-${accent.replace(/_/g, '-')}`;
  const toneClass = ` pengui-chip-tone-${tone}`;
  const dotHtml = node.dot
    ? '<span class="pengui-chip-dot" aria-hidden="true"></span>'
    : '';
  return (
    `<span class="pengui-chip${accentClass}${toneClass}"${dataAttr}>` +
    dotHtml +
    `<span class="pengui-chip-label">${renderRichText(node.label)}</span>` +
    `</span>`
  );
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

/** v4.16 — render a decoration node (asset_ref or preset). Decoration
 *  is purely visual: emits an `<aside>` taken out of the body's flex
 *  flow via absolute positioning. Anchor + offset + size compose into
 *  inline `style` because they are geometry, not theme — every other
 *  styling concern goes through soul tokens. */
function renderDecoration(node: DecorationNode, dataAttr: string): string {
  const layer = node.layer;
  const anchor = node.placement.anchor;
  const isBleed = anchor.startsWith('bleed_');
  const accent = node.accent ?? 'accent';

  const offsetX = node.placement.offset?.x ?? 0;
  const offsetY = node.placement.offset?.y ?? 0;

  // Default size: asset uses natural dims (let CSS size:auto pick),
  // preset uses its registered default. Authors can override either.
  let widthPx: number | undefined = node.placement.size?.width;
  let heightPx: number | undefined = node.placement.size?.height;
  let innerHtml: string;
  if (node.source.kind === 'preset') {
    const def = getOrnamentDef(node.source.name);
    if (widthPx === undefined) widthPx = def.defaultWidth;
    if (heightPx === undefined) heightPx = def.defaultHeight;
    innerHtml = def.svg;
  } else {
    innerHtml = `<img src="asset://${escapeAttr(node.source.asset_id)}" alt="" />`;
  }

  // Anchor-driven positioning. The slide-root CSS is `position: relative`
  // (already true for the slide frame), so absolute children resolve
  // against the canvas. Bleed anchors use negative inset values via the
  // `pengui-decoration-bleed` modifier in CSS — the inline style only
  // carries the offset numbers; the anchor class picks the inset side(s).
  const styleParts: string[] = [];
  if (widthPx !== undefined) styleParts.push(`width:${widthPx}px`);
  if (heightPx !== undefined) styleParts.push(`height:${heightPx}px`);
  if (offsetX !== 0) styleParts.push(`--pengui-deco-dx:${offsetX}px`);
  if (offsetY !== 0) styleParts.push(`--pengui-deco-dy:${offsetY}px`);
  if (node.placement.rotation !== undefined) {
    styleParts.push(`transform:rotate(${node.placement.rotation}deg)`);
  }
  if (node.placement.opacity !== undefined) {
    styleParts.push(`opacity:${node.placement.opacity}`);
  }
  const styleAttr = styleParts.length > 0 ? ` style="${styleParts.join(';')}"` : '';

  const sourceClass = `pengui-decoration-source-${node.source.kind === 'preset' ? 'preset' : 'asset'}`;
  const bleedClass = isBleed ? ' pengui-decoration-bleed' : '';
  const accentClass = node.source.kind === 'preset' ? ` pengui-text-${accent}` : '';

  return (
    `<aside class="pengui-decoration pengui-decoration-${layer}` +
    ` pengui-decoration-anchor-${anchor.replace(/_/g, '-')}` +
    `${bleedClass} ${sourceClass}${accentClass}"` +
    `${styleAttr}` +
    ` aria-hidden="true"${dataAttr}>` +
    innerHtml +
    `</aside>`
  );
}

/** v4.17 — render a flow node. Emits an `<ol>` of step pills with
 *  connector `<li>`s interleaved between them. Cycle connector adds a
 *  closing return-arrow after the last step (the visual "loops back"
 *  cue without literally drawing a curved wrap). */
function renderFlow(node: FlowNode, path: IRPath, dataAttr: string): string {
  const direction = node.direction;
  const connector = node.connector;
  const stepCount = node.steps.length;
  const isCycle = connector === 'cycle';

  const stepHtmls: string[] = [];
  for (let i = 0; i < stepCount; i++) {
    stepHtmls.push(
      renderFlowStep(node.steps[i], i, [...path, 'steps', i]),
    );
    // Connector between steps
    if (i < stepCount - 1) {
      stepHtmls.push(renderFlowConnector(connector, false));
    }
  }
  // Cycle: add a closing return arrow after the last step.
  if (isCycle) {
    stepHtmls.push(renderFlowConnector(connector, true));
  }

  return (
    `<ol class="pengui-flow pengui-flow-${direction} pengui-flow-connector-${connector}"${dataAttr}>` +
    stepHtmls.join('') +
    `</ol>`
  );
}

function renderFlowStep(step: FlowStep, index: number, path: IRPath): string {
  const accent = step.accent ?? 'muted';
  const accentClass = ` pengui-flow-step-accent-${accent}`;
  const pathStr = pathAttr(path);
  const iconHtml = step.icon
    ? `<span class="pengui-flow-step-icon" aria-hidden="true">${getIconSvg(step.icon)}</span>`
    : '';
  const badgeHtml = step.badge
    ? `<span class="pengui-flow-step-badge">${escapeAttr(step.badge)}</span>`
    : '';
  return (
    `<li class="pengui-flow-step${accentClass}"${pathStr} data-ir-flow-step="${index}">` +
    badgeHtml +
    iconHtml +
    `<p class="pengui-flow-step-label"${fieldAttr('label')}>${renderRichText(step.label)}</p>` +
    `</li>`
  );
}

function renderFlowConnector(connector: FlowNode['connector'], isReturn: boolean): string {
  const returnClass = isReturn ? ' pengui-flow-connector-return' : '';
  return (
    `<li class="pengui-flow-connector pengui-flow-connector-glyph-${connector}${returnClass}" aria-hidden="true">` +
    getConnectorSvg(connector) +
    `</li>`
  );
}

/**
 * Compile a body array. The default `basePath` of `["body"]` matches
 * the IRPath grammar that `replaceNodeAtPath` enforces — every node
 * root ends up with `data-ir-path="body,…"`.
 */
export function renderNodeList(nodes: SlideNode[], basePath: IRPath = ['body']): string {
  return nodes.map((n, i) => renderNode(n, [...basePath, i])).join('');
}
