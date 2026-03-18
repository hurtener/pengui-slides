import { readFile } from 'node:fs/promises';
import { MetadataExporter } from '../metadata/metadata-exporter.js';
import type { SlideRenderer } from './slide-renderer.js';
import type { Logger } from '../../infrastructure/logger.js';
import type { Slide } from '../../types/deck.js';
import type { DesignSoul } from '../../types/design-soul.js';
import type { SlideImageElement, SlideShapeElement, SlideTableElement } from '../../types/slide-document.js';
import type { ExportPptxOptions, PptxExportResult } from '../../types/export.js';
import { DEFAULT_PPTX_OPTIONS } from '../../types/export.js';
import type { SoulService } from '../souls/soul-service.js';
import { DocumentExportPlanner, type PlannedNativeElement, type PlannedTextElement } from '../export/document-export-planner.js';
import {
  cssColorToHex,
  cssColorToTransparency,
  firstColorToken,
  inferImageMimeType,
  isEmojiOnlyText,
  isTransparent,
  pxToPt,
  sanitizeFontFamily,
} from '../export/export-style-utils.js';

type PptxInstance = import('pptxgenjs').default;

async function createPptx(): Promise<PptxInstance> {
  const mod = await import('pptxgenjs');
  const Ctor = mod.default as unknown as new () => PptxInstance;
  return new Ctor();
}

const WIDE_WIDTH = 13.333;
const WIDE_HEIGHT = 7.5;
const SOUL_MASTER_NAME = 'PENGUI_SOUL';

export class EditablePptxExporter {
  private readonly metadataExporter = new MetadataExporter();
  private readonly planner = new DocumentExportPlanner();

  constructor(
    private readonly renderer: SlideRenderer,
    private readonly logger: Logger,
    private readonly soulService?: SoulService,
    private readonly fetchImpl: typeof fetch = globalThis.fetch,
  ) {}

  async export(
    slides: Slide[],
    deckTitle: string,
    soulId?: string,
    options?: Partial<ExportPptxOptions>,
  ): Promise<PptxExportResult> {
    const opts: ExportPptxOptions = { ...DEFAULT_PPTX_OPTIONS, ...options, mode: 'editable_hybrid' };
    const pptx = await createPptx();
    const soul = soulId && this.soulService
      ? (await this.soulService.get(soulId as never)).soul
      : undefined;

    pptx.defineLayout({ name: 'WIDE', width: WIDE_WIDTH, height: WIDE_HEIGHT });
    pptx.layout = 'WIDE';
    pptx.title = deckTitle;
    this.applyTheme(pptx, soul);
    this.defineSoulMaster(pptx, soul, slides);

    const slideSummaries: PptxExportResult['slides'] = [];

    for (const slide of slides) {
      const document = slide.document;
      if (!document) {
        throw new Error(`Slide document missing for editable PPTX export: ${String(slide.id)}`);
      }

      const plan = this.planner.plan(slide, document, {
        allowRuntimeBackgroundFallback: true,
      });

      if (plan.blockedElements.length > 0) {
        throw new Error(`Slide contains blocked editable-export elements: ${String(slide.id)}`);
      }

      const pptxSlide = pptx.addSlide(SOUL_MASTER_NAME);
      const slideBackgroundColor = cssColorToHex(plan.document.backgroundColor);
      if (!plan.usedBackgroundFallback && slideBackgroundColor) {
        pptxSlide.background = { color: slideBackgroundColor };
      }

      if (plan.usedBackgroundFallback && plan.backgroundHtml) {
        const render = await this.renderer.render(
          plan.backgroundHtml,
          `${String(slide.id)}-pptx-background`,
          {
            width: Math.round(plan.document.width),
            height: Math.round(plan.document.height),
            deviceScaleFactor: 1,
            format: opts.imageFormat,
            ...(opts.imageFormat === 'jpeg' ? { quality: opts.jpegQuality } : {}),
          },
        );
        pptxSlide.addImage({
          data: `data:image/${render.format === 'jpeg' ? 'jpeg' : 'png'};base64,${render.imageData.toString('base64')}`,
          x: 0,
          y: 0,
          w: WIDE_WIDTH,
          h: WIDE_HEIGHT,
          objectName: `${String(slide.id)}_background`,
        });
      }

      for (const element of plan.nativeElements) {
        await this.addElement(pptxSlide, element, plan.document, plan.document.backgroundColor);
      }

      const notes = this.metadataExporter.toMarkdown(slide.metadata);
      if (notes) {
        pptxSlide.addNotes(notes);
      }

      slideSummaries.push({
        slideId: String(slide.id),
        title: slide.metadata.title,
        mode: plan.usedBackgroundFallback ? 'hybrid_background' : 'native_only',
        nativeObjectCount: plan.nativeObjectCount,
        usedBackgroundFallback: plan.usedBackgroundFallback,
      });
    }

    const arrayBuffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
    const data = Buffer.from(arrayBuffer);
    const filename = this.sanitizeFilename(deckTitle) + '.pptx';

    this.logger.info('Editable PPTX export complete', {
      filename,
      slideCount: slides.length,
      bytes: data.length,
    });

    return {
      format: 'pptx',
      mode: 'editable_hybrid',
      data,
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      filename,
      slideCount: slides.length,
      fileSizeBytes: data.length,
      exportedAt: new Date().toISOString(),
      slides: slideSummaries,
    };
  }

