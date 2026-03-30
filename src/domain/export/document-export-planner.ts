import type { Slide } from '../../types/deck.js';
import type {
  SlideDocument,
  SlideElement,
  SlideImageElement,
  SlideShapeElement,
  SlideTableElement,
  SlideTextElement,
} from '../../types/slide-document.js';
import {
  colorTokenCount,
  isTransparent,
} from './export-style-utils.js';

export interface PlannedTextElement extends SlideTextElement {
  textBackdrop?: string;
  textAlignment?: 'left' | 'center' | 'right' | 'justify';
  contentAlignment?: 'top' | 'middle' | 'bottom';
  lineSpacingPercent?: number;
}

export type PlannedNativeElement =
  | PlannedTextElement
  | SlideShapeElement
  | SlideImageElement
  | SlideTableElement;

export interface PlannedSlideExport {
  document: SlideDocument;
  nativeSourceElements: SlideElement[];
  nativeElements: PlannedNativeElement[];
  blockedElements: SlideElement[];
  usedBackgroundFallback: boolean;
  backgroundHtml?: string;
  nativeObjectCount: number;
}

export class DocumentExportPlanner {
  hasRuntimeBackgroundFallbackCandidates(document: SlideDocument): boolean {
    return document.elements.some((element) => Boolean(this.runtimeFallbackReason(element, document)));
  }

  plan(
    slide: Slide,
    document: SlideDocument,
    options?: {
      allowRuntimeBackgroundFallback?: boolean;
    },
  ): PlannedSlideExport {
    const classifiedDocument = (options?.allowRuntimeBackgroundFallback ?? false)
      ? this.classifyDocumentForRuntimeFallback(document)
      : document;
    const blockedElements = classifiedDocument.elements.filter((element) => element.exportDisposition === 'blocked');
    const nativeSourceElements = classifiedDocument.elements
      .filter((element) => (element.exportDisposition ?? 'native') === 'native' && element.kind !== 'group');
    const nativeElements = nativeSourceElements.flatMap((element) => this.planElement(element, classifiedDocument));
    const usedBackgroundFallback = Boolean(classifiedDocument.backgroundImage)
      || classifiedDocument.elements.some((element) => element.exportDisposition === 'background');

    return {
      document: classifiedDocument,
      nativeSourceElements,
      nativeElements,
      blockedElements,
      usedBackgroundFallback,
      backgroundHtml: usedBackgroundFallback
        ? this.buildBackgroundHtml(slide, classifiedDocument, nativeSourceElements)
        : undefined,
      nativeObjectCount: nativeElements.length,
    };
  }

  hasBoxLikeTextStyle(element: SlideTextElement): boolean {
    return !isTransparent(element.style.backgroundColor)
      || (element.style.borderWidth ?? 0) > 0
      || (element.style.borderRadius ?? 0) > 0;
  }

  isVisuallySingleLine(element: SlideTextElement): boolean {
    if (element.text.includes('\n')) {
      return false;
    }

    const lineHeight = element.style.lineHeight ?? element.style.fontSize;
    if (!lineHeight || lineHeight <= 0) {
      return true;
    }

    return element.height <= lineHeight * 1.35;
  }

  expandTextFrame(element: SlideTextElement): SlideTextElement {
    const fontSize = element.style.fontSize ?? 18;
    const isSingleLine = this.isVisuallySingleLine(element);
    const longestLine = element.text.split('\n').reduce((longest, line) => (
      line.length > longest.length ? line : longest
    ), '');
    const trimmedLength = longestLine.trim().length;
    const isLargeSingleLine = isSingleLine && fontSize >= 24;
    const shouldEstimateIntrinsicWidth = isSingleLine && trimmedLength <= 24;
    const isMono = /mono|jetbrains/i.test(element.style.fontFamily ?? '');
    const horizontalPadding = Math.max(
      fontSize * (isLargeSingleLine ? 1.1 : 0.85),
      isLargeSingleLine ? 24 : 12,
    );
    const verticalPadding = Math.max(fontSize * 0.35, 6);
    const widthFactor = shouldEstimateIntrinsicWidth
      ? (
          isLargeSingleLine
            ? (trimmedLength <= 16 ? 1.4 : 1.1)
            : isMono
              ? 1.05
              : fontSize >= 24
                ? 0.95
                : 0.8
        )
      : 0;
    const minimumSingleLineWidth = shouldEstimateIntrinsicWidth && isLargeSingleLine
      ? fontSize * Math.max(8, trimmedLength + 4)
      : 0;
    const centeredLargeSingleLineWidth = isSingleLine
      && element.style.textAlign === 'center'
      && fontSize >= 40
      ? element.width * 1.28
      : 0;
    const estimatedWidth = Math.max(
      element.width + (horizontalPadding * (isLargeSingleLine ? 2 : 1)),
      shouldEstimateIntrinsicWidth
        ? fontSize * Math.max(4, longestLine.length * widthFactor)
        : 0,
      minimumSingleLineWidth,
      centeredLargeSingleLineWidth,
    );

    const multiLineBottomPadding = !isSingleLine
      ? Math.max((element.style.lineHeight ?? (fontSize * 1.4)) * 0.3, fontSize * 0.55, 8)
      : 0;

    let x = element.x;
    if (element.style.textAlign === 'center') {
      x -= (estimatedWidth - element.width) / 2;
    } else if (element.style.textAlign === 'right') {
      x -= estimatedWidth - element.width;
    }

    return {
      ...element,
      x: Math.max(0, x),
      y: Math.max(0, element.y - verticalPadding / 3),
      width: estimatedWidth,
      height: element.height + verticalPadding + multiLineBottomPadding,
    };
  }

