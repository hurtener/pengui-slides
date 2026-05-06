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
import { resolveFontsForEmbedding, type BundledFontFace, type FontWeight, type FontStyle } from '../souls/font-registry.js';
import type JSZip from 'jszip';
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
    const data = await this.patchContentTypes(Buffer.from(arrayBuffer), soul);
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
    // Line shapes (`<hr>` rules) are explicitly chosen for native PPTX line
    // rendering — don't morph them into thin top-border rectangles even
    // though their computed borderStyle matches the legacy heuristic.
    if (element.shapeType === 'line') {
      return element;
    }
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
                  // pptxgenjs 3.12.0 quirk: when `bullet.type` is set to a
                  // truthy non-'number' string (`'bullet'`), the library's
                  // if/else-if chain silently emits no bullet glyph at all
                  // (pptxgen.cjs.js:5846-5876). Workaround: only pass
                  // `type: 'number'` for ordered lists; for unordered lists
                  // omit `type` and pass an explicit `characterCode`
                  // (defaulting to U+2022 BULLET) so the `else if
                  // (characterCode)` branch fires and a `<a:buChar/>`
                  // actually lands in the slide XML.
                  bullet: paragraph.bullet.type === 'number'
                    ? {
                        type: 'number' as const,
                        indent: this.scaledPt(
                          paragraph.bullet.indent ?? 14 + ((paragraph.bullet.level ?? 0) * 10),
                          document,
                        ),
                      }
                    : {
                        characterCode: paragraph.bullet.characterCode ?? '2022',
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
            ...(run.link ? { hyperlink: { url: run.link } } : {}),
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

  private toTableRows(element: SlideTableElement): Array<Array<Record<string, unknown>>> {
    return Array.from({ length: element.rows }, (_, rowIndex) => (
      Array.from({ length: element.columns }, (_, columnIndex) => {
        const cell = element.cells.find((c) => c.row === rowIndex && c.column === columnIndex);
        if (!cell) return { text: '' };
        // Per-cell options — fill (for header-row bg), font/weight/align —
        // come from the cell's computed style. Without this every cell
        // defaults to the table-level fill and the header-row chrome is
        // lost on export.
        const cellFillHex = cssColorToHex(cell.style?.backgroundColor);
        const cellFillTransparent = cell.style?.backgroundColor
          ? isTransparent(cell.style.backgroundColor)
          : true;
        const cellColorHex = cell.style?.color ? cssColorToHex(cell.style.color) : undefined;
        const rawAlign = cell.style?.textAlign as string | undefined;
        const align = !rawAlign || rawAlign === 'start' || rawAlign === 'justify'
          ? rawAlign === 'justify' ? 'left' : undefined
          : rawAlign;
        const cellOptions: Record<string, unknown> = {
          ...(cellFillHex && !cellFillTransparent ? { fill: { color: cellFillHex } } : {}),
          ...(cellColorHex && (!cell.runs || cell.runs.length === 0) ? { color: cellColorHex } : {}),
          ...(cell.style?.fontFamily ? { fontFace: sanitizeFontFamily(cell.style.fontFamily) } : {}),
          ...(cell.style?.fontWeight !== undefined ? { bold: cell.style.fontWeight >= 600 } : {}),
          ...(align ? { align } : {}),
          valign: 'mid',
        };
        // When the compiler captured per-run formatting (e.g. an inline
        // accent-colored span on a first-column label), forward the runs
        // into pptxgenjs's table cell so the colors survive in PPTX.
        if (cell.runs && cell.runs.length > 0) {
          return {
            text: cell.runs.map((run) => ({
              text: run.text,
              options: {
                ...(run.color ? { color: cssColorToHex(run.color) ?? run.color } : {}),
                ...(run.fontFamily ? { fontFace: sanitizeFontFamily(run.fontFamily) } : {}),
                ...(run.bold ? { bold: true } : {}),
                ...(run.italic ? { italic: true } : {}),
                ...(run.underline ? { underline: { style: 'sng' } } : {}),
                ...(run.link ? { hyperlink: { url: run.link } } : {}),
              },
            })),
            options: cellOptions,
          };
        }
        return { text: cell.text, options: cellOptions };
      })
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
      // No table-wide `fill` — `toTableRows` threads each cell's own
      // backgroundColor as the cell's `fill`, so a table-level fill would
      // bleed through cells that should be transparent (e.g. the data
      // rows under a header row that has its own surface bg).
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

  /**
   * Repairs two known pptxgenjs 3.12.0 bugs that make PowerPoint flag the
   * exported deck with "found a problem with content":
   *
   *   1. [Content_Types].xml generator iterates slides instead of
   *      slide-masters, so an N-slide deck declares Override entries for
   *      `slideMaster1.xml` … `slideMasterN.xml` even though only
   *      `slideMaster1.xml` actually exists. (pptxgen.cjs.js:6332)
   *      Fix: keep only Overrides whose PartName resolves to a real file.
   *
   *   2. The text-body builder emits a fresh `<a:pPr>` per run inside
   *      `<a:p>` (pptxgen.cjs.js:6230). OOXML allows ONE pPr per paragraph;
   *      multi-run paragraphs ("The Art of " + "Coffee Brewing" with
   *      different colors) end up with N copies of identical pPr blocks.
   *      Fix: collapse duplicates per `<a:p>`, keeping the first pPr.
   *
   * Once upstream ships a fix, these post-process steps can be deleted.
   */
  private async patchContentTypes(buffer: Buffer, soul?: DesignSoul): Promise<Buffer> {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(buffer);
    let modified = false;

    // v4.15: embed bundled TTFs for the soul's typography stack BEFORE
    // [Content_Types] cleanup runs — embedFonts adds new font parts and
    // their Override entries; the cleanup pass needs to see them as
    // valid (their PartName must resolve to a real file in the zip).
    if (soul) {
      const embedded = await this.embedFonts(zip, soul);
      if (embedded) modified = true;
    }

    // 1. [Content_Types] — drop Overrides whose PartName isn't in the zip.
    const ctEntry = zip.file('[Content_Types].xml');
    if (ctEntry) {
      const original = await ctEntry.async('string');
      const present = new Set<string>(
        Object.keys(zip.files)
          .filter((name) => !zip.files[name].dir)
          .map((name) => '/' + name),
      );
      const patched = original.replace(
        /<Override\b[^>]*\bPartName="([^"]+)"[^>]*\/>/g,
        (match, partName: string) => (present.has(partName) ? match : ''),
      );
      if (patched !== original) {
        zip.file('[Content_Types].xml', patched);
        modified = true;
      }
    }

    // 2. Slide XMLs — dedupe pPr siblings inside each <a:p>.
    const slidePaths = Object.keys(zip.files).filter(
      (name) => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'),
    );
    for (const path of slidePaths) {
      const entry = zip.file(path);
      if (!entry) continue;
      const original = await entry.async('string');
      const patched = fixZeroWidthCellLines(fixEmptyTblPr(renumberCNvPrIds(stripLineShapeFill(stripDuplicateParagraphProps(original)))));
      if (patched !== original) {
        zip.file(path, patched);
        modified = true;
      }
    }

    if (!modified) {
      return buffer;
    }
    const out = await zip.generateAsync({ type: 'nodebuffer' });
    return Buffer.from(out);
  }

  /**
   * v4.15 — Embed the soul's bundled TTFs into the editable PPTX so
   * PowerPoint renders native text shapes with the same typography on
   * any host, not just machines that have Inter / JetBrains Mono
   * installed locally.
   *
   * Per the OOXML spec (ECMA-376 Part 1 §13.3.3), font embedding requires
   * four pieces:
   *
   *   1. Each font file lives under `ppt/fonts/font<N>.fntdata` (the
   *      `.fntdata` extension is conventional — content is raw TTF bytes).
   *   2. `[Content_Types].xml` declares the part type via
   *      `<Default Extension="fntdata" ContentType="application/x-fontdata"/>`.
   *   3. `ppt/_rels/presentation.xml.rels` adds a Relationship of type
   *      `…/relationships/font` pointing at each font part.
   *   4. `ppt/presentation.xml` declares `<p:embeddedFontLst>` mapping
   *      typeface (display name, e.g. "Inter") to the relationship ids
   *      for regular / bold / italic / boldItalic. PowerPoint reads this
   *      list when laying out a slide whose runs reference the typeface.
   *
   * Returns true if any font was embedded.
   */
  private async embedFonts(
    zip: JSZip,
    soul: DesignSoul,
  ): Promise<boolean> {
    const faces = resolveFontsForEmbedding(soul);
    if (faces.length === 0) return false;

    // Group faces by family so each <p:embeddedFont> entry collects its
    // weight variants under one typeface header.
    const byFamily = new Map<string, Array<BundledFontFace & { bytes: Buffer; rid: string }>>();

    // 1. Write font binaries + assign new relationship ids. We pick rIds
    //    starting at 1000 to avoid colliding with the existing pptxgenjs
    //    relationship namespace (theme1, slideMaster1, etc., typically <100).
    const presRelsPath = 'ppt/_rels/presentation.xml.rels';
    const presRelsEntry = zip.file(presRelsPath);
    if (!presRelsEntry) return false;
    const existingRels = await presRelsEntry.async('string');

    // Idempotency guard: if a previous embedFonts run already wrote font
    // Relationships into this presentation, skip the whole pass. Without
    // this, calling patchContentTypes twice on the same buffer would
    // append duplicate <Relationship> entries pointing at the same
    // ppt/fonts/font<N>.fntdata Targets — PowerPoint flags duplicate rels
    // as "found a problem with content". The other two patches (Default
    // extension entry, embeddedFontLst block) already had guards; this
    // closes the gap.
    if (/Type="[^"]*\/font"\s+Target="fonts\/font/.test(existingRels)) {
      return false;
    }

    let nextRid = pickNextRid(existingRels, 1000);

    const newRels: string[] = [];
    let fileIndex = 1;
    for (const face of faces) {
      const partName = `ppt/fonts/font${fileIndex}.fntdata`;
      // jszip accepts Buffer for binary files; encoding is preserved.
      zip.file(partName, face.bytes);
      const rid = `rId${nextRid++}`;
      newRels.push(
        `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font${fileIndex}.fntdata"/>`,
      );
      const list = byFamily.get(face.family) ?? [];
      list.push({ ...face, rid });
      byFamily.set(face.family, list);
      fileIndex += 1;
    }

    // 2. Add the Default extension entry for `fntdata` to [Content_Types].xml
    //    (idempotent — no-op if already present).
    const ctPath = '[Content_Types].xml';
    const ctEntry = zip.file(ctPath);
    if (ctEntry) {
      let ct = await ctEntry.async('string');
      if (!/Extension="fntdata"/.test(ct)) {
        ct = ct.replace(
          /<Types\b([^>]*)>/,
          `<Types$1><Default Extension="fntdata" ContentType="application/x-fontdata"/>`,
        );
        zip.file(ctPath, ct);
      }
    }

    // 3. Splice the new font Relationships into ppt/_rels/presentation.xml.rels
    //    (right before the closing </Relationships>).
    const patchedRels = existingRels.replace(
      /<\/Relationships>\s*$/,
      `${newRels.join('')}</Relationships>`,
    );
    zip.file(presRelsPath, patchedRels);

    // 4. Add <p:embeddedFontLst> to ppt/presentation.xml. ECMA-376 Part 1
    //    §13.3.3 requires the block to appear AFTER <p:sldSize>/<p:notesSz>
    //    and BEFORE <p:defaultTextStyle>. We splice it in immediately
    //    before <p:defaultTextStyle> when present, falling back to just
    //    before </p:presentation> when the deck doesn't carry a default
    //    text style block — covers both pptxgenjs output (always emits
    //    defaultTextStyle) and any sparser future generator.
    const presPath = 'ppt/presentation.xml';
    const presEntry = zip.file(presPath);
    if (presEntry) {
      const original = await presEntry.async('string');
      const fontEntries: string[] = [];
      for (const [family, variants] of byFamily) {
        const tag = (
          weight: FontWeight,
          style: FontStyle,
        ): string | null => {
          const v = variants.find((x) => x.weight === weight && x.style === style);
          if (!v) return null;
          if (weight === 700 && style === 'normal') return `<p:bold r:id="${v.rid}"/>`;
          if (weight === 400 && style === 'italic') return `<p:italic r:id="${v.rid}"/>`;
          if (weight === 700 && style === 'italic') return `<p:boldItalic r:id="${v.rid}"/>`;
          // Treat 400 and 500 (and any non-bold non-italic) as the regular slot;
          // PowerPoint expects exactly one <p:regular> per <p:embeddedFont>.
          return `<p:regular r:id="${v.rid}"/>`;
        };
        const slots: string[] = [];
        // Only the first non-bold/non-italic variant claims <p:regular>.
        // For Inter we ship 400 + 500 + 700 — 400 wins regular, 500 is dropped
        // from the list (PPTX has no 'medium' slot), 700 → bold.
        const regular = variants.find((v) => v.weight === 400 && v.style === 'normal')
          ?? variants.find((v) => v.style === 'normal' && v.weight !== 700);
        if (regular) slots.push(`<p:regular r:id="${regular.rid}"/>`);
        const bold = tag(700, 'normal');
        if (bold) slots.push(bold);
        const italic = tag(400, 'italic');
        if (italic) slots.push(italic);
        const boldItalic = tag(700, 'italic');
        if (boldItalic) slots.push(boldItalic);
        if (slots.length === 0) continue;
        fontEntries.push(
          `<p:embeddedFont><p:font typeface="${escapeXmlAttr(family)}"/>${slots.join('')}</p:embeddedFont>`,
        );
      }
      if (fontEntries.length > 0) {
        const block = `<p:embeddedFontLst>${fontEntries.join('')}</p:embeddedFontLst>`;
        // Idempotent guard: skip if a block is already present from a prior run.
        if (!/<p:embeddedFontLst>/.test(original)) {
          const defaultStyleRe = /<p:defaultTextStyle\b/;
          const patched = defaultStyleRe.test(original)
            ? original.replace(defaultStyleRe, `${block}<p:defaultTextStyle`)
            : original.replace(/<\/p:presentation>\s*$/, `${block}</p:presentation>`);
          zip.file(presPath, patched);
        }
      }
    }

    return true;
  }
}

