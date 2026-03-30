/// <reference lib="dom" />

import type { AssetService } from '../assets/asset-service.js';
import { resolveAssetRefs } from '../assets/asset-resolver.js';
import type { Logger } from '../../infrastructure/logger.js';
import type {
  SlideExportDisposition,
  SlideDocument,
  SlideElement,
  SlideImageElement,
  SlideShapeElement,
  SlideTableCell,
  SlideTableElement,
  SlideTextElement,
  SlideTranslationIssue,
} from '../../types/slide-document.js';

interface ExtractedDocumentPayload {
  width: number;
  height: number;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  elements: SlideElement[];
  issues: SlideTranslationIssue[];
}

export interface SlideDocumentCompilationResult {
  document: SlideDocument | null;
  issues: SlideTranslationIssue[];
}

export class HtmlSlideDocumentCompiler {
  constructor(
    private readonly logger: Logger,
    private readonly headless: boolean,
    private readonly assetService?: AssetService,
  ) {}

  async compile(html: string, sourceRevisionHash: string): Promise<SlideDocumentCompilationResult> {
    const resolvedHtml = this.assetService
      ? await resolveAssetRefs(html, this.assetService)
      : html;

    const payload = await this.extract(resolvedHtml);
    const blockingIssues = payload.issues.filter((issue) => issue.severity === 'error');

    if (blockingIssues.length > 0) {
      this.logger.warn('Slide document compilation blocked', {
        issueCount: blockingIssues.length,
      });
      return {
        document: null,
        issues: payload.issues,
      };
    }

    return {
      document: {
        version: '1',
        sourceRevisionHash,
        width: payload.width,
        height: payload.height,
        backgroundColor: payload.backgroundColor,
        backgroundImage: payload.backgroundImage,
        backgroundSize: payload.backgroundSize,
        backgroundPosition: payload.backgroundPosition,
        backgroundRepeat: payload.backgroundRepeat,
        elements: payload.elements,
      },
      issues: payload.issues,
    };
  }

