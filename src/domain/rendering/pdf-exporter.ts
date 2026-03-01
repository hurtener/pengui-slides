/**
 * PDF Exporter for Pengui Slides.
 *
 * Supports two modes:
 *   - 'image':  Render each slide as an image, then combine into a single PDF.
 *   - 'direct': Use Playwright's page.pdf() with CSS page breaks.
 */

import type { Logger } from '../../infrastructure/logger.js';
import type { PlaywrightPool } from './playwright-pool.js';
import type { SlideRenderer } from './slide-renderer.js';
import type { Slide } from '../../types/deck.js';
import type { ExportResult, PdfMode } from '../../types/export.js';

// ── Constants ────────────────────────────────────────────────────

const SLIDE_WIDTH = 1920;
const SLIDE_HEIGHT = 1080;

// ── PDF Exporter ─────────────────────────────────────────────────

export class PdfExporter {
  constructor(
    private readonly renderer: SlideRenderer,
    private readonly pool: PlaywrightPool,
    private readonly logger: Logger,
  ) {}

  /**
   * Export slides as a PDF buffer.
   *
   * @param slides    Ordered array of slides.
   * @param deckTitle Used for the filename.
   * @param mode      'image' renders each slide to PNG first; 'direct' uses page.pdf().
   */
  async export(
    slides: Slide[],
    deckTitle: string,
    mode: PdfMode = 'image',
  ): Promise<ExportResult> {
    this.logger.info('Starting PDF export', {
      slideCount: slides.length,
      mode,
    });

    const data =
      mode === 'direct'
        ? await this.exportDirect(slides)
        : await this.exportImage(slides);

    const filename = this.sanitizeFilename(deckTitle) + '.pdf';

    this.logger.info('PDF export complete', {
      filename,
      slideCount: slides.length,
      bytes: data.length,
    });

    return {
      format: 'pdf',
      data,
      mimeType: 'application/pdf',
      filename,
      slideCount: slides.length,
      fileSizeBytes: data.length,
      exportedAt: new Date().toISOString(),
    };
  }

  // ── Image Mode ───────────────────────────────────────────────

  /**
   * Render each slide to a PNG, then build a PDF that places
   * one full-bleed image per page.
   */
  private async exportImage(slides: Slide[]): Promise<Buffer> {
    // Render all slides to images first
    const images: Buffer[] = [];
    for (const slide of slides) {
      const result = await this.renderer.render(slide.html, slide.id, {
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
        deviceScaleFactor: 1,
        format: 'png',
      });
      images.push(result.imageData);
    }

    // Build an HTML document that lays out images one per page
    const imgTags = images
      .map((buf) => {
        const b64 = buf.toString('base64');
        return `<div class="page"><img src="data:image/png;base64,${b64}" /></div>`;
      })
      .join('\n');

    const html = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: ${SLIDE_WIDTH}px ${SLIDE_HEIGHT}px; margin: 0; }
  .page {
    width: ${SLIDE_WIDTH}px;
    height: ${SLIDE_HEIGHT}px;
    page-break-after: always;
    overflow: hidden;
  }
  .page:last-child { page-break-after: auto; }
  .page img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
  }
</style>
</head>
<body>
${imgTags}
</body>
</html>`;

    return this.printToPdf(html);
  }

  // ── Direct Mode ──────────────────────────────────────────────

  /**
   * Combine all slide HTML into a single document with CSS
   * page breaks and use Playwright's page.pdf() directly.
   */
  private async exportDirect(slides: Slide[]): Promise<Buffer> {
    const sections = slides
      .map(
        (slide) =>
          `<section class="slide-page">${slide.html}</section>`,
      )
      .join('\n');

    const html = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: ${SLIDE_WIDTH}px ${SLIDE_HEIGHT}px; margin: 0; }
  .slide-page {
    width: ${SLIDE_WIDTH}px;
    height: ${SLIDE_HEIGHT}px;
    page-break-after: always;
    overflow: hidden;
    position: relative;
  }
  .slide-page:last-child { page-break-after: auto; }
</style>
</head>
<body>
${sections}
</body>
</html>`;

    return this.printToPdf(html);
  }

  // ── Shared PDF Printing ──────────────────────────────────────

  /**
   * Load HTML into a Playwright page and print to PDF.
   */
  private async printToPdf(html: string): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let page: any | null = null;

    try {
      page = await this.pool.getPage();

      await page.setViewportSize({
        width: SLIDE_WIDTH,
        height: SLIDE_HEIGHT,
      });

      await page.setContent(html, { waitUntil: 'networkidle' });

      const pdfBuffer: Buffer = await page.pdf({
        width: `${SLIDE_WIDTH}px`,
        height: `${SLIDE_HEIGHT}px`,
        printBackground: true,
        margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      });

      return pdfBuffer;
    } finally {
      if (page) {
        await this.pool.releasePage(page);
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  private sanitizeFilename(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100)
      || 'presentation';
  }
}
