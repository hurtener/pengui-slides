import type {
  SlideDocument,
  SlideElement,
  SlideElementStyle,
  SlideExportDisposition,
} from '../../types/slide-document.js';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toPx(value?: number): string | null {
  return value === undefined ? null : `${Math.round(value * 1000) / 1000}px`;
}

function styleToCss(style: SlideElementStyle, includeText: boolean = true): string[] {
  const css: string[] = [];

  if (style.backgroundColor) css.push(`background:${style.backgroundColor}`);
  if (style.backgroundImage) css.push(`background-image:${style.backgroundImage}`);
  if (style.backgroundSize) css.push(`background-size:${style.backgroundSize}`);
  if (style.backgroundPosition) css.push(`background-position:${style.backgroundPosition}`);
  if (style.backgroundRepeat) css.push(`background-repeat:${style.backgroundRepeat}`);
  if (style.color && includeText) css.push(`color:${style.color}`);
  if (style.borderColor && style.borderWidth) {
    css.push(`border:${style.borderWidth}px ${style.borderStyle ?? 'solid'} ${style.borderColor}`);
  } else if (style.borderWidth === 0) {
    css.push('border:none');
  }
  if (style.borderRadius !== undefined) css.push(`border-radius:${style.borderRadius}px`);
  if (style.fontFamily && includeText) css.push(`font-family:${style.fontFamily}`);
  if (style.fontSize !== undefined && includeText) css.push(`font-size:${style.fontSize}px`);
  if (style.fontWeight !== undefined && includeText) css.push(`font-weight:${style.fontWeight}`);
  if (style.fontStyle && includeText) css.push(`font-style:${style.fontStyle}`);
  if (style.lineHeight !== undefined && includeText) css.push(`line-height:${style.lineHeight}`);
  if (style.letterSpacing !== undefined && includeText) css.push(`letter-spacing:${style.letterSpacing}px`);
  if (style.textAlign && includeText) css.push(`text-align:${style.textAlign}`);
  if (style.whiteSpace && includeText) css.push(`white-space:${style.whiteSpace}`);
  if (style.objectFit) css.push(`object-fit:${style.objectFit}`);
  if (style.paddingTop !== undefined) css.push(`padding-top:${style.paddingTop}px`);
  if (style.paddingRight !== undefined) css.push(`padding-right:${style.paddingRight}px`);
  if (style.paddingBottom !== undefined) css.push(`padding-bottom:${style.paddingBottom}px`);
  if (style.paddingLeft !== undefined) css.push(`padding-left:${style.paddingLeft}px`);
  if (style.boxShadow) {
    css.push(`box-shadow:${style.boxShadow}`);
  } else if (style.shadow) {
    css.push(
      `box-shadow:${style.shadow.offsetX ?? 0}px ${style.shadow.offsetY ?? 0}px ${style.shadow.blur ?? 0}px ${style.shadow.color ?? 'rgba(0,0,0,0.18)'}`,
    );
  }
  if (style.filter) css.push(`filter:${style.filter}`);
  if (style.backdropFilter) css.push(`backdrop-filter:${style.backdropFilter}`);
  if (style.mixBlendMode) css.push(`mix-blend-mode:${style.mixBlendMode}`);
  if (style.opacity !== undefined) css.push(`opacity:${style.opacity}`);

  return css;
}

function frameCss(element: SlideElement): string {
  const css = [
    'position:absolute',
    `left:${toPx(element.x)}`,
    `top:${toPx(element.y)}`,
    `width:${toPx(element.width)}`,
    `height:${toPx(element.height)}`,
    `transform:rotate(${element.rotation}deg)`,
    `opacity:${element.opacity}`,
    `z-index:${element.zIndex}`,
    ...styleToCss(element.style),
  ];

  return css.join(';');
}

function renderElement(element: SlideElement): string {
  switch (element.kind) {
    case 'text': {
      const attrs = [
        `data-document-id="${escapeHtml(element.id)}"`,
        element.editId ? `data-edit-id="${escapeHtml(element.editId)}"` : '',
      ].filter(Boolean).join(' ');
      return `<div ${attrs} style="${frameCss(element)}">${escapeHtml(element.text).replace(/\n/g, '<br>')}</div>`;
    }
    case 'image':
      return `<img data-document-id="${escapeHtml(element.id)}" src="${escapeHtml(element.src)}" alt="${escapeHtml(element.alt ?? '')}" style="${frameCss(element)}">`;
    case 'shape':
      return `<div data-document-id="${escapeHtml(element.id)}" style="${frameCss(element)}"></div>`;
    case 'table': {
      const rows = Array.from({ length: element.rows }, (_, row) => {
        const cells = Array.from({ length: element.columns }, (_, column) => {
          const cell = element.cells.find((item) => item.row === row && item.column === column);
          const cellStyle = cell?.style ? styleToCss(cell.style).join(';') : '';
          return `<td style="${cellStyle}">${escapeHtml(cell?.text ?? '').replace(/\n/g, '<br>')}</td>`;
        }).join('');
        return `<tr>${cells}</tr>`;
      }).join('');
      const tableCss = `${frameCss(element)};border-collapse:collapse`;
      return `<table data-document-id="${escapeHtml(element.id)}" style="${tableCss}">${rows}</table>`;
    }
    case 'group':
      return '';
  }
}

export class SlideDocumentRenderer {
  render(
    document: SlideDocument,
    options?: {
      includeDispositions?: SlideExportDisposition[];
    },
  ): string {
    const includeDispositions = options?.includeDispositions;
    const elements = [...document.elements]
      .filter((element) => {
        if (!includeDispositions || includeDispositions.length === 0) {
          return true;
        }
        return includeDispositions.includes(element.exportDisposition ?? 'native');
      })
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((element) => renderElement(element))
      .join('\n    ');
    const backgroundCss = [
      document.backgroundColor ? `background-color:${document.backgroundColor}` : 'background-color:#ffffff',
      document.backgroundImage ? `background-image:${document.backgroundImage}` : null,
      document.backgroundSize ? `background-size:${document.backgroundSize}` : null,
      document.backgroundPosition ? `background-position:${document.backgroundPosition}` : null,
      document.backgroundRepeat ? `background-repeat:${document.backgroundRepeat}` : null,
    ].filter(Boolean).join(';');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    .slide {
      position: relative;
      width: ${document.width}px;
      height: ${document.height}px;
      overflow: hidden;
      ${backgroundCss};
    }
    .slide [data-edit-id] { cursor: text; }
    table, td { border: 1px solid rgba(0,0,0,0.12); }
    td { vertical-align: top; }
  </style>
</head>
<body>
  <div class="slide">
    ${elements}
  </div>
</body>
</html>`;
  }
}
