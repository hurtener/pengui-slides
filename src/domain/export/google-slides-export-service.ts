import { createSign, randomUUID } from 'node:crypto';
import type { PenguiConfig } from '../../config.js';
import type { Logger } from '../../infrastructure/logger.js';
import { GoogleAuthMissingError, ExportError } from '../../types/errors.js';
import type { Slide } from '../../types/deck.js';
import type { GoogleSlidesExportResult } from '../../types/export.js';
import type {
  SlideDocument,
  SlideElement,
  SlideImageElement,
  SlideShapeElement,
  SlideTableElement,
  SlideTextElement,
} from '../../types/slide-document.js';
import { MetadataExporter } from '../metadata/metadata-exporter.js';
import type { RenderService } from '../rendering/render-service.js';
import type { SlideDocumentService } from '../documents/slide-document-service.js';

interface GoogleDimension {
  magnitude?: number;
  unit?: string;
}

interface GooglePageElement {
  objectId?: string;
  size?: {
    width?: GoogleDimension;
    height?: GoogleDimension;
  };
  transform?: {
    scaleX?: number;
    scaleY?: number;
    translateX?: number;
    translateY?: number;
    unit?: string;
  };
}

interface GooglePresentation {
  presentationId: string;
  slides?: Array<{
    objectId: string;
    slideProperties?: {
      notesPage?: {
        notesProperties?: {
          speakerNotesObjectId?: string;
        };
      };
    };
    pageProperties?: {
      pageBackgroundFill?: unknown;
    };
    pageElements?: GooglePageElement[];
  }>;
  pageSize?: {
    width?: GoogleDimension;
    height?: GoogleDimension;
  };
}

interface SlidesBatchRequest {
  requests: Array<Record<string, unknown>>;
}

interface SlidesFetchOptions extends RequestInit {
  bodyJson?: unknown;
}

interface SlideExportPlan {
  slideObjectId: string;
  requests: Array<Record<string, unknown>>;
  nativeObjectCount: number;
  usedBackgroundFallback: boolean;
  expectedPageElementCount: number;
}

const SLIDES_SCOPE = 'https://www.googleapis.com/auth/presentations';
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const TOKEN_AUDIENCE = 'https://oauth2.googleapis.com/token';
const EMU_PER_INCH = 914400;
const PX_PER_INCH = 96;
const EMU_PER_PX = EMU_PER_INCH / PX_PER_INCH;
const PT_PER_INCH = 72;
const DEFAULT_SLIDE_WIDTH_PX = 1920;
const DEFAULT_SLIDE_HEIGHT_PX = 1080;

type ParsedCssColor = {
  red: number;
  green: number;
  blue: number;
  alpha?: number;
};

function base64UrlEncode(input: string | Buffer): string {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function normalizeColorChannel(value: number): number {
  if (value <= 1) {
    return Math.max(0, Math.min(1, value));
  }
  return Math.max(0, Math.min(1, value / 255));
}

function parseCssColor(value?: string): ParsedCssColor | null {
  if (!value) {
    return null;
  }

  const rgba = value.match(/rgba?\(\s*([0-9.]+)[,\s]+([0-9.]+)[,\s]+([0-9.]+)(?:[,\s/]+([0-9.]+))?\s*\)/i);
  if (rgba) {
    return {
      red: normalizeColorChannel(Number.parseFloat(rgba[1])),
      green: normalizeColorChannel(Number.parseFloat(rgba[2])),
      blue: normalizeColorChannel(Number.parseFloat(rgba[3])),
      ...(rgba[4] !== undefined ? { alpha: Number.parseFloat(rgba[4]) } : {}),
    };
  }

  const cssColor4 = value.match(/color\(\s*srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+))?\s*\)/i);
  if (cssColor4) {
    return {
      red: normalizeColorChannel(Number.parseFloat(cssColor4[1])),
      green: normalizeColorChannel(Number.parseFloat(cssColor4[2])),
      blue: normalizeColorChannel(Number.parseFloat(cssColor4[3])),
      ...(cssColor4[4] !== undefined ? { alpha: Number.parseFloat(cssColor4[4]) } : {}),
    };
  }

  const hex = value.trim().match(/^#([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (hex) {
    const raw = hex[1].length === 3
      ? hex[1].split('').map((char) => char + char).join('')
      : hex[1];
    return {
      red: Number.parseInt(raw.slice(0, 2), 16) / 255,
      green: Number.parseInt(raw.slice(2, 4), 16) / 255,
      blue: Number.parseInt(raw.slice(4, 6), 16) / 255,
    };
  }

  return null;
}

function cssColorToOpaque(value?: string): Record<string, unknown> | undefined {
  const color = parseCssColor(value);
  if (!color) {
    return undefined;
  }
  return {
    rgbColor: {
      red: color.red,
      green: color.green,
      blue: color.blue,
    },
  };
}

function blendColorOverBackdrop(color: ParsedCssColor, backdrop?: string): ParsedCssColor {
  if (color.alpha === undefined || color.alpha >= 1 || !backdrop) {
    return color;
  }

  const backdropColor = parseCssColor(backdrop);
  if (!backdropColor) {
    return color;
  }

  const alpha = Math.max(0, Math.min(1, color.alpha));
  return {
    red: (color.red * alpha) + (backdropColor.red * (1 - alpha)),
    green: (color.green * alpha) + (backdropColor.green * (1 - alpha)),
    blue: (color.blue * alpha) + (backdropColor.blue * (1 - alpha)),
  };
}