/** Find the highest rId<N> in an existing .rels XML and return a starting id
 *  guaranteed not to collide. `floor` lets the caller pin a comfortable lower
 *  bound when the file has only single-digit ids. */
function pickNextRid(relsXml: string, floor: number): number {
  let max = floor - 1;
  const re = /\bId="rId(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(relsXml)) !== null) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max + 1;
}

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}


/**
 * Within each `<a:p>...</a:p>` block, keep only the first `<a:pPr>` (whether
 * self-closing or with nested content) and remove the rest. pptxgenjs emits
 * pPr per run, but OOXML allows just one per paragraph.
 */
function stripDuplicateParagraphProps(xml: string): string {
  return xml.replace(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/g, (paragraph) => {
    let seen = false;
    return paragraph.replace(
      /<a:pPr\b(?:[^>]*\/>|[^>]*>[\s\S]*?<\/a:pPr>)/g,
      (block) => {
        if (seen) return '';
        seen = true;
        return block;
      },
    );
  });
}

/**
 * Renumber `<p:cNvPr id="N">` so every id within a slide is unique. pptxgenjs
 * 3.12.0 uses a per-shape-type id counter, so when a slide mixes regular
 * shapes (incremented in one counter) with `addTable` (incremented in
 * another), they collide. PowerPoint flags duplicate ids as "found a problem
 * with content".
 */