  tightenBoxLikeTextFrame(element: SlideTextElement): SlideTextElement {
    if (element.style.stretchX || element.width >= 280) {
      return element;
    }

    const fontSize = element.style.fontSize ?? 18;
    const isSingleLine = this.isVisuallySingleLine(element);
    const longestLine = element.text.split('\n').reduce((longest, line) => (
      line.length > longest.length ? line : longest
    ), '');
    const trimmedLength = longestLine.trim().length;
    if (!isSingleLine || trimmedLength === 0 || trimmedLength > 24) {
      return element;
    }

    const paddingLeft = element.style.paddingLeft ?? 0;
    const paddingRight = element.style.paddingRight ?? 0;
    const chromeWidth = paddingLeft + paddingRight + Math.max(fontSize, 16);
    const estimatedContentWidth = fontSize * Math.max(3, trimmedLength * (fontSize >= 18 ? 0.95 : 0.75));
    const tightenedWidth = Math.max(chromeWidth + estimatedContentWidth, chromeWidth + 24);

    if (tightenedWidth >= element.width * 0.85 || element.width <= tightenedWidth) {
      return element;
    }

    let x = element.x;
    if (element.style.textAlign === 'center') {
      x += (element.width - tightenedWidth) / 2;
    } else if (element.style.textAlign === 'right') {
      x += element.width - tightenedWidth;
    }

    return {
      ...element,
      x,
      width: tightenedWidth,
    };
  }

  toPlainTextElement(element: SlideTextElement): SlideTextElement {
    const paddingTop = element.style.paddingTop ?? 0;
    const paddingRight = element.style.paddingRight ?? 0;
    const paddingBottom = element.style.paddingBottom ?? 0;
    const paddingLeft = element.style.paddingLeft ?? 0;
    const isSingleLine = !element.text.includes('\n');

    return {
      ...element,
      id: `${element.id}_content`,
      x: element.x + paddingLeft,
      y: isSingleLine ? element.y : element.y + paddingTop,
      width: Math.max(1, element.width - paddingLeft - paddingRight),
      height: Math.max(1, isSingleLine ? element.height : element.height - paddingTop - paddingBottom),
      style: {
        ...element.style,
        backgroundColor: undefined,
        borderColor: undefined,
        borderWidth: 0,
        borderStyle: undefined,
        borderRadius: undefined,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        fill: undefined,
        line: undefined,
      },
    };
  }

  resolveTextAlignment(element: SlideTextElement): 'left' | 'center' | 'right' | 'justify' | undefined {
    if (element.style.textAlign) {
      return element.style.textAlign;
    }

    if (element.style.display === 'flex') {
      if (element.style.justifyContent === 'center') {
        return 'center';
      }
      if (element.style.justifyContent === 'flex-end' || element.style.justifyContent === 'end') {
        return 'right';
      }
    }

    return undefined;
  }

  resolveContentAlignment(element: SlideTextElement): 'top' | 'middle' | 'bottom' | undefined {
    if (element.style.verticalAlign) {
      return element.style.verticalAlign;
    }

    if (element.style.display === 'flex') {
      if (element.style.alignItems === 'center') {
        return 'middle';
      }
      if (element.style.alignItems === 'flex-end' || element.style.alignItems === 'end') {
        return 'bottom';
      }
      if (element.style.alignItems === 'flex-start' || element.style.alignItems === 'start') {
        return 'top';
      }
    }

    return undefined;
  }

  toLineSpacingPercent(element: SlideTextElement): number | undefined {
    const fontSize = element.style.fontSize;
    const lineHeight = element.style.lineHeight;
    if (fontSize === undefined || lineHeight === undefined || fontSize <= 0) {
      return undefined;
    }
    return Math.round((lineHeight / fontSize) * 100);
  }