function cssColorToAlpha(value?: string): number | undefined {
  const color = parseCssColor(value);
  if (!color || color.alpha === undefined) {
    return undefined;
  }
  return Math.max(0, Math.min(1, color.alpha));
}

function cssColorToForeground(value?: string, backdrop?: string): Record<string, unknown> | undefined {
  const color = parseCssColor(value);
  if (!color) {
    return undefined;
  }

  const resolved = blendColorOverBackdrop(color, backdrop);
  return {
    opaqueColor: {
      rgbColor: {
        red: resolved.red,
        green: resolved.green,
        blue: resolved.blue,
      },
    },
  };
}

function colorTokenCount(value?: string): number {
  if (!value) {
    return 0;
  }

  const matches = value.match(/rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8}/gi);
  return matches?.length ?? 0;
}

function firstColorToken(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.match(/rgba?\([^)]*\)|color\([^)]*\)|#[0-9a-f]{3,8}/i)?.[0];
}

function pxToPt(value: number): number {
  return Math.round((value * PT_PER_INCH / PX_PER_INCH) * 1000) / 1000;
}

function pxToEmu(value: number): number {
  return Math.round(value * EMU_PER_PX);
}

function dimensionToEmu(dimension: GoogleDimension | undefined, fallbackPx: number): number {
  if (!dimension?.magnitude) {
    return pxToEmu(fallbackPx);
  }

  if (dimension.unit === 'PT') {
    return Math.round((dimension.magnitude / PT_PER_INCH) * EMU_PER_INCH);
  }

  if (!dimension.unit && dimension.magnitude < 100000) {
    return Math.round((dimension.magnitude / PT_PER_INCH) * EMU_PER_INCH);
  }

  return Math.round(dimension.magnitude);
}

function alignmentToSlides(value?: string): 'START' | 'CENTER' | 'END' | 'JUSTIFIED' | undefined {
  switch (value) {
    case 'center':
      return 'CENTER';
    case 'right':
      return 'END';
    case 'justify':
      return 'JUSTIFIED';
    case 'left':
      return 'START';
    default:
      return undefined;
  }
}

function verticalAlignmentToSlides(value?: string): 'TOP' | 'MIDDLE' | 'BOTTOM' | undefined {
  switch (value) {
    case 'middle':
      return 'MIDDLE';
    case 'bottom':
      return 'BOTTOM';
    case 'top':
      return 'TOP';
    default:
      return undefined;
  }
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]/g, '_');
}

function compactObjectId(slideObjectId: string, kind: string, elementId: string): string {
  const base = `${slideObjectId}_${kind}_${sanitizeId(elementId)}`;
  if (base.length <= 50) {
    return base;
  }
  const slidePrefix = slideObjectId.slice(0, 18);
  const elementSuffix = sanitizeId(elementId).slice(-20);
  return `${slidePrefix}_${kind}_${elementSuffix}`.slice(0, 50);
}

function isTransparent(value?: string): boolean {
  return !value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)';
}

function hasBoxLikeTextStyle(element: SlideTextElement): boolean {
  return !isTransparent(element.style.backgroundColor)
    || (element.style.borderWidth ?? 0) > 0
    || (element.style.borderRadius ?? 0) > 0;
}

function documentScale(document: SlideDocument, pageWidthEmu: number, pageHeightEmu: number): number {
  const widthScale = pageWidthEmu / pxToEmu(document.width);
  const heightScale = pageHeightEmu / pxToEmu(document.height);
  return Math.min(widthScale, heightScale);
}

function isVisuallySingleLine(element: SlideTextElement): boolean {
  if (element.text.includes('\n')) {
    return false;
  }

  const lineHeight = element.style.lineHeight ?? element.style.fontSize;
  if (!lineHeight || lineHeight <= 0) {
    return true;
  }

  return element.height <= lineHeight * 1.35;
}

function isEmojiOnlyText(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && /^[\p{Extended_Pictographic}\uFE0F\u200D]+$/u.test(trimmed);
}