  private applyTheme(pptx: PptxInstance, soul?: DesignSoul): void {
    if (!soul) {
      return;
    }

    pptx.theme = {
      headFontFace: sanitizeFontFamily(soul.layers.typography.fontDisplay),
      bodyFontFace: sanitizeFontFamily(soul.layers.typography.fontBody),
    };
  }

  private defineSoulMaster(pptx: PptxInstance, soul: DesignSoul | undefined, slides: Slide[]): void {
    const consistentBackground = slides
      .map((slide) => slide.document?.backgroundColor)
      .filter((value): value is string => Boolean(value))
      .reduce<string | undefined>((current, value) => {
        if (current === undefined) {
          return value;
        }
        return current === value ? current : '';
      }, undefined);
    const masterBackground = cssColorToHex(
      consistentBackground && consistentBackground.length > 0
        ? consistentBackground
        : soul?.layers.color.canvas,
    ) ?? 'FFFFFF';

    pptx.defineSlideMaster({
      title: SOUL_MASTER_NAME,
      background: { color: masterBackground },
      margin: 0,
    });
  }

  private async addElement(
    slide: Awaited<ReturnType<PptxInstance['addSlide']>>,
    element: PlannedNativeElement,
    document: Slide['document'] extends infer T ? NonNullable<T> : never,
    backdrop?: string,
  ): Promise<void> {
    switch (element.kind) {
      case 'text':
        slide.addText(this.toTextRuns(element, document, backdrop), this.toTextOptions(element, document, backdrop));
        break;
      case 'shape': {
        const pptxShape = this.toPptxShapeElement(element);
        slide.addShape(
          this.toShapeName(pptxShape.shapeType),
          this.toShapeProps(pptxShape, document, backdrop),
        );
        break;
      }
      case 'image':
        slide.addImage(await this.toImageProps(element, document));
        break;
      case 'table':
        slide.addTable(this.toTableRows(element), this.toTableProps(element, document, backdrop));
        break;
    }
  }

  private toShapeName(shapeType: SlideShapeElement['shapeType']): 'rect' | 'roundRect' | 'ellipse' | 'line' {
    switch (shapeType) {
      case 'roundRectangle':
        return 'roundRect';
      case 'ellipse':
        return 'ellipse';
      case 'line':
        return 'line';
      default:
        return 'rect';
    }
  }

  private slideScale(document: NonNullable<Slide['document']>): {
    xInchesPerPx: number;
    yInchesPerPx: number;
    textScale: number;
  } {
    const xInchesPerPx = WIDE_WIDTH / Math.max(1, document.width);
    const yInchesPerPx = WIDE_HEIGHT / Math.max(1, document.height);
    const textScale = Math.min(xInchesPerPx, yInchesPerPx) * 96;
    return { xInchesPerPx, yInchesPerPx, textScale };
  }

  private scaledPt(value: number, document: NonNullable<Slide['document']>): number {
    return pxToPt(value * this.slideScale(document).textScale);
  }

  private basePosition(
    element: PlannedNativeElement,
    document: NonNullable<Slide['document']>,
  ): { x: number; y: number; w: number; h: number } {
    const scale = this.slideScale(document);
    return {
      x: Math.round(element.x * scale.xInchesPerPx * 1000) / 1000,
      y: Math.round(element.y * scale.yInchesPerPx * 1000) / 1000,
      w: Math.round(element.width * scale.xInchesPerPx * 1000) / 1000,
      h: Math.round(element.height * scale.yInchesPerPx * 1000) / 1000,
    };
  }

