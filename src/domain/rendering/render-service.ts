/**
 * Render Service for Pengui Slides.
 *
 * High-level orchestrator that lazily initializes rendering
 * sub-components and exposes a clean public API for previews
 * and multi-format exports.
 */

import type { PenguiConfig } from '../../config.js';
import type { Logger } from '../../infrastructure/logger.js';
import type { Slide } from '../../types/deck.js';
import type {
  PreviewResult,
  PreviewOptions,
  ExportResult,
  ExportPptxOptions,
  PdfMode,
} from '../../types/export.js';

import { PlaywrightPool } from './playwright-pool.js';
import { SlideRenderer } from './slide-renderer.js';
import { PreviewRenderer } from './preview-renderer.js';
import type { PreviewInput } from './preview-renderer.js';
import { PptxExporter } from './pptx-exporter.js';
import { PdfExporter } from './pdf-exporter.js';
import { HtmlExporter } from './html-exporter.js';

// ── Render Service ───────────────────────────────────────────────

export class RenderService {
  private pool: PlaywrightPool | null = null;
  private slideRenderer: SlideRenderer | null = null;
  private previewRenderer: PreviewRenderer | null = null;
  private pptxExporter: PptxExporter | null = null;
  private pdfExporter: PdfExporter | null = null;
  private htmlExporter: HtmlExporter | null = null;

  constructor(
    private readonly config: PenguiConfig,
    private readonly logger: Logger,
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
    options?: Partial<ExportPptxOptions>,
  ): Promise<ExportResult> {
    const exporter = this.ensurePptxExporter();
    return exporter.export(slides, deckTitle, options);
  }

  // ── PDF Export ───────────────────────────────────────────────

  /**
   * Export slides as a PDF file.
   *
   * @param mode 'image' renders slides to PNG first; 'direct' uses page.pdf().
   */
  async exportPdf(
    slides: Slide[],
    deckTitle: string,
    mode?: PdfMode,
  ): Promise<ExportResult> {
    const exporter = this.ensurePdfExporter();
    return exporter.export(slides, deckTitle, mode);
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

  // ── Lifecycle ────────────────────────────────────────────────

  /**
   * Shut down the browser pool and release all resources.
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down render service');

    if (this.pool) {
      await this.pool.shutdown();
    }

    this.pool = null;
    this.slideRenderer = null;
    this.previewRenderer = null;
    this.pptxExporter = null;
    this.pdfExporter = null;
    this.htmlExporter = null;

    this.logger.info('Render service shut down');
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

  private ensurePptxExporter(): PptxExporter {
    if (!this.pptxExporter) {
      const renderer = this.ensureSlideRenderer();
      this.pptxExporter = new PptxExporter(
        renderer,
        this.logger.child('pptx-exporter'),
      );
    }
    return this.pptxExporter;
  }

  private ensurePdfExporter(): PdfExporter {
    if (!this.pdfExporter) {
      const renderer = this.ensureSlideRenderer();
      const pool = this.ensurePool();
      this.pdfExporter = new PdfExporter(
        renderer,
        pool,
        this.logger.child('pdf-exporter'),
      );
    }
    return this.pdfExporter;
  }

  private ensureHtmlExporter(): HtmlExporter {
    if (!this.htmlExporter) {
      this.htmlExporter = new HtmlExporter(
        this.logger.child('html-exporter'),
      );
    }
    return this.htmlExporter;
  }
}