  private async extract(html: string): Promise<ExtractedDocumentPayload> {
    const pw = await import('playwright');
    const browser = await pw.chromium.launch({ headless: this.headless });

    try {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

      return await page.evaluate(() => {
        const issues: SlideTranslationIssue[] = [];
        const root = document.querySelector<HTMLElement>('.slide');
        if (!root) {
          return {
            width: 1920,
            height: 1080,
            elements: [],
            issues: [{
              code: 'missing-slide-root',
              severity: 'error',
              message: 'Slide HTML is missing the required .slide root element.',
            }],
          };
        }

        const rootRect = root.getBoundingClientRect();
        const rootStyle = window.getComputedStyle(root);
        const rootBackground = rootStyle.backgroundColor;

        const elements: SlideElement[] = [];
        const tableHandled = new Set<Element>();
        const selectorFor = (tagName: string, className: string): string => {
          const classes = String(className || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .join('.');
          return `${tagName.toLowerCase()}${classes ? `.${classes}` : ''}`;
        };
        const domPathFor = (element: HTMLElement): string => {
          const parts: string[] = [];
          let current: HTMLElement | null = element;

          while (current && current !== root) {
            const parent: HTMLElement | null = current.parentElement;
            if (!parent) {
              break;
            }
            const siblings = (Array.from(parent.children) as Element[])
              .filter((candidate) => candidate.tagName === current?.tagName);
            const index = Math.max(1, siblings.indexOf(current) + 1);
            parts.unshift(`${current.tagName.toLowerCase()}:nth-of-type(${index})`);
            current = parent;
          }

          return parts.length > 0 ? `.slide > ${parts.join(' > ')}` : '.slide';
        };

        const normalizeDash = (value?: string): 'solid' | 'dashed' | 'dotted' | undefined => {
          switch (value) {
            case 'dashed':
              return 'dashed';
            case 'dotted':
              return 'dotted';
            default:
              return 'solid';
          }
        };

        const trimFontFamily = (value?: string): string | undefined => {
          if (!value) return undefined;
          return value.split(',').map((item) => item.trim()).filter(Boolean).join(', ');
        };

        const parsePseudoContent = (value: string): string | null => {
          if (!value || value === 'none' || value === 'normal' || value === '""' || value === "''") {
            return null;
          }

          const matches = [...value.matchAll(/"([^"]*)"|'([^']*)'/g)];
          if (matches.length === 0) {
            return null;
          }

          return matches
            .map((match) => match[1] ?? match[2] ?? '')
            .join('');
        };

        const isBulletLike = (value: string): boolean => /^[•◦▪▸▹▶▷‣·\-–—]+$/.test(value.trim());

        const nextRotation = (transform: string): number => {
          if (!transform || transform === 'none') {
            return 0;
          }
          if (transform.startsWith('matrix3d')) {
            return Number.NaN;
          }
          const match = transform.match(/matrix\(([^)]+)\)/);
          if (!match) {
            return Number.NaN;
          }
          const values = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
          if (values.length < 6 || values.some((value) => Number.isNaN(value))) {
            return Number.NaN;
          }
          const [a, b] = values;
          return Math.round(Math.atan2(b, a) * (180 / Math.PI) * 1000) / 1000;
        };

        const pushIssue = (issue: SlideTranslationIssue): void => {
          issues.push(issue);
        };
        const markBackground = (
          selector: string,
          code: string,
          message: string,
          detail?: string,
        ): { disposition: SlideExportDisposition; fallbackReason: string } => {
          pushIssue({
            code,
            severity: 'warning',
            selector,
            message,
            ...(detail ? { detail } : {}),
          });
          return {
            disposition: 'background',
            fallbackReason: code,
          };
        };

        const isVisible = (computed: CSSStyleDeclaration, rect: DOMRect): boolean => {
          if (computed.display === 'none' || computed.visibility === 'hidden') {
            return false;
          }
          const opacity = Number.parseFloat(computed.opacity || '1');
          if (opacity <= 0.01) {
            return false;
          }
          return rect.width > 0 && rect.height > 0;
        };

        const toNumber = (value: string): number | undefined => {
          const parsed = Number.parseFloat(value);
          return Number.isFinite(parsed) ? parsed : undefined;
        };

        const hasPseudoVisualStyle = (style: CSSStyleDeclaration): boolean => {
          const backgroundColor = style.backgroundColor;
          const borderWidth = toNumber(style.borderWidth) ?? 0;
          const hasVisibleBackgroundColor = Boolean(
            backgroundColor
            && backgroundColor !== 'transparent'
            && backgroundColor !== 'rgba(0, 0, 0, 0)'
            && backgroundColor !== 'rgba(0,0,0,0)',
          );

          return hasVisibleBackgroundColor
            || Boolean(style.backgroundImage && style.backgroundImage !== 'none')
            || Boolean(style.filter && style.filter !== 'none')
            || Boolean(style.boxShadow && style.boxShadow !== 'none')
            || borderWidth > 0
            || Boolean(style.mixBlendMode && style.mixBlendMode !== 'normal');
        };

        const inferStretch = (element: HTMLElement, computed: CSSStyleDeclaration): { stretchX: boolean; stretchY: boolean } => {
          const parent = element.parentElement;
          if (!parent) {
            return { stretchX: false, stretchY: false };
          }

          const parentComputed = window.getComputedStyle(parent);
          const display = parentComputed.display;
          if (!display.includes('flex')) {
            return { stretchX: false, stretchY: false };
          }

          const direction = parentComputed.flexDirection || 'row';
          const isColumn = direction.startsWith('column');
          const alignSelf = computed.alignSelf && computed.alignSelf !== 'auto'
            ? computed.alignSelf
            : parentComputed.alignItems;
          const crossStretch = alignSelf === 'stretch' || alignSelf === 'normal';
          const parentRect = parent.getBoundingClientRect();
          const elementRect = element.getBoundingClientRect();
          const parentInnerWidth = parentRect.width
            - (toNumber(parentComputed.paddingLeft) ?? 0)
            - (toNumber(parentComputed.paddingRight) ?? 0);
          const parentInnerHeight = parentRect.height
            - (toNumber(parentComputed.paddingTop) ?? 0)
            - (toNumber(parentComputed.paddingBottom) ?? 0);
          const widthNearParent = parentInnerWidth > 0 && elementRect.width >= (parentInnerWidth - 4);
          const heightNearParent = parentInnerHeight > 0 && elementRect.height >= (parentInnerHeight - 4);

          return {
            stretchX: isColumn ? crossStretch && widthNearParent : false,
            stretchY: !isColumn ? crossStretch && heightNearParent : false,
          };
        };

        const createBase = (
          element: HTMLElement,
          kind: SlideElement['kind'],
          computed: CSSStyleDeclaration,
          rect: DOMRect,
          index: number,
          options?: { allowTextualPseudo?: boolean },
        ) => {
          const selector = selectorFor(element.tagName, element.className);
          const domPath = domPathFor(element);
          const rotation = nextRotation(computed.transform);
          let exportDisposition: SlideExportDisposition = 'native';
          let fallbackReason: string | undefined;
          const setBackground = (code: string, message: string, detail?: string): void => {
            if (exportDisposition === 'background') {
              return;
            }
            const fallback = markBackground(selector, code, message, detail);
            exportDisposition = fallback.disposition;
            fallbackReason = fallback.fallbackReason;
          };

          if (Number.isNaN(rotation)) {
            setBackground(
              'unsupported-transform',
              'Complex transforms will be flattened into the slide background for export.',
              computed.transform,
            );
          }

          const backdropFilter = (computed as CSSStyleDeclaration & { backdropFilter?: string }).backdropFilter;
          if (computed.filter !== 'none' || (backdropFilter && backdropFilter !== 'none') || computed.mixBlendMode !== 'normal') {
            setBackground(
              'unsupported-effects',
              'CSS filters, backdrop filters, and blend modes will be flattened into the slide background.',
            );
          }

          const beforeStyle = window.getComputedStyle(element, '::before');
          const afterStyle = window.getComputedStyle(element, '::after');
          const beforeContent = beforeStyle.content;
          const afterContent = afterStyle.content;
          const beforeText = parsePseudoContent(beforeContent);
          const afterText = parsePseudoContent(afterContent);
          if (beforeText && !options?.allowTextualPseudo) {
            setBackground(
              'unsupported-pseudo-before',
              'Pseudo-element content (::before) will be flattened into the slide background.',
              beforeContent,
            );
          }
          if (afterText && !options?.allowTextualPseudo) {
            setBackground(
              'unsupported-pseudo-after',
              'Pseudo-element content (::after) will be flattened into the slide background.',
              afterContent,
            );
          }
          if (beforeContent && beforeContent !== 'none' && beforeContent !== 'normal' && !beforeText) {
            setBackground(
              'unsupported-pseudo-before',
              'Decorative pseudo-element content (::before) will be flattened into the slide background.',
              beforeContent,
            );
          }
          if (afterContent && afterContent !== 'none' && afterContent !== 'normal' && !afterText) {
            setBackground(
              'unsupported-pseudo-after',
              'Decorative pseudo-element content (::after) will be flattened into the slide background.',
              afterContent,
            );
          }
          if (hasPseudoVisualStyle(beforeStyle)) {
            setBackground(
              'unsupported-pseudo-before-visual',
              'Decorative pseudo-element visuals (::before) will be flattened into the slide background.',
            );
          }
          if (hasPseudoVisualStyle(afterStyle)) {
            setBackground(
              'unsupported-pseudo-after-visual',
              'Decorative pseudo-element visuals (::after) will be flattened into the slide background.',
            );
          }

          if (computed.backgroundImage && computed.backgroundImage !== 'none') {
            setBackground(
              'unsupported-background-image',
              'CSS background images and gradients will be flattened into the slide background.',
              computed.backgroundImage,
            );
          }

          if (computed.boxShadow && computed.boxShadow !== 'none') {
            setBackground(
              'unsupported-shadow',
              'Box shadows will be flattened into the slide background.',
              computed.boxShadow,
            );
          }

          return {
            id: element.getAttribute('data-edit-id') || element.getAttribute('data-document-id') || `el-${index}`,
            kind,
            x: Math.round((rect.left - rootRect.left) * 1000) / 1000,
            y: Math.round((rect.top - rootRect.top) * 1000) / 1000,
            width: Math.round(rect.width * 1000) / 1000,
            height: Math.round(rect.height * 1000) / 1000,
            rotation: Number.isNaN(rotation) ? 0 : rotation,
            zIndex: index,
            opacity: Number.parseFloat(computed.opacity || '1') || 1,
            locked: false,
            selector,
            domPath,
            exportDisposition,
            ...(fallbackReason ? { fallbackReason } : {}),
            style: {
              ...inferStretch(element, computed),
              backgroundColor: computed.backgroundImage && computed.backgroundImage !== 'none'
                ? undefined
                : computed.backgroundColor,
              backgroundImage: computed.backgroundImage && computed.backgroundImage !== 'none'
                ? computed.backgroundImage
                : undefined,
              backgroundSize: computed.backgroundSize,
              backgroundPosition: computed.backgroundPosition,
              backgroundRepeat: computed.backgroundRepeat,
              color: computed.color,
              borderColor: computed.borderColor,
              borderWidth: toNumber(computed.borderWidth),
              borderStyle: computed.borderStyle,
              borderRadius: toNumber(computed.borderTopLeftRadius),
              fontFamily: trimFontFamily(computed.fontFamily),
              fontSize: toNumber(computed.fontSize),
              fontWeight: toNumber(computed.fontWeight),
              fontStyle: computed.fontStyle,
              lineHeight: toNumber(computed.lineHeight),
              letterSpacing: toNumber(computed.letterSpacing),
              textAlign: computed.textAlign as 'left' | 'center' | 'right' | 'justify',
              display: computed.display,
              justifyContent: computed.justifyContent,
              alignItems: computed.alignItems,
              alignSelf: computed.alignSelf,
              whiteSpace: computed.whiteSpace,
              paddingTop: toNumber(computed.paddingTop),
              paddingRight: toNumber(computed.paddingRight),
              paddingBottom: toNumber(computed.paddingBottom),
              paddingLeft: toNumber(computed.paddingLeft),
              objectFit: computed.objectFit,
              opacity: Number.parseFloat(computed.opacity || '1') || 1,
              boxShadow: computed.boxShadow && computed.boxShadow !== 'none'
                ? computed.boxShadow
                : undefined,
              filter: computed.filter && computed.filter !== 'none'
                ? computed.filter
                : undefined,
              backdropFilter: backdropFilter && backdropFilter !== 'none'
                ? backdropFilter
                : undefined,
              mixBlendMode: computed.mixBlendMode && computed.mixBlendMode !== 'normal'
                ? computed.mixBlendMode
                : undefined,
              fill: computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)'
                ? { color: computed.backgroundColor }
                : undefined,
              line: toNumber(computed.borderWidth)
                ? {
                    color: computed.borderColor,
                    width: toNumber(computed.borderWidth),
                    dash: normalizeDash(computed.borderStyle),
                  }
                : undefined,
              shadow: computed.boxShadow && computed.boxShadow !== 'none'
                ? { color: computed.boxShadow }
                : undefined,
            },
          };
        };

        const rootBeforeStyle = window.getComputedStyle(root, '::before');
        const rootAfterStyle = window.getComputedStyle(root, '::after');
        if (hasPseudoVisualStyle(rootBeforeStyle)) {
          pushIssue({
            code: 'unsupported-root-pseudo-before-visual',
            severity: 'warning',
            selector: '.slide',
            message: 'Decorative root pseudo-element visuals (::before) will be flattened into the slide background.',
          });
          elements.push({
            id: 'root-pseudo-before',
            kind: 'shape',
            x: 0,
            y: 0,
            width: Math.round(rootRect.width * 1000) / 1000,
            height: Math.round(rootRect.height * 1000) / 1000,
            rotation: 0,
            zIndex: -2,
            opacity: 1,
            locked: false,
            selector: '.slide',
            domPath: '.slide',
            exportDisposition: 'background',
            fallbackReason: 'unsupported-root-pseudo-before-visual',
            shapeType: 'rectangle',
            style: {},
          });
        }
        if (hasPseudoVisualStyle(rootAfterStyle)) {
          pushIssue({
            code: 'unsupported-root-pseudo-after-visual',
            severity: 'warning',
            selector: '.slide',
            message: 'Decorative root pseudo-element visuals (::after) will be flattened into the slide background.',
          });
          elements.push({
            id: 'root-pseudo-after',
            kind: 'shape',
            x: 0,
            y: 0,
            width: Math.round(rootRect.width * 1000) / 1000,
            height: Math.round(rootRect.height * 1000) / 1000,
            rotation: 0,
            zIndex: -1,
            opacity: 1,
            locked: false,
            selector: '.slide',
            domPath: '.slide',
            exportDisposition: 'background',
            fallbackReason: 'unsupported-root-pseudo-after-visual',
            shapeType: 'rectangle',
            style: {},
          });
        }

        const all = Array.from(root.querySelectorAll<HTMLElement>('*'));
        all.forEach((element, index) => {
          const tagName = element.tagName.toUpperCase();
          const selector = selectorFor(tagName, element.className);
          if (tagName === 'VIDEO' || tagName === 'CANVAS' || tagName === 'IFRAME') {
            pushIssue({
              code: 'unsupported-element',
              severity: 'error',
              selector,
              message: `Element ${tagName.toLowerCase()} is not supported for editable export.`,
            });
            return;
          }

          if (tableHandled.has(element)) {
            return;
          }

          const computed = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (!isVisible(computed, rect)) {
            return;
          }

          if (tagName === 'TABLE') {
            const rows = Array.from(element.querySelectorAll('tr'));
            const cells: SlideTableCell[] = [];

            rows.forEach((row, rowIndex) => {
              Array.from(row.children).forEach((cellEl, columnIndex) => {
                if (!(cellEl instanceof HTMLElement)) return;
                tableHandled.add(cellEl);
                const cellStyle = window.getComputedStyle(cellEl);
                cells.push({
                  row: rowIndex,
                  column: columnIndex,
                  text: cellEl.innerText.trim(),
                  style: {
                    backgroundColor: cellStyle.backgroundColor,
                    color: cellStyle.color,
                    borderColor: cellStyle.borderColor,
                    borderWidth: toNumber(cellStyle.borderWidth),
                    borderStyle: cellStyle.borderStyle,
                    fontFamily: trimFontFamily(cellStyle.fontFamily),
                    fontSize: toNumber(cellStyle.fontSize),
                    fontWeight: toNumber(cellStyle.fontWeight),
                    textAlign: cellStyle.textAlign as 'left' | 'center' | 'right' | 'justify',
                  },
                });
              });
            });

            const base = createBase(element, 'table', computed, rect, index) as Omit<SlideTableElement, 'rows' | 'columns' | 'cells'>;
            elements.push({
              ...base,
              kind: 'table',
              rows: rows.length,
              columns: rows[0] ? rows[0].children.length : 0,
              cells,
            });
            return;
          }

          const directText = Array.from(element.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent ?? '')
            .join('')
            .trim();
          const hasElementChildren = Array.from(element.children).some((child) => child instanceof HTMLElement);
          const isTextLeaf = directText.length > 0 && !hasElementChildren;

          if (isTextLeaf) {
            const beforeText = parsePseudoContent(window.getComputedStyle(element, '::before').content) ?? '';
            const afterText = parsePseudoContent(window.getComputedStyle(element, '::after').content) ?? '';
            const isListItem = tagName === 'LI';
            const bulletText = isListItem && isBulletLike(beforeText) ? beforeText.trim() : '';
            const combinedText = `${bulletText ? '' : beforeText}${element.innerText.replace(/\r\n/g, '\n')}${afterText}`;
            const base = createBase(element, 'text', computed, rect, index, {
              allowTextualPseudo: true,
            }) as Omit<SlideTextElement, 'text' | 'paragraphs' | 'editId'>;
            elements.push({
              ...base,
              kind: 'text',
              text: combinedText,
              paragraphs: combinedText.split('\n').map((line) => ({
                text: line,
                runs: [{
                  text: line,
                  color: computed.color,
                  fontFamily: trimFontFamily(computed.fontFamily),
                  fontSize: toNumber(computed.fontSize),
                  bold: (toNumber(computed.fontWeight) ?? 400) >= 600,
                  italic: computed.fontStyle === 'italic',
                }],
                ...(isListItem
                  ? {
                      bullet: {
                        type: 'bullet' as const,
                        ...(bulletText ? { characterCode: bulletText.codePointAt(0)?.toString(16).toUpperCase() } : {}),
                        level: 0,
                      },
                    }
                  : {}),
              })),
              editId: element.getAttribute('data-edit-id') || undefined,
            });
            return;
          }

          if (tagName === 'IMG') {
            const image = element as HTMLImageElement;
            const base = createBase(element, 'image', computed, rect, index) as Omit<SlideImageElement, 'src' | 'alt'>;
            const src = image.currentSrc || image.src;
            elements.push({
              ...base,
              kind: 'image',
              src,
              alt: image.alt || undefined,
              ...(!/^https?:\/\//i.test(src)
                ? {
                    exportDisposition: 'background' as const,
                    fallbackReason: 'non-fetchable-image',
                  }
                : {}),
            });
            if (!/^https?:\/\//i.test(src)) {
              pushIssue({
                code: 'non-fetchable-image',
                severity: 'warning',
                selector,
                message: 'Images without fetchable HTTP(S) URLs will be flattened into the slide background.',
                detail: src.slice(0, 128),
              });
            }
            return;
          }

          const hasVisualShape = (
            (computed.backgroundColor && computed.backgroundColor !== 'rgba(0, 0, 0, 0)')
            || (computed.borderWidth && computed.borderWidth !== '0px')
            || (computed.boxShadow && computed.boxShadow !== 'none')
            || hasPseudoVisualStyle(window.getComputedStyle(element, '::before'))
            || hasPseudoVisualStyle(window.getComputedStyle(element, '::after'))
          );

          if (hasVisualShape) {
            const base = createBase(element, 'shape', computed, rect, index) as Omit<SlideShapeElement, 'shapeType'>;
            elements.push({
              ...base,
              kind: 'shape',
              shapeType: (toNumber(computed.borderTopLeftRadius) ?? 0) > 0 ? 'roundRectangle' : 'rectangle',
            });
          }
        });

        return {
          width: Math.round(rootRect.width),
          height: Math.round(rootRect.height),
          backgroundColor: rootBackground,
          backgroundImage: rootStyle.backgroundImage && rootStyle.backgroundImage !== 'none'
            ? rootStyle.backgroundImage
            : undefined,
          backgroundSize: rootStyle.backgroundSize,
          backgroundPosition: rootStyle.backgroundPosition,
          backgroundRepeat: rootStyle.backgroundRepeat,
          elements,
          issues,
        };
      });
    } finally {
      await browser.close();
    }
  }
}