function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function expandTextFrame(element: SlideTextElement): SlideTextElement {
  const fontSize = element.style.fontSize ?? 18;
  const isSingleLine = isVisuallySingleLine(element);
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

function tightenBoxLikeTextFrame(element: SlideTextElement): SlideTextElement {
  if (element.style.stretchX || element.width >= 280) {
    return element;
  }

  const fontSize = element.style.fontSize ?? 18;
  const isSingleLine = isVisuallySingleLine(element);
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

function resolveTextAlignment(element: SlideTextElement): 'START' | 'CENTER' | 'END' | 'JUSTIFIED' | undefined {
  const explicitAlignment = alignmentToSlides(element.style.textAlign);
  if (explicitAlignment) {
    return explicitAlignment;
  }

  if (element.style.display === 'flex') {
    if (element.style.justifyContent === 'center') {
      return 'CENTER';
    }
    if (element.style.justifyContent === 'flex-end' || element.style.justifyContent === 'end') {
      return 'END';
    }
  }

  return undefined;
}

function resolveContentAlignment(element: SlideTextElement): 'TOP' | 'MIDDLE' | 'BOTTOM' | undefined {
  const explicitAlignment = verticalAlignmentToSlides(element.style.verticalAlign);
  if (explicitAlignment) {
    return explicitAlignment;
  }

  if (element.style.display === 'flex') {
    if (element.style.alignItems === 'center') {
      return 'MIDDLE';
    }
    if (element.style.alignItems === 'flex-end' || element.style.alignItems === 'end') {
      return 'BOTTOM';
    }
    if (element.style.alignItems === 'flex-start' || element.style.alignItems === 'start') {
      return 'TOP';
    }
  }

  return undefined;
}

export class GoogleSlidesExportService {
  private readonly metadataExporter = new MetadataExporter();
  private runtimeBackgroundFallbackSupport?: boolean;

  constructor(
    private readonly config: PenguiConfig,
    private readonly logger: Logger,
    private readonly renderService: RenderService,
    private readonly slideDocumentService: SlideDocumentService,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  async export(slides: Slide[], deckTitle: string): Promise<GoogleSlidesExportResult> {
    this.logger.info('Starting Google Slides export', {
      slideCount: slides.length,
      deckTitle,
    });
    const accessToken = await this.getAccessToken();
    const presentation = await this.fetchJson<GooglePresentation>(
      'https://slides.googleapis.com/v1/presentations',
      accessToken,
      {
        method: 'POST',
        bodyJson: { title: deckTitle },
      },
    );

    const presentationId = presentation.presentationId;
    if (!presentationId) {
      throw new ExportError('Google Slides API did not return a presentation ID.');
    }

    const pageWidthEmu = dimensionToEmu(
      presentation.pageSize?.width,
      this.config.slideWidth || DEFAULT_SLIDE_WIDTH_PX,
    );
    const pageHeightEmu = dimensionToEmu(
      presentation.pageSize?.height,
      this.config.slideHeight || DEFAULT_SLIDE_HEIGHT_PX,
    );

    const defaultSlideId = presentation.slides?.[0]?.objectId;
    const requests: Array<Record<string, unknown>> = [];
    const validations: Array<{
      slideObjectId: string;
      slideId: string;
      title: string;
      expectedPageElementCount: number;
    }> = [];
    const slideSummaries: GoogleSlidesExportResult['slides'] = [];

    if (defaultSlideId) {
      requests.push({ deleteObject: { objectId: defaultSlideId } });
    }

    for (const [index, slide] of slides.entries()) {
      const document = slide.document;
      if (!document) {
        throw new ExportError('Slide document missing for Google Slides export.', {
          slideId: slide.id,
          title: slide.metadata.title,
        });
      }

      const slideObjectId = `slide_${index + 1}_${String(slide.id).replace(/[^a-zA-Z0-9_]/g, '_')}`;
      requests.push({
        createSlide: {
          objectId: slideObjectId,
          insertionIndex: index,
          slideLayoutReference: { predefinedLayout: 'BLANK' },
        },
      });

      const plan = await this.buildSlidePlan(
        accessToken,
        presentationId,
        slide,
        slideObjectId,
        document,
        pageWidthEmu,
        pageHeightEmu,
      );

      if (!plan.usedBackgroundFallback && !isTransparent(document.backgroundColor)) {
        requests.push({
          updatePageProperties: {
            objectId: slideObjectId,
            pageProperties: {
              pageBackgroundFill: {
                propertyState: 'RENDERED',
                solidFill: {
                  color: cssColorToOpaque(document.backgroundColor),
                  ...(cssColorToAlpha(document.backgroundColor) !== undefined
                    ? { alpha: { value: cssColorToAlpha(document.backgroundColor) } }
                    : {}),
                },
              },
            },
            fields: 'pageBackgroundFill.propertyState,pageBackgroundFill.solidFill.color,pageBackgroundFill.solidFill.alpha',
          },
        });
      }

      requests.push(...plan.requests);
      validations.push({
        slideObjectId,
        slideId: String(slide.id),
        title: slide.metadata.title,
        expectedPageElementCount: plan.expectedPageElementCount,
      });
      slideSummaries.push({
        slideId: String(slide.id),
        title: slide.metadata.title,
        mode: plan.usedBackgroundFallback ? 'hybrid_background' : 'native_only',
        nativeObjectCount: plan.nativeObjectCount,
        usedBackgroundFallback: plan.usedBackgroundFallback,
      });
    }

    if (requests.length > 0) {
      await this.fetchJson(
        `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
        accessToken,
        {
          method: 'POST',
          bodyJson: { requests } satisfies SlidesBatchRequest,
        },
      );
    }

    await this.writeSpeakerNotes(accessToken, presentationId, slides);
    await this.validatePresentationGeometry(
      accessToken,
      presentationId,
      validations,
      pageWidthEmu,
      pageHeightEmu,
    );

    this.logger.info('Google Slides export complete', {
      presentationId,
      slideCount: slides.length,
    });

    return {
      format: 'google_slides',
      presentationId,
      presentationUrl: `https://docs.google.com/presentation/d/${presentationId}/edit`,
      slideCount: slides.length,
      slides: slideSummaries,
      exportedAt: new Date().toISOString(),
    };
  }

  private async buildSlidePlan(
    accessToken: string,
    presentationId: string,
    slide: Slide,
    slideObjectId: string,
    document: SlideDocument,
    pageWidthEmu: number,
    pageHeightEmu: number,
  ): Promise<SlideExportPlan> {
    const classifiedDocument = await this.classifyDocumentForExport(accessToken, document);
    const requests: Array<Record<string, unknown>> = [];
    const nativeElements = classifiedDocument.elements.filter((element) => (element.exportDisposition ?? 'native') === 'native');
    const blockedElements = classifiedDocument.elements.filter((element) => element.exportDisposition === 'blocked');
    const needsBackgroundFallback = Boolean(classifiedDocument.backgroundImage)
      || classifiedDocument.elements.some((element) => element.exportDisposition === 'background');

    if (blockedElements.length > 0) {
      throw new ExportError('Slide contains elements that cannot be exported safely.', {
        slideId: slide.id,
        title: slide.metadata.title,
        blocked_elements: blockedElements.map((element) => ({
          element_id: element.id,
          selector: element.selector,
          reason: element.fallbackReason,
        })),
      });
    }

    if (needsBackgroundFallback) {
      const backgroundHtml = this.buildBackgroundHtml(slide, classifiedDocument, nativeElements);
      const render = await this.renderService.renderSlideHtml(
        backgroundHtml,
        `${String(slide.id)}-background`,
        {
          width: Math.round(classifiedDocument.width),
          height: Math.round(classifiedDocument.height),
          format: 'png',
        },
      );
      const backgroundUrl = await this.uploadBackgroundImage(
        accessToken,
        presentationId,
        slide,
        render.imageData,
      );
      requests.push({
        createImage: {
          objectId: compactObjectId(slideObjectId, 'bg', String(slide.id)),
          url: backgroundUrl,
          elementProperties: this.toSlideSizedElementProperties(slideObjectId, pageWidthEmu, pageHeightEmu),
        },
      });
    }

    requests.push(...this.buildElementRequests(slideObjectId, nativeElements, classifiedDocument, pageWidthEmu, pageHeightEmu));

    return {
      slideObjectId,
      requests,
      nativeObjectCount: nativeElements.filter((element) => element.kind !== 'group').length,
      usedBackgroundFallback: needsBackgroundFallback,
      expectedPageElementCount: (needsBackgroundFallback ? 1 : 0) + nativeElements.filter((element) => element.kind !== 'group').length,
    };
  }

  private buildBackgroundHtml(
    slide: Slide,
    document: SlideDocument,
    nativeElements: SlideElement[],
  ): string {
    if (this.canUseOriginalHtmlBackground(slide, nativeElements)) {
      const nativeEditIds = nativeElements
        .filter((element): element is SlideTextElement => element.kind === 'text' && typeof element.editId === 'string')
        .map((element) => element.editId as string);
      return this.buildOriginalHtmlBackground(slide.html, nativeEditIds);
    }

    return this.slideDocumentService.render(document, {
      includeDispositions: ['background'],
    });
  }

  private canUseOriginalHtmlBackground(slide: Slide, nativeElements: SlideElement[]): boolean {
    if (!slide.html) {
      return false;
    }

    return nativeElements.every((element) => (
      element.kind === 'text'
      && typeof element.editId === 'string'
      && !hasBoxLikeTextStyle(element)
    ));
  }

  private buildOriginalHtmlBackground(html: string, nativeEditIds: string[]): string {
    if (nativeEditIds.length === 0) {
      return html;
    }

    const rules = nativeEditIds.map((editId) => {
      const selector = `[data-edit-id="${escapeCssString(editId)}"]`;
      return [
        `${selector}{color:transparent !important;text-shadow:none !important;caret-color:transparent !important;}`,
        `${selector}::before{opacity:0 !important;color:transparent !important;}`,
        `${selector}::after{opacity:0 !important;color:transparent !important;}`,
      ].join('');
    }).join('');

    const styleTag = `<style data-pengui-background-hide>${rules}</style>`;
    if (html.includes('</head>')) {
      return html.replace('</head>', `${styleTag}</head>`);
    }
    return `${styleTag}${html}`;
  }

  private async classifyDocumentForExport(accessToken: string, document: SlideDocument): Promise<SlideDocument> {
    const hasRuntimeFallbackCandidates = document.elements.some((element) => this.runtimeFallbackReason(element, document));
    if (!hasRuntimeFallbackCandidates) {
      return document;
    }

    const supportsRuntimeBackgroundFallback = await this.supportsRuntimeBackgroundFallback(accessToken);
    if (!supportsRuntimeBackgroundFallback) {
      return document;
    }

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

    if (element.kind === 'text') {
      if (isDeliverablesCardLayout) {
        if (
          element.selector === 'span.card-ordinal'
        ) {
          return 'deliverables-card-ordinal';
        }
      }

      if (element.selector === 'span.card-ordinal') {
        return 'decorative-card-text';
      }
      return undefined;
    }

    if (element.kind === 'shape') {
      if (isDeliverablesCardLayout) {
        if (
          element.selector === 'div.card'
          || element.selector === 'div.card-footer'
          || element.selector === 'span.badge'
          || element.selector === 'span.badge-dot'
        ) {
          return 'deliverables-card-chrome';
        }
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

  private async supportsRuntimeBackgroundFallback(accessToken: string): Promise<boolean> {
    if (this.runtimeBackgroundFallbackSupport !== undefined) {
      return this.runtimeBackgroundFallbackSupport;
    }

    try {
      const response = await this.fetchImpl(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
        { method: 'GET' },
      );
      if (!response.ok) {
        this.runtimeBackgroundFallbackSupport = false;
        return false;
      }

      const payload = await response.json() as { scope?: string };
      const scopes = payload.scope?.split(/\s+/).filter(Boolean) ?? [];
      this.runtimeBackgroundFallbackSupport = scopes.includes(DRIVE_FILE_SCOPE)
        || scopes.includes('https://www.googleapis.com/auth/drive');
      return this.runtimeBackgroundFallbackSupport;
    } catch (error) {
      this.logger.warn('Unable to detect Drive upload scope for runtime background fallback', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.runtimeBackgroundFallbackSupport = false;
      return false;
    }
  }

  private buildElementRequests(
    slideObjectId: string,
    elements: SlideElement[],
    document: SlideDocument,
    pageWidthEmu: number,
    pageHeightEmu: number,
  ): Array<Record<string, unknown>> {
    const requests: Array<Record<string, unknown>> = [];

    for (const element of [...elements].sort((a, b) => a.zIndex - b.zIndex)) {
      switch (element.kind) {
        case 'text':
          requests.push(...this.buildTextRequests(slideObjectId, element, document, pageWidthEmu, pageHeightEmu));
          break;
        case 'shape':
          requests.push(...this.buildShapeRequests(slideObjectId, element, document, pageWidthEmu, pageHeightEmu));
          break;
        case 'image':
          requests.push(...this.buildImageRequests(slideObjectId, element, document, pageWidthEmu, pageHeightEmu));
          break;
        case 'table':
          requests.push(...this.buildTableRequests(slideObjectId, element, document, pageWidthEmu, pageHeightEmu));
          break;
        case 'group':
          break;
      }
    }

    return requests;
  }

  private buildTextRequests(
    slideObjectId: string,
    element: SlideTextElement,
    document: SlideDocument,
    pageWidthEmu: number,
    pageHeightEmu: number,
  ): Array<Record<string, unknown>> {
    const requests: Array<Record<string, unknown>> = [];
    const normalizedElement = hasBoxLikeTextStyle(element)
      ? tightenBoxLikeTextFrame(element)
      : element;
    const splitBackground = hasBoxLikeTextStyle(normalizedElement);
    const baseTextElement = splitBackground ? this.toPlainTextElement(normalizedElement) : normalizedElement;
    const textElement = splitBackground && !baseTextElement.text.includes('\n')
      ? baseTextElement
      : expandTextFrame(baseTextElement);
    const objectId = compactObjectId(slideObjectId, 'txt', textElement.id);
    const fillColor = cssColorToOpaque(normalizedElement.style.backgroundColor);
    const outlineColor = cssColorToOpaque(normalizedElement.style.borderColor);
    const outlineWeight = normalizedElement.style.borderWidth ?? 0;
    const scale = documentScale(document, pageWidthEmu, pageHeightEmu);
    const contentAlignment = splitBackground && !textElement.text.includes('\n')
      ? 'MIDDLE'
      : resolveContentAlignment(textElement);
    const textBackdrop = splitBackground
      ? normalizedElement.style.backgroundColor ?? document.backgroundColor
      : document.backgroundColor;

    if (splitBackground) {
      const backgroundObjectId = compactObjectId(slideObjectId, 'txtbg', element.id);
      const shapeType = (normalizedElement.style.borderRadius ?? 0) > 0 ? 'ROUND_RECTANGLE' : 'RECTANGLE';
      requests.push({
        createShape: {
          objectId: backgroundObjectId,
          shapeType,
          elementProperties: this.toElementProperties(slideObjectId, normalizedElement, document, pageWidthEmu, pageHeightEmu),
        },
      });
      requests.push({
        updateShapeProperties: {
          objectId: backgroundObjectId,
          shapeProperties: {
            ...(fillColor
              ? {
                  shapeBackgroundFill: {
                    propertyState: 'RENDERED',
                    solidFill: {
                      color: fillColor,
                      ...(cssColorToAlpha(normalizedElement.style.backgroundColor) !== undefined
                        ? { alpha: { value: cssColorToAlpha(normalizedElement.style.backgroundColor) } }
                        : {}),
                    },
                  },
                }
              : {
                  shapeBackgroundFill: {
                    propertyState: 'NOT_RENDERED',
                  },
                }),
            ...(outlineColor && outlineWeight > 0
              ? {
                  outline: {
                    outlineFill: {
                      solidFill: {
                        color: outlineColor,
                      },
                    },
                    weight: {
                      magnitude: pxToPt(outlineWeight * scale),
                      unit: 'PT',
                    },
                  },
                }
              : {}),
          },
          fields: 'shapeBackgroundFill.propertyState,shapeBackgroundFill.solidFill.color,shapeBackgroundFill.solidFill.alpha,outline.outlineFill.solidFill,outline.weight',
        },
      });
    }

    requests.push({
      createShape: {
        objectId,
        shapeType: 'TEXT_BOX',
        elementProperties: this.toElementProperties(slideObjectId, textElement, document, pageWidthEmu, pageHeightEmu),
      },
    });
    requests.push({
      updateShapeProperties: {
        objectId,
        shapeProperties: {
          ...(contentAlignment ? { contentAlignment } : {}),
          ...(splitBackground || !fillColor
            ? {
                shapeBackgroundFill: {
                  propertyState: 'NOT_RENDERED',
                },
              }
            : {
                shapeBackgroundFill: {
                  propertyState: 'RENDERED',
                  solidFill: {
                    color: fillColor,
                    ...(cssColorToAlpha(normalizedElement.style.backgroundColor) !== undefined
                      ? { alpha: { value: cssColorToAlpha(normalizedElement.style.backgroundColor) } }
                      : {}),
                  },
                },
              }),
          ...(splitBackground || !(outlineColor && outlineWeight > 0)
            ? {
                outline: {
                  propertyState: 'NOT_RENDERED',
                },
              }
            : {
                outline: {
                  outlineFill: {
                    solidFill: {
                      color: outlineColor,
                    },
                  },
                  weight: {
                    magnitude: pxToPt(outlineWeight * scale),
                    unit: 'PT',
                  },
                },
              }),
        },
        fields: 'contentAlignment,shapeBackgroundFill.propertyState,shapeBackgroundFill.solidFill.color,shapeBackgroundFill.solidFill.alpha,outline.propertyState,outline.outlineFill.solidFill,outline.weight',
      },
    });

    if (textElement.text.length > 0) {
      requests.push({
        insertText: {
          objectId,
          insertionIndex: 0,
          text: textElement.text,
        },
      });
      requests.push({
        updateTextStyle: {
          objectId,
          style: {
            ...(isEmojiOnlyText(textElement.text)
              ? {}
              : textElement.style.fontFamily
                ? { fontFamily: textElement.style.fontFamily.split(',')[0].replace(/['"]/g, '').trim() }
                : {}),
            ...(textElement.style.fontSize !== undefined
              ? {
                  fontSize: {
                    magnitude: pxToPt(textElement.style.fontSize * scale),
                    unit: 'PT',
                  },
                }
              : {}),
            ...(textElement.style.color ? { foregroundColor: cssColorToForeground(textElement.style.color, textBackdrop) } : {}),
            ...(textElement.style.fontWeight !== undefined ? { bold: textElement.style.fontWeight >= 600 } : {}),
            ...(textElement.style.fontStyle ? { italic: textElement.style.fontStyle === 'italic' } : {}),
          },
          textRange: { type: 'ALL' },
          fields: 'fontFamily,fontSize,foregroundColor,bold,italic',
        },
      });

      const alignment = resolveTextAlignment(textElement);
      const lineSpacing = this.toLineSpacing(textElement);
      if (alignment || lineSpacing !== undefined) {
        requests.push({
          updateParagraphStyle: {
            objectId,
            style: {
              ...(alignment ? { alignment } : {}),
              ...(lineSpacing !== undefined ? { lineSpacing } : {}),
            },
            textRange: { type: 'ALL' },
            fields: ['alignment', 'lineSpacing'].join(','),
          },
        });
      }
    }

    return requests;
  }

  private toPlainTextElement(element: SlideTextElement): SlideTextElement {
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

  private toLineSpacing(element: SlideTextElement): number | undefined {
    const fontSize = element.style.fontSize;
    const lineHeight = element.style.lineHeight;
    if (fontSize === undefined || lineHeight === undefined || fontSize <= 0) {
      return undefined;
    }
    return Math.round((lineHeight / fontSize) * 100);
  }

  private buildShapeRequests(
    slideObjectId: string,
    element: SlideShapeElement,
    document: SlideDocument,
    pageWidthEmu: number,
    pageHeightEmu: number,
  ): Array<Record<string, unknown>> {
    const objectId = compactObjectId(slideObjectId, 'shp', element.id);
    const fillColor = cssColorToOpaque(element.style.backgroundColor);
    const outlineColor = cssColorToOpaque(element.style.borderColor);
    const outlineWeight = element.style.borderWidth ?? 0;
    const shapeType = element.shapeType === 'roundRectangle' ? 'ROUND_RECTANGLE' : 'RECTANGLE';
    const scale = documentScale(document, pageWidthEmu, pageHeightEmu);
    const borderStyle = element.style.borderStyle?.trim() ?? '';
    const topBorderOnly = borderStyle === 'solid none none'
      && isTransparent(element.style.backgroundColor)
      && outlineWeight > 0;

    if (topBorderOnly) {
      const topBorderElement: SlideShapeElement = {
        ...element,
        id: `${element.id}_top_border`,
        height: Math.max(outlineWeight, 1),
        shapeType: 'rectangle',
        style: {
          ...element.style,
          backgroundColor: firstColorToken(element.style.borderColor) ?? element.style.borderColor,
          borderColor: undefined,
          borderWidth: 0,
          borderStyle: undefined,
          borderRadius: 0,
        },
      };

      return this.buildShapeRequests(slideObjectId, topBorderElement, document, pageWidthEmu, pageHeightEmu);
    }

    return [
      {
        createShape: {
          objectId,
          shapeType,
          elementProperties: this.toElementProperties(slideObjectId, element, document, pageWidthEmu, pageHeightEmu),
        },
      },
      {
        updateShapeProperties: {
          objectId,
          shapeProperties: {
            ...(fillColor
              ? {
                  shapeBackgroundFill: {
                    solidFill: {
                      color: fillColor,
                      ...(cssColorToAlpha(element.style.backgroundColor) !== undefined
                        ? { alpha: { value: cssColorToAlpha(element.style.backgroundColor) } }
                        : {}),
                    },
                  },
                }
              : {}),
            ...(outlineColor && outlineWeight > 0
              ? {
                  outline: {
                    outlineFill: {
                      solidFill: {
                        color: outlineColor,
                      },
                    },
                    weight: {
                      magnitude: pxToPt(outlineWeight * scale),
                      unit: 'PT',
                    },
                  },
                }
              : {}),
          },
          fields: 'shapeBackgroundFill.solidFill,outline.outlineFill.solidFill,outline.weight',
        },
      },
    ];
  }

  private buildImageRequests(
    slideObjectId: string,
    element: SlideImageElement,
    document: SlideDocument,
    pageWidthEmu: number,
    pageHeightEmu: number,
  ): Array<Record<string, unknown>> {
    if (!/^https?:\/\//i.test(element.src)) {
      throw new ExportError('Google Slides API only supports editable images with fetchable HTTP(S) URLs.', {
        elementId: element.id,
        src: element.src.slice(0, 128),
      });
    }

    return [{
      createImage: {
        objectId: compactObjectId(slideObjectId, 'img', element.id),
        url: element.src,
        elementProperties: this.toElementProperties(slideObjectId, element, document, pageWidthEmu, pageHeightEmu),
      },
    }];
  }

  private buildTableRequests(
    slideObjectId: string,
    element: SlideTableElement,
    document: SlideDocument,
    pageWidthEmu: number,
    pageHeightEmu: number,
  ): Array<Record<string, unknown>> {
    const objectId = compactObjectId(slideObjectId, 'tbl', element.id);
    const requests: Array<Record<string, unknown>> = [{
      createTable: {
        objectId,
        rows: element.rows,
        columns: element.columns,
        elementProperties: this.toElementProperties(slideObjectId, element, document, pageWidthEmu, pageHeightEmu),
      },
    }];

    for (const cell of element.cells) {
      if (!cell.text) {
        continue;
      }
      requests.push({
        insertText: {
          objectId,
          cellLocation: {
            rowIndex: cell.row,
            columnIndex: cell.column,
          },
          insertionIndex: 0,
          text: cell.text,
        },
      });
    }

    return requests;
  }

  private toSlideSizedElementProperties(
    slideObjectId: string,
    pageWidthEmu: number,
    pageHeightEmu: number,
  ): Record<string, unknown> {
    return {
      pageObjectId: slideObjectId,
      size: {
        width: {
          magnitude: pageWidthEmu,
          unit: 'EMU',
        },
        height: {
          magnitude: pageHeightEmu,
          unit: 'EMU',
        },
      },
      transform: {
        scaleX: 1,
        scaleY: 1,
        translateX: 0,
        translateY: 0,
        unit: 'EMU',
      },
    };
  }

  private toElementProperties(
    slideObjectId: string,
    element: SlideElement,
    document: SlideDocument,
    pageWidthEmu: number,
    pageHeightEmu: number,
  ): Record<string, unknown> {
    return {
      pageObjectId: slideObjectId,
      size: {
        width: {
          magnitude: Math.round((element.width / document.width) * pageWidthEmu),
          unit: 'EMU',
        },
        height: {
          magnitude: Math.round((element.height / document.height) * pageHeightEmu),
          unit: 'EMU',
        },
      },
      transform: {
        scaleX: 1,
        scaleY: 1,
        translateX: Math.round((element.x / document.width) * pageWidthEmu),
        translateY: Math.round((element.y / document.height) * pageHeightEmu),
        unit: 'EMU',
      },
    };
  }

  private async uploadBackgroundImage(
    accessToken: string,
    presentationId: string,
    slide: Slide,
    imageData: Buffer,
  ): Promise<string> {
    const boundary = `pengui-${randomUUID()}`;
    const metadata = JSON.stringify({
      name: `pengui-slides-${presentationId}-${sanitizeId(String(slide.id))}-background.png`,
      mimeType: 'image/png',
    });
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Type: image/png\r\n\r\n`),
      imageData,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const uploadResponse = await this.fetchImpl(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body,
      },
    );

    if (!uploadResponse.ok) {
      const bodyText = await uploadResponse.text();
      throw new ExportError(
        'Background fallback requires a Google token with Drive upload access (for example drive.file).',
        {
          status: uploadResponse.status,
          body: bodyText,
          slideId: slide.id,
          title: slide.metadata.title,
        },
      );
    }

    const uploadPayload = await uploadResponse.json() as { id?: string };
    if (!uploadPayload.id) {
      throw new ExportError('Drive upload did not return a file ID for the slide background.', {
        slideId: slide.id,
        title: slide.metadata.title,
      });
    }

    const permissionResponse = await this.fetchImpl(
      `https://www.googleapis.com/drive/v3/files/${uploadPayload.id}/permissions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone',
        }),
      },
    );

    if (!permissionResponse.ok) {
      throw new ExportError('Uploaded slide background could not be shared for Google Slides import.', {
        status: permissionResponse.status,
        body: await permissionResponse.text(),
        slideId: slide.id,
        title: slide.metadata.title,
      });
    }

    return `https://drive.google.com/uc?export=download&id=${uploadPayload.id}`;
  }

  private async validatePresentationGeometry(
    accessToken: string,
    presentationId: string,
    expectedSlides: Array<{
      slideObjectId: string;
      slideId: string;
      title: string;
      expectedPageElementCount: number;
    }>,
    pageWidthEmu: number,
    pageHeightEmu: number,
  ): Promise<void> {
    const presentation = await this.fetchJson<GooglePresentation>(
      `https://slides.googleapis.com/v1/presentations/${presentationId}`,
      accessToken,
      { method: 'GET' },
    );

    for (const expected of expectedSlides) {
      const slide = presentation.slides?.find((entry) => entry.objectId === expected.slideObjectId);
      if (!slide) {
        throw new ExportError('Exported presentation is missing a slide after creation.', {
          presentationId,
          slideId: expected.slideId,
          title: expected.title,
        });
      }

      const pageElements = slide.pageElements ?? [];
      if (pageElements.length < expected.expectedPageElementCount) {
        throw new ExportError('Google Slides export created fewer page elements than expected.', {
          presentationId,
          slideId: expected.slideId,
          title: expected.title,
          expectedPageElementCount: expected.expectedPageElementCount,
          actualPageElementCount: pageElements.length,
        });
      }

      if (expected.expectedPageElementCount === 0) {
        continue;
      }

      const visibleElementFound = pageElements.some((element) => {
        const translateX = element.transform?.translateX ?? 0;
        const translateY = element.transform?.translateY ?? 0;
        const scaleX = element.transform?.scaleX ?? 1;
        const scaleY = element.transform?.scaleY ?? 1;
        const width = Math.abs(dimensionToEmu(element.size?.width, 0) * scaleX);
        const height = Math.abs(dimensionToEmu(element.size?.height, 0) * scaleY);

        return translateX < pageWidthEmu
          && translateY < pageHeightEmu
          && (translateX + width) > 0
          && (translateY + height) > 0;
      });

      if (!visibleElementFound) {
        throw new ExportError('Google Slides export produced only off-canvas elements for a slide.', {
          presentationId,
          slideId: expected.slideId,
          title: expected.title,
          pageWidthEmu,
          pageHeightEmu,
          elements: pageElements.map((element) => ({
            objectId: element.objectId,
            translateX: element.transform?.translateX,
            translateY: element.transform?.translateY,
            width: element.size?.width?.magnitude,
            height: element.size?.height?.magnitude,
            unit: element.transform?.unit ?? element.size?.width?.unit,
          })),
        });
      }
    }
  }

  private async writeSpeakerNotes(
    accessToken: string,
    presentationId: string,
    slides: Slide[],
  ): Promise<void> {
    const presentation = await this.fetchJson<GooglePresentation>(
      `https://slides.googleapis.com/v1/presentations/${presentationId}`,
      accessToken,
      { method: 'GET' },
    );

    const requests: Array<Record<string, unknown>> = [];
    for (const [index, slide] of slides.entries()) {
      const speakerNotesObjectId = presentation.slides?.[index]?.slideProperties?.notesPage?.notesProperties?.speakerNotesObjectId;
      if (!speakerNotesObjectId) {
        continue;
      }

      const notes = this.metadataExporter.toMarkdown(slide.metadata);
      if (!notes) {
        continue;
      }

      requests.push({
        insertText: {
          objectId: speakerNotesObjectId,
          insertionIndex: 0,
          text: notes,
        },
      });
    }

    if (requests.length === 0) {
      return;
    }

    await this.fetchJson(
      `https://slides.googleapis.com/v1/presentations/${presentationId}:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        bodyJson: { requests } satisfies SlidesBatchRequest,
      },
    );
  }

  private async getAccessToken(): Promise<string> {
    if (this.config.googleAccessToken) {
      return this.config.googleAccessToken;
    }
    if (!this.config.googleClientEmail || !this.config.googlePrivateKey) {
      throw new GoogleAuthMissingError();
    }

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claimSet = {
      iss: this.config.googleClientEmail,
      scope: [SLIDES_SCOPE, DRIVE_FILE_SCOPE].join(' '),
      aud: TOKEN_AUDIENCE,
      exp: now + 3600,
      iat: now,
    };

    const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claimSet))}`;
    const signer = createSign('RSA-SHA256');
    signer.update(unsignedToken);
    signer.end();
    const signature = signer.sign(this.config.googlePrivateKey.replace(/\\n/g, '\n'));
    const assertion = `${unsignedToken}.${base64UrlEncode(signature)}`;

    const response = await this.fetchImpl(TOKEN_AUDIENCE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    if (!response.ok) {
      throw new ExportError(`Failed to mint Google access token (${response.status}).`, {
        status: response.status,
        body: await response.text(),
      });
    }

    const payload = await response.json() as { access_token?: string };
    if (!payload.access_token) {
      throw new ExportError('Google OAuth response did not include an access token.');
    }

    return payload.access_token;
  }

  private async fetchJson<T>(
    url: string,
    accessToken: string,
    options: SlidesFetchOptions,
  ): Promise<T> {
    const response = await this.fetchImpl(url, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: options.bodyJson !== undefined ? JSON.stringify(options.bodyJson) : options.body,
    });

    if (!response.ok) {
      throw new ExportError(`Google Slides API request failed (${response.status}).`, {
        status: response.status,
        url,
        body: await response.text(),
      });
    }

    if (response.status === 204) {
      return {} as T;
    }

    return await response.json() as T;
  }
}
