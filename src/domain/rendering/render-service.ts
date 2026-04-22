/**
 * Render Service for Pengui Slides.
 *
 * High-level orchestrator that lazily initializes rendering
 * sub-components and exposes a clean public API for previews
 * and multi-format exports.
 */

import type { PenguiConfig } from '../../config.js';
import type { Logger } from '../../infrastructure/logger.js';
import type { AssetService } from '../assets/asset-service.js';
import type { SoulService } from '../souls/soul-service.js';
import type { Slide } from '../../types/deck.js';
import type { FormatKind } from '../../types/format.js';
import type {
  PreviewResult,
  PreviewOptions,
  ExportResult,
  PptxExportResult,
  ExportPptxOptions,
  PdfMode,
  RenderOptions,
  SlideRenderResult,
} from '../../types/export.js';

import { PlaywrightPool } from './playwright-pool.js';
import { SlideRenderer } from './slide-renderer.js';
import { PreviewRenderer } from './preview-renderer.js';
import type { PreviewInput } from './preview-renderer.js';
import { ImagePptxExporter } from './pptx-exporter.js';
import { EditablePptxExporter } from './editable-pptx-exporter.js';
import { PdfExporter } from './pdf-exporter.js';
import { HtmlExporter } from './html-exporter.js';

// ── Render Service ───────────────────────────────────────────────

export class RenderService {
  private pool: PlaywrightPool | null = null;
  private slideRenderer: SlideRenderer | null = null;
  private previewRenderer: PreviewRenderer | null = null;
  private imagePptxExporter: ImagePptxExporter | null = null;
  private editablePptxExporter: EditablePptxExporter | null = null;
  private pdfExporter: PdfExporter | null = null;
  private htmlExporter: HtmlExporter | null = null;

  constructor(
    private readonly config: PenguiConfig,
    private readonly logger: Logger,
    private readonly assetService?: AssetService,
    private readonly soulService?: SoulService,
  ) {}

  // ── Preview ──────────────────────────────────────────────────

  /**
   * Render preview thumbnails for the given slides.
   */
  async renderPreview(
    slides: Slide[],
    options?: Partial<PreviewOptions>,
  ): Promise<PreviewResult[]> {
    const renderer = this.ensurePreviewRenderer();

    const inputs: PreviewInput[] = slides.map((slide) => ({
      slideId: slide.id,
      position: slide.position,
      html: slide.html,
    }));

    return renderer.renderPreviews(inputs, {
      width: this.config.previewWidth,
      height: this.config.previewHeight,
      format: 'png',
      ...options,
    });
  }

  // ── PPTX Export ──────────────────────────────────────────────

  /**
   * Export slides as a PowerPoint (.pptx) file.
   */
  async exportPptx(
    slides: Slide[],
    deckTitle: string,
    soulId?: string,
    options?: Partial<ExportPptxOptions>,
  ): Promise<PptxExportResult> {
    if (options?.mode === 'image') {
      const exporter = this.ensureImagePptxExporter();
      return exporter.export(slides, deckTitle, options);
    }

    if (options?.mode === undefined && slides.some((slide) => this.shouldFallbackToImagePptx(slide))) {
      this.logger.info('Falling back to image PPTX export because one or more slides are not editable-export ready');
      const exporter = this.ensureImagePptxExporter();
      return exporter.export(slides, deckTitle, options);
    }

    const exporter = this.ensureEditablePptxExporter();
    return exporter.export(slides, deckTitle, soulId, options);
  }

  // ── PDF Export ───────────────────────────────────────────────

  /**
   * Export slides as a PDF file.
   *
   * @param mode   'image' renders slides to PNG first; 'direct' uses page.pdf().
   *               Defaults to 'image' for slide formats and 'direct' for print formats.
   * @param format Optional deck format. When set, the exporter derives page geometry
   *               from the registry (A4 / Letter / 16:9). Omission falls back to slides_16_9.
   */
  async exportPdf(
    slides: Slide[],
    deckTitle: string,
    mode?: PdfMode,
    format?: FormatKind,
  ): Promise<ExportResult> {
    const exporter = this.ensurePdfExporter();
    return exporter.export(slides, deckTitle, { mode, format });
  }