  private toPptxShapeElement(element: SlideShapeElement): SlideShapeElement {
    const borderStyle = element.style.borderStyle?.trim() ?? '';
    const outlineWeight = element.style.borderWidth ?? 0;
    const topBorderOnly = borderStyle === 'solid none none'
      && isTransparent(element.style.backgroundColor)
      && outlineWeight > 0;

    if (!topBorderOnly) {
      return element;
    }

    return {
      ...element,
      id: `${element.id}_top_border`,
      height: Math.max(1, outlineWeight),
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
  }

  private toShapeProps(
    element: SlideShapeElement,
    document: NonNullable<Slide['document']>,
    backdrop?: string,
  ): Record<string, unknown> {
    const fillColor = cssColorToHex(element.style.backgroundColor, backdrop);
    const fillTransparency = cssColorToTransparency(element.style.backgroundColor);
    const lineColor = cssColorToHex(element.style.borderColor, backdrop);
    const lineTransparency = cssColorToTransparency(element.style.borderColor);

    return {
      ...this.basePosition(element, document),
      objectName: element.id,
      rotate: element.rotation,
      ...(fillColor
        ? {
            fill: {
              color: fillColor,
              ...(fillTransparency !== undefined ? { transparency: fillTransparency } : {}),
            },
          }
        : {
            fill: { type: 'none' },
          }),
      line: lineColor && (element.style.borderWidth ?? 0) > 0
        ? {
            color: lineColor,
            width: this.scaledPt(element.style.borderWidth ?? 0, document),
            ...(lineTransparency !== undefined ? { transparency: lineTransparency } : {}),
          }
        : {
            color: 'FFFFFF',
            transparency: 100,
            width: 0,
          },
      ...(element.shapeType === 'roundRectangle' && (element.style.borderRadius ?? 0) > 0
        ? { rectRadius: Math.max(0.02, Math.min(0.35, (element.style.borderRadius ?? 12) / Math.max(1, element.height))) }
        : {}),
    };
  }

  private toTextOptions(
    element: PlannedTextElement,
    document: NonNullable<Slide['document']>,
    backdrop?: string,
  ): Record<string, unknown> {
    const color = cssColorToHex(element.style.color, element.textBackdrop ?? backdrop);
    return {
      ...this.basePosition(element, document),
      objectName: element.id,
      margin: 0,
      wrap: true,
      fit: 'none',
      isTextBox: true,
      shape: 'rect',
      rotate: element.rotation,
      fill: { type: 'none' },
      line: { color: 'FFFFFF', transparency: 100, width: 0 },
      ...(element.textAlignment ? { align: this.toHorizontalAlign(element.textAlignment) } : {}),
      ...(element.contentAlignment ? { valign: this.toVerticalAlign(element.contentAlignment) } : {}),
      ...(element.style.letterSpacing !== undefined ? { charSpacing: this.scaledPt(element.style.letterSpacing, document) } : {}),
      ...(element.lineSpacingPercent !== undefined ? { lineSpacingMultiple: element.lineSpacingPercent / 100 } : {}),
      ...(color ? { color } : {}),
      ...(isEmojiOnlyText(element.text) ? {} : sanitizeFontFamily(element.style.fontFamily) ? { fontFace: sanitizeFontFamily(element.style.fontFamily) } : {}),
      ...(element.style.fontSize !== undefined ? { fontSize: this.scaledPt(element.style.fontSize, document) } : {}),
      ...(element.style.fontWeight !== undefined ? { bold: element.style.fontWeight >= 600 } : {}),
      ...(element.style.fontStyle ? { italic: element.style.fontStyle === 'italic' } : {}),
    };
  }

  private toTextRuns(
    element: PlannedTextElement,
    document: NonNullable<Slide['document']>,
    backdrop?: string,
  ): Array<Record<string, unknown>> {
    const runs: Array<Record<string, unknown>> = [];

    if (element.paragraphs.length === 0) {
      return [{ text: element.text }];
    }

    element.paragraphs.forEach((paragraph, paragraphIndex) => {
      const paragraphRuns = paragraph.runs.length > 0
        ? paragraph.runs
        : [{ text: paragraph.text }];

      paragraphRuns.forEach((run, runIndex) => {
        const runColor = cssColorToHex(run.color ?? element.style.color, element.textBackdrop ?? backdrop);
        runs.push({
          text: run.text,
          options: {
            ...(paragraphIndex > 0 && runIndex === 0 ? { breakLine: true } : {}),
            ...(paragraph.bullet && runIndex === 0
              ? {
                  bullet: {
                    type: paragraph.bullet.type ?? 'bullet',
                    ...(paragraph.bullet.characterCode ? { characterCode: paragraph.bullet.characterCode } : {}),
                    indent: this.scaledPt(
                      paragraph.bullet.indent ?? 14 + ((paragraph.bullet.level ?? 0) * 10),
                      document,
                    ),
                  },
                }
              : {}),
            ...(paragraph.spaceBefore !== undefined ? { paraSpaceBefore: this.scaledPt(paragraph.spaceBefore, document) } : {}),
            ...(paragraph.spaceAfter !== undefined ? { paraSpaceAfter: this.scaledPt(paragraph.spaceAfter, document) } : {}),
            ...(runColor ? { color: runColor } : {}),
            ...(isEmojiOnlyText(run.text) ? {} : sanitizeFontFamily(run.fontFamily ?? element.style.fontFamily) ? { fontFace: sanitizeFontFamily(run.fontFamily ?? element.style.fontFamily) } : {}),
            ...(run.fontSize !== undefined
              ? { fontSize: this.scaledPt(run.fontSize, document) }
              : element.style.fontSize !== undefined
                ? { fontSize: this.scaledPt(element.style.fontSize, document) }
                : {}),
            ...(run.bold !== undefined ? { bold: run.bold } : {}),
            ...(run.italic !== undefined ? { italic: run.italic } : {}),
            ...(run.underline ? { underline: { style: 'sng' } } : {}),
          },
        });
      });
    });

    return runs;
  }

  private async toImageProps(
    element: SlideImageElement,
    document: NonNullable<Slide['document']>,
  ): Promise<Record<string, unknown>> {
    return {
      ...this.basePosition(element, document),
      objectName: element.id,
      altText: element.alt,
      rotate: element.rotation,
      data: await this.resolveImageData(element.src),
    };
  }

  private toTableRows(element: SlideTableElement): Array<Array<{ text: string }>> {
    return Array.from({ length: element.rows }, (_, rowIndex) => (
      Array.from({ length: element.columns }, (_, columnIndex) => (
        { text: element.cells.find((cell) => cell.row === rowIndex && cell.column === columnIndex)?.text ?? '' }
      ))
    ));
  }

  private toTableProps(
    element: SlideTableElement,
    document: NonNullable<Slide['document']>,
    backdrop?: string,
  ): Record<string, unknown> {
    const defaultCell = element.cells[0];
    const scale = this.slideScale(document);
    return {
      ...this.basePosition(element, document),
      objectName: element.id,
      margin: 0,
      border: {
        type: 'solid',
        pt: this.scaledPt(defaultCell?.style?.borderWidth ?? element.style.borderWidth ?? 1, document),
        color: cssColorToHex(defaultCell?.style?.borderColor ?? element.style.borderColor, backdrop) ?? 'D9D9D9',
      },
      fill: cssColorToHex(defaultCell?.style?.backgroundColor ?? element.style.backgroundColor, backdrop),
      color: cssColorToHex(defaultCell?.style?.color ?? element.style.color, backdrop),
      fontFace: sanitizeFontFamily(defaultCell?.style?.fontFamily ?? element.style.fontFamily),
      fontSize: defaultCell?.style?.fontSize !== undefined
        ? this.scaledPt(defaultCell.style.fontSize, document)
        : element.style.fontSize !== undefined
          ? this.scaledPt(element.style.fontSize, document)
          : undefined,
      valign: 'mid',
      colW: Array.from({ length: element.columns }, () => (
        Math.round((element.width / Math.max(1, element.columns)) * scale.xInchesPerPx * 1000) / 1000
      )),
      rowH: Array.from({ length: element.rows }, () => (
        Math.round((element.height / Math.max(1, element.rows)) * scale.yInchesPerPx * 1000) / 1000
      )),
    };
  }

  private toHorizontalAlign(value: 'left' | 'center' | 'right' | 'justify'): 'left' | 'center' | 'right' | 'justify' {
    return value;
  }

  private toVerticalAlign(value: 'top' | 'middle' | 'bottom'): 'top' | 'mid' | 'bottom' {
    switch (value) {
      case 'middle':
        return 'mid';
      default:
        return value;
    }
  }

  private async resolveImageData(source: string): Promise<string> {
    if (source.startsWith('data:')) {
      return source;
    }

    if (/^https?:\/\//i.test(source)) {
      const response = await this.fetchImpl(source);
      if (!response.ok) {
        throw new Error(`Failed to fetch image for PPTX export (${response.status}): ${source}`);
      }
      const contentType = response.headers.get('content-type') || inferImageMimeType(source);
      const buffer = Buffer.from(await response.arrayBuffer());
      return `data:${contentType};base64,${buffer.toString('base64')}`;
    }

    const buffer = await readFile(source);
    return `data:${inferImageMimeType(source)};base64,${buffer.toString('base64')}`;
  }

  private sanitizeFilename(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100)
      || 'presentation';
  }
}