function renumberCNvPrIds(xml: string): string {
  let next = 2; // id=1 is conventionally the group nvGrpSpPr; skip it
  let isFirst = true;
  return xml.replace(/<p:cNvPr\s+id="(\d+)"/g, (_match) => {
    if (isFirst) {
      isFirst = false;
      return '<p:cNvPr id="1"';
    }
    const id = next++;
    return `<p:cNvPr id="${id}"`;
  });
}

/**
 * Line shapes (`<a:prstGeom prst="line"/>`) must not carry an `<a:solidFill>`
 * inside their `<p:spPr>` — that element describes a closed shape's interior
 * fill, which is meaningless on a line and triggers PowerPoint's "found a
 * problem with content" prompt. The valid stroke is in `<a:ln>` only.
 * pptxgenjs emits a transparent solidFill placeholder; strip it for lines.
 */
function stripLineShapeFill(xml: string): string {
  return xml.replace(/<p:sp>[\s\S]*?<\/p:sp>/g, (sp) => {
    if (!/<a:prstGeom\s+prst="line"/.test(sp)) return sp;
    return sp.replace(
      /<p:spPr>([\s\S]*?)<\/p:spPr>/,
      (_full, inner: string) => {
        // Only strip <a:solidFill> that is a DIRECT child of <p:spPr>; leave
        // the one nested inside <a:ln> intact (that's the line's stroke).
        let depth = 0;
        let cleaned = '';
        const tokens = inner.split(/(<a:ln\b[^>]*>|<\/a:ln>|<a:solidFill\b[^>]*\/?>|<\/a:solidFill>)/);
        let skipping = false;
        for (const tok of tokens) {
          if (/^<a:ln\b/.test(tok)) depth += 1;
          else if (/^<\/a:ln>/.test(tok)) depth -= 1;
          if (depth === 0 && /^<a:solidFill\b/.test(tok)) {
            skipping = !/\/>$/.test(tok); // self-closing already done
            if (/\/>$/.test(tok)) continue;
            continue;
          }
          if (skipping) {
            if (/^<\/a:solidFill>/.test(tok)) skipping = false;
            continue;
          }
          cleaned += tok;
        }
        return `<p:spPr>${cleaned}</p:spPr>`;
      },
    );
  });
}