  private planElement(element: SlideElement, document: SlideDocument): PlannedNativeElement[] {
    if (element.kind !== 'text') {
      return [element as PlannedNativeElement];
    }

    const normalizedElement = this.hasBoxLikeTextStyle(element)
      ? this.tightenBoxLikeTextFrame(element)
      : element;
    const splitBackground = this.hasBoxLikeTextStyle(normalizedElement);
    const baseTextElement = splitBackground ? this.toPlainTextElement(normalizedElement) : normalizedElement;
    const textElement = splitBackground && !baseTextElement.text.includes('\n')
      ? baseTextElement
      : this.expandTextFrame(baseTextElement);
    const plannedText: PlannedTextElement = {
      ...textElement,
      textAlignment: this.resolveTextAlignment(textElement),
      contentAlignment: splitBackground && !textElement.text.includes('\n')
        ? 'middle'
        : this.resolveContentAlignment(textElement),
      lineSpacingPercent: this.toLineSpacingPercent(textElement),
      textBackdrop: splitBackground
        ? normalizedElement.style.backgroundColor ?? document.backgroundColor
        : document.backgroundColor,
    };

    if (!splitBackground) {
      return [plannedText];
    }

    const backgroundShape: SlideShapeElement = {
      ...normalizedElement,
      id: `${normalizedElement.id}_background`,
      kind: 'shape',
      shapeType: (normalizedElement.style.borderRadius ?? 0) > 0 ? 'roundRectangle' : 'rectangle',
    };
    return [backgroundShape, plannedText];
  }

  private classifyDocumentForRuntimeFallback(document: SlideDocument): SlideDocument {
    return {
      ...document,
      elements: document.elements.map((element) => this.classifyElementForExport(element, document)),
    };
  }

  private classifyElementForExport(element: SlideElement, document: SlideDocument): SlideElement {
    if (element.exportDisposition && element.exportDisposition !== 'native') {
      return element;
    }

    const runtimeFallbackReason = this.runtimeFallbackReason(element, document);
    if (!runtimeFallbackReason) {
      return element;
    }

    return {
      ...element,
      exportDisposition: 'background',
      fallbackReason: runtimeFallbackReason,
    };
  }

  private runtimeFallbackReason(element: SlideElement, document: SlideDocument): string | undefined {
    const isDeliverablesCardLayout = this.isDeliverablesCardLayout(document);
    const hasBackgroundImage = Boolean(element.style.backgroundImage && element.style.backgroundImage !== 'none');

    if (element.kind === 'text') {
      if (hasBackgroundImage) {
        return 'background-image-text-chrome';
      }
      if (isDeliverablesCardLayout && element.selector === 'span.card-ordinal') {
        return 'deliverables-card-ordinal';
      }
      if (element.selector === 'span.card-ordinal') {
        return 'decorative-card-text';
      }
      return undefined;
    }

    if (element.kind === 'shape') {
      if (hasBackgroundImage) {
        return 'background-image-shape';
      }
      if (
        isDeliverablesCardLayout
        && (
          element.selector === 'div.card'
          || element.selector === 'div.card-footer'
          || element.selector === 'span.badge'
          || element.selector === 'span.badge-dot'
        )
      ) {
        return 'deliverables-card-chrome';
      }

      if (
        element.selector === 'div.card'
        || element.selector === 'div.card-footer'
        || element.selector === 'span.badge'
        || element.selector === 'span.badge-dot'
      ) {
        return 'decorative-card-chrome';
      }
      const borderStyle = element.style.borderStyle?.trim() ?? '';
      if (borderStyle.includes(' ') && borderStyle !== 'solid none none') {
        return 'complex-border-style';
      }
      if (colorTokenCount(element.style.borderColor) > 1) {
        return 'multi-color-border';
      }
    }

    return undefined;
  }

  private isDeliverablesCardLayout(document: SlideDocument): boolean {
    return document.elements.some((element) => element.selector === 'div.card')
      && document.elements.some((element) => element.selector === 'span.month-label')
      && document.elements.some((element) => element.selector === 'h3.card-title');
  }