  // ── HTML Export ──────────────────────────────────────────────

  /**
   * Export slides as a self-contained HTML file.
   */
  async exportHtml(
    slides: Slide[],
    deckTitle: string,
    includeNavigation?: boolean,
  ): Promise<ExportResult> {
    const exporter = this.ensureHtmlExporter();
    return exporter.export(slides, deckTitle, includeNavigation);
  }

  async renderSlideHtml(
    html: string,
    slideId: string,
    options?: Partial<RenderOptions>,
  ): Promise<SlideRenderResult> {
    const renderer = this.ensureSlideRenderer();
    return renderer.render(html, slideId, options);
  }

  // ── Lifecycle ────────────────────────────────────────────────

  /**
   * Shut down the browser pool and release all resources.
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down render service');

    if (this.pool) {
      await this.pool.shutdown();
    }
    this.slideRenderer?.clearCache();

    this.pool = null;
    this.slideRenderer = null;
    this.previewRenderer = null;
    this.imagePptxExporter = null;
    this.editablePptxExporter = null;
    this.pdfExporter = null;
    this.htmlExporter = null;

    this.logger.info('Render service shut down');
  }

  private shouldFallbackToImagePptx(slide: Slide): boolean {
    return slide.sourceKind !== 'document_v1'
      || !slide.document
      || slide.translationIssues.some((issue) => issue.severity === 'error')
      || slide.document.elements.some((element) => element.exportDisposition === 'blocked');
  }

  // ── Lazy Initialization ──────────────────────────────────────

  private ensurePool(): PlaywrightPool {
    if (!this.pool) {
      this.pool = new PlaywrightPool({
        headless: this.config.headless,
      });
    }
    return this.pool;
  }

  private ensureSlideRenderer(): SlideRenderer {
    if (!this.slideRenderer) {
      const pool = this.ensurePool();
      this.slideRenderer = new SlideRenderer(
        pool,
        this.logger.child('slide-renderer'),
        this.assetService,
      );
    }
    return this.slideRenderer;
  }

  private ensurePreviewRenderer(): PreviewRenderer {
    if (!this.previewRenderer) {
      const renderer = this.ensureSlideRenderer();
      this.previewRenderer = new PreviewRenderer(
        renderer,
        this.logger.child('preview-renderer'),
      );
    }
    return this.previewRenderer;
  }

  private ensureImagePptxExporter(): ImagePptxExporter {
    if (!this.imagePptxExporter) {
      const renderer = this.ensureSlideRenderer();
      this.imagePptxExporter = new ImagePptxExporter(
        renderer,
        this.logger.child('pptx-exporter'),
      );
    }
    return this.imagePptxExporter;
  }

  private ensureEditablePptxExporter(): EditablePptxExporter {
    if (!this.editablePptxExporter) {
      const renderer = this.ensureSlideRenderer();
      this.editablePptxExporter = new EditablePptxExporter(
        renderer,
        this.logger.child('editable-pptx-exporter'),
        this.soulService,
      );
    }
    return this.editablePptxExporter;
  }

  private ensurePdfExporter(): PdfExporter {
    if (!this.pdfExporter) {
      const renderer = this.ensureSlideRenderer();
      const pool = this.ensurePool();
      this.pdfExporter = new PdfExporter(
        renderer,
        pool,
        this.logger.child('pdf-exporter'),
        this.assetService,
      );
    }
    return this.pdfExporter;
  }

  private ensureHtmlExporter(): HtmlExporter {
    if (!this.htmlExporter) {
      this.htmlExporter = new HtmlExporter(
        this.logger.child('html-exporter'),
        this.assetService,
      );
    }
    return this.htmlExporter;
  }
}