/**
 * v4.18.4 — pptxgenjs 3.12 emits `<a:tblPr/>` (empty self-closing) for
 * tables when no `tableStyleId` option is set. PowerPoint's strict
 * validator (Mac PPT recent builds) flags an empty `<a:tblPr/>`
 * paired with a populated `<a:tblGrid>` + `<a:tr>` as inconsistent,
 * triggering the "PowerPoint found a problem with content" repair
 * prompt on file open.
 *
 * Inject the canonical Microsoft "No Style, No Grid" table style
 * GUID — `{5940675A-B579-460E-94D1-54222C63F5DA}` — so the validator
 * sees a style reference WITHOUT applying any preset row banding /
 * header chrome on top of our per-cell styling. v4.18.5 fix: the
 * previous Medium-Style-2 GUID overlaid light banding rows that hid
 * dark-mode cell fills (Galici slide 12 came out white instead of
 * dark navy). No-Style-No-Grid is the inert option.
 *
 * Both self-closing `<a:tblPr/>` and empty-content `<a:tblPr></a:tblPr>`
 * forms covered.
 */
function fixEmptyTblPr(xml: string): string {
  const styled =
    '<a:tblPr><a:tableStyleId>{5940675A-B579-460E-94D1-54222C63F5DA}</a:tableStyleId></a:tblPr>';
  return xml
    .replace(/<a:tblPr\s*\/>/g, styled)
    .replace(/<a:tblPr>\s*<\/a:tblPr>/g, styled);
}

/**
 * v4.18.5 — pptxgenjs rounds table `border.pt` values < 1 down to 0,
 * emitting `<a:lnL/lnR/lnT/lnB w="0" cap="flat" cmpd="sng" algn="ctr">`
 * with full populated children (cap, dash, end attributes). PowerPoint
 * Mac flags the inconsistency (`w="0"` + populated decorators ⇒ "is
 * this line zero-width or styled?") as a content problem.
 *
 * Replace `w="0"` on `<a:lnL/lnR/lnT/lnB>` with `w="6350"` (0.5pt in
 * EMU) — visible at print fidelity without changing the design intent
 * (the per-cell `<a:noFill/>` inner element still suppresses the
 * stroke when the design wants no border).
 */
function fixZeroWidthCellLines(xml: string): string {
  return xml.replace(
    /(<a:ln[LRTB]\s+)w="0"/g,
    '$1w="6350"',
  );
}