  private buildBackgroundHtml(
    slide: Slide,
    document: SlideDocument,
    nativeElements: SlideElement[],
  ): string {
    if (this.canUseOriginalHtmlBackground(slide, nativeElements)) {
      return this.buildOriginalHtmlBackground(slide.html, nativeElements);
    }

    const elements = document.elements
      .filter((element) => (element.exportDisposition ?? 'native') === 'background')
      .sort((a, b) => a.zIndex - b.zIndex)
      .map((element) => {
        if (element.kind === 'group') {
          return '';
        }

        const styles = [
          'position:absolute',
          `left:${element.x}px`,
          `top:${element.y}px`,
          `width:${element.width}px`,
          `height:${element.height}px`,
          `transform:rotate(${element.rotation}deg)`,
          `opacity:${element.opacity}`,
          `z-index:${element.zIndex}`,
          element.style.backgroundColor ? `background:${element.style.backgroundColor}` : null,
          element.style.backgroundImage ? `background-image:${element.style.backgroundImage}` : null,
          element.style.backgroundSize ? `background-size:${element.style.backgroundSize}` : null,
          element.style.backgroundPosition ? `background-position:${element.style.backgroundPosition}` : null,
          element.style.backgroundRepeat ? `background-repeat:${element.style.backgroundRepeat}` : null,
          element.style.borderColor && element.style.borderWidth
            ? `border:${element.style.borderWidth}px ${element.style.borderStyle ?? 'solid'} ${element.style.borderColor}`
            : null,
          element.style.borderRadius !== undefined ? `border-radius:${element.style.borderRadius}px` : null,
          element.style.boxShadow ? `box-shadow:${element.style.boxShadow}` : null,
        ].filter(Boolean).join(';');

        if (element.kind === 'image') {
          return `<img src="${element.src}" style="${styles};object-fit:${element.style.objectFit ?? 'cover'}">`;
        }
        if (element.kind === 'text') {
          const textStyles = [
            styles,
            element.style.color ? `color:${element.style.color}` : null,
            element.style.fontFamily ? `font-family:${element.style.fontFamily}` : null,
            element.style.fontSize !== undefined ? `font-size:${element.style.fontSize}px` : null,
            element.style.fontWeight !== undefined ? `font-weight:${element.style.fontWeight}` : null,
            element.style.fontStyle ? `font-style:${element.style.fontStyle}` : null,
            element.style.lineHeight !== undefined ? `line-height:${element.style.lineHeight}px` : null,
            element.style.letterSpacing !== undefined ? `letter-spacing:${element.style.letterSpacing}px` : null,
            element.style.textAlign ? `text-align:${element.style.textAlign}` : null,
            element.style.whiteSpace ? `white-space:${element.style.whiteSpace}` : 'white-space:pre-wrap',
            element.style.display ? `display:${element.style.display}` : null,
            element.style.justifyContent ? `justify-content:${element.style.justifyContent}` : null,
            element.style.alignItems ? `align-items:${element.style.alignItems}` : null,
            element.style.paddingTop !== undefined ? `padding-top:${element.style.paddingTop}px` : null,
            element.style.paddingRight !== undefined ? `padding-right:${element.style.paddingRight}px` : null,
            element.style.paddingBottom !== undefined ? `padding-bottom:${element.style.paddingBottom}px` : null,
            element.style.paddingLeft !== undefined ? `padding-left:${element.style.paddingLeft}px` : null,
          ].filter(Boolean).join(';');
          return `<div style="${textStyles}">${this.escapeHtml(element.text)}</div>`;
        }
        return `<div style="${styles}"></div>`;
      })
      .join('\n');

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
      background-color: ${document.backgroundColor ?? '#ffffff'};
      ${document.backgroundImage ? `background-image:${document.backgroundImage};` : ''}
      ${document.backgroundSize ? `background-size:${document.backgroundSize};` : ''}
      ${document.backgroundPosition ? `background-position:${document.backgroundPosition};` : ''}
      ${document.backgroundRepeat ? `background-repeat:${document.backgroundRepeat};` : ''}
    }
  </style>
</head>
<body>
  <div class="slide">${elements}</div>
</body>
</html>`;
  }

  private canUseOriginalHtmlBackground(slide: Slide, nativeElements: SlideElement[]): boolean {
    if (!slide.html) {
      return false;
    }

    return nativeElements.every((element) => (
      (typeof element.domPath === 'string' && element.domPath.length > 0)
      || (element.kind === 'text' && typeof element.editId === 'string')
    ));
  }

  private buildOriginalHtmlBackground(html: string, nativeElements: SlideElement[]): string {
    if (nativeElements.length === 0) {
      return html;
    }

    const selectors = Array.from(new Set(nativeElements.flatMap((element) => {
      if (typeof element.domPath === 'string' && element.domPath.length > 0) {
        return [element.domPath];
      }
      if (element.kind === 'text' && typeof element.editId === 'string') {
        return [`[data-edit-id="${this.escapeCssString(element.editId)}"]`];
      }
      return [];
    })));

    const rules = selectors.map((selector) => {
      return [
        `${selector}{visibility:hidden !important;opacity:0 !important;caret-color:transparent !important;}`,
        `${selector}::before{opacity:0 !important;color:transparent !important;visibility:hidden !important;}`,
        `${selector}::after{opacity:0 !important;color:transparent !important;visibility:hidden !important;}`,
      ].join('');
    }).join('');

    const styleTag = `<style data-pengui-background-hide>${rules}</style>`;
    if (html.includes('</head>')) {
      return html.replace('</head>', `${styleTag}</head>`);
    }
    return `${styleTag}${html}`;
  }

  private escapeCssString(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
