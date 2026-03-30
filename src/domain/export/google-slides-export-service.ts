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
} from '../../types/slide-document.js';
import { MetadataExporter } from '../metadata/metadata-exporter.js';
import type { RenderService } from '../rendering/render-service.js';
import {
  DocumentExportPlanner,
  type PlannedNativeElement,
  type PlannedTextElement,
} from './document-export-planner.js';

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

function documentScale(document: SlideDocument, pageWidthEmu: number, pageHeightEmu: number): number {
  const widthScale = pageWidthEmu / pxToEmu(document.width);
  const heightScale = pageHeightEmu / pxToEmu(document.height);
  return Math.min(widthScale, heightScale);
}

function isEmojiOnlyText(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && /^[\p{Extended_Pictographic}\uFE0F\u200D]+$/u.test(trimmed);
}

export class GoogleSlidesExportService {
  private readonly metadataExporter = new MetadataExporter();
  private readonly planner = new DocumentExportPlanner();
  private runtimeBackgroundFallbackSupport?: boolean;

  constructor(
    private readonly config: PenguiConfig,
    private readonly logger: Logger,
    private readonly renderService: RenderService,
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
    const requests: Array<Record<string, unknown>> = [];
    const allowRuntimeBackgroundFallback = this.planner.hasRuntimeBackgroundFallbackCandidates(document)
      ? await this.supportsRuntimeBackgroundFallback(accessToken)
      : false;
    const plan = this.planner.plan(slide, document, {
      allowRuntimeBackgroundFallback,
    });

    if (plan.blockedElements.length > 0) {
      throw new ExportError('Slide contains elements that cannot be exported safely.', {
        slideId: slide.id,
        title: slide.metadata.title,
        blocked_elements: plan.blockedElements.map((element) => ({
          element_id: element.id,
          selector: element.selector,
          reason: element.fallbackReason,
        })),
      });
    }

    if (plan.usedBackgroundFallback && plan.backgroundHtml) {
      const render = await this.renderService.renderSlideHtml(
        plan.backgroundHtml,
        `${String(slide.id)}-background`,
        {
          width: Math.round(plan.document.width),
          height: Math.round(plan.document.height),
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

    requests.push(...this.buildElementRequests(slideObjectId, plan.nativeElements, plan.document, pageWidthEmu, pageHeightEmu));

    return {
      slideObjectId,
      requests,
      nativeObjectCount: plan.nativeObjectCount,
      usedBackgroundFallback: plan.usedBackgroundFallback,
      expectedPageElementCount: (plan.usedBackgroundFallback ? 1 : 0) + plan.nativeElements.length,
    };
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
    elements: PlannedNativeElement[],
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
      }
    }

    return requests;
  }

  private buildTextRequests(
    slideObjectId: string,
    element: PlannedTextElement,
    document: SlideDocument,
    pageWidthEmu: number,
    pageHeightEmu: number,
  ): Array<Record<string, unknown>> {
    const requests: Array<Record<string, unknown>> = [];
    const objectId = compactObjectId(slideObjectId, 'txt', element.id);

    requests.push({
      createShape: {
        objectId,
        shapeType: 'TEXT_BOX',
        elementProperties: this.toElementProperties(slideObjectId, element, document, pageWidthEmu, pageHeightEmu),
      },
    });
    requests.push({
      updateShapeProperties: {
        objectId,
        shapeProperties: {
          ...(element.contentAlignment ? { contentAlignment: verticalAlignmentToSlides(element.contentAlignment) } : {}),
          shapeBackgroundFill: {
            propertyState: 'NOT_RENDERED',
          },
          outline: {
            propertyState: 'NOT_RENDERED',
          },
        },
        fields: 'contentAlignment,shapeBackgroundFill.propertyState,shapeBackgroundFill.solidFill.color,shapeBackgroundFill.solidFill.alpha,outline.propertyState,outline.outlineFill.solidFill,outline.weight',
      },
    });

    if (element.text.length > 0) {
      requests.push({
        insertText: {
          objectId,
          insertionIndex: 0,
          text: element.text,
        },
      });
      requests.push({
        updateTextStyle: {
          objectId,
          style: {
            ...(isEmojiOnlyText(element.text)
              ? {}
              : element.style.fontFamily
                ? { fontFamily: element.style.fontFamily.split(',')[0].replace(/['"]/g, '').trim() }
                : {}),
            ...(element.style.fontSize !== undefined
              ? {
                  fontSize: {
                    magnitude: pxToPt(element.style.fontSize * documentScale(document, pageWidthEmu, pageHeightEmu)),
                    unit: 'PT',
                  },
                }
              : {}),
            ...(element.style.color ? { foregroundColor: cssColorToForeground(element.style.color, element.textBackdrop) } : {}),
            ...(element.style.fontWeight !== undefined ? { bold: element.style.fontWeight >= 600 } : {}),
            ...(element.style.fontStyle ? { italic: element.style.fontStyle === 'italic' } : {}),
          },
          textRange: { type: 'ALL' },
          fields: 'fontFamily,fontSize,foregroundColor,bold,italic',
        },
      });

      const alignment = alignmentToSlides(element.textAlignment);
      const lineSpacing = element.lineSpacingPercent;
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
