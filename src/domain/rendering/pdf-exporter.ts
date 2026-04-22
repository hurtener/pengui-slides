/**
 * PDF Exporter for Pengui Slides.
 *
 * Supports two modes:
 *   - 'image':  Render each slide as an image, then combine into a single PDF.
 *   - 'direct': Use Playwright's page.pdf() with CSS page breaks.
 *
 * The exporter is format-aware: callers pass either a FormatKind or a
 * FormatGeometry, and the output page size, viewport, and default mode
 * are derived from that. Omission falls back to slides_16_9 (1920×1080)
 * so existing slide exports remain byte-identical.
 */

import type { Logger } from '../../infrastructure/logger.js';
import type { AssetService } from '../assets/asset-service.js';
import { resolveAssetRefs } from '../assets/asset-resolver.js';
import type { PlaywrightPool } from './playwright-pool.js';
import type { SlideRenderer } from './slide-renderer.js';
import type { Slide } from '../../types/deck.js';
import type { FormatGeometry, FormatKind } from '../../types/format.js';
import type { ExportResult, PdfMode } from '../../types/export.js';
import { FORMAT_REGISTRY, getFormat } from '../formats/format-registry.js';

// ── Defaults ─────────────────────────────────────────────────────

const DEFAULT_GEOMETRY: FormatGeometry = FORMAT_REGISTRY.slides_16_9.geometry;

export interface PdfExportOptions {
  mode?: PdfMode;
  /** Either a FormatKind or a fully-resolved geometry. */
  format?: FormatKind;
  geometry?: FormatGeometry;
}

// ── PDF Exporter ─────────────────────────────────────────────────

export class PdfExporter {
  constructor(
    private readonly renderer: SlideRenderer,
    private readonly pool: PlaywrightPool,
    private readonly logger: Logger,
    private readonly assetService?: AssetService,
  ) {}

  /**
   * Export slides as a PDF buffer.
   *
   * @param slides    Ordered array of slides.
   * @param deckTitle Used for the filename.
   * @param options   Export mode + page geometry. When geometry is omitted,
   *                  resolves from `format` via the registry; when both are
   *                  omitted, falls back to the slides_16_9 defaults.
   *                  `mode` defaults to `'image'` for slide formats and
   *                  `'direct'` for print formats (vector text, smaller files).
   */
  async export(
    slides: Slide[],
    deckTitle: string,
    options: PdfExportOptions = {},
  ): Promise<ExportResult> {
    const geometry =
      options.geometry ??
      (options.format ? getFormat(options.format).geometry : DEFAULT_GEOMETRY);
    const defaultMode: PdfMode = geometry.medium === 'print' ? 'direct' : 'image';
    const mode: PdfMode = options.mode ?? defaultMode;

    this.logger.info('Starting PDF export', {
      slideCount: slides.length,
      mode,
      geometry: { width: geometry.widthPx, height: geometry.heightPx, medium: geometry.medium },
    });

    const data =
      mode === 'direct'
        ? await this.exportDirect(slides, geometry)
        : await this.exportImage(slides, geometry);

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
  private async exportImage(slides: Slide[], geometry: FormatGeometry): Promise<Buffer> {
    const width = geometry.widthPx;
    const height = geometry.heightPx;

    // Render all slides to images first
    const images: Buffer[] = [];
    for (const slide of slides) {
      const result = await this.renderer.render(slide.html, slide.id, {
        width,
        height,
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
  @page { size: ${width}px ${height}px; margin: 0; }
  .page {
    width: ${width}px;
    height: ${height}px;
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

    return this.printToPdf(html, geometry);
  }

  // ── Direct Mode ──────────────────────────────────────────────

  /**
   * Combine all slide HTML into a single document with CSS
   * page breaks and use Playwright's page.pdf() directly.
   */
  private async exportDirect(slides: Slide[], geometry: FormatGeometry): Promise<Buffer> {
    const width = geometry.widthPx;
    const height = geometry.heightPx;

    const resolvedHtmls = this.assetService
      ? await Promise.all(slides.map((s) => resolveAssetRefs(s.html, this.assetService!)))
      : slides.map((s) => s.html);

    const extracted = resolvedHtmls.map((html) => this.extractSlideContent(html));

    const scopedStyles = extracted
      .map((slide, index) => slide.styles.map((style) => this.scopeCssToSlide(style, `slide-${index + 1}`)).join('\n'))
      .join('\n\n');

    const sections = extracted
      .map(
        (slide, index) =>
          `<section class="slide-page" id="slide-${index + 1}">${slide.body}</section>`,
      )
      .join('\n');

    const html = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: ${width}px ${height}px; margin: 0; }
  .slide-page {
    width: ${width}px;
    height: ${height}px;
    page-break-after: always;
    overflow: hidden;
    position: relative;
  }
  .slide-page:last-child { page-break-after: auto; }
</style>
<style>
${scopedStyles}
</style>
</head>
<body>
${sections}
</body>
</html>`;

    return this.printToPdf(html, geometry);
  }

  // ── Shared PDF Printing ──────────────────────────────────────

  /**
   * Load HTML into a Playwright page and print to PDF. Uses the
   * geometry's physical page (A4/Letter) when one is defined, so the
   * resulting PDF carries proper print dimensions; otherwise uses the
   * explicit pixel dimensions for screen-sized slide decks.
   */
  private async printToPdf(html: string, geometry: FormatGeometry): Promise<Buffer> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let page: any | null = null;

    try {
      page = await this.pool.getPage();

      await page.setViewportSize({
        width: geometry.widthPx,
        height: geometry.heightPx,
      });

      await page.setContent(html, { waitUntil: 'networkidle' });

      const pdfOptions: Record<string, unknown> = {
        printBackground: true,
        margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' },
      };

      if (geometry.physicalPage) {
        pdfOptions.format = geometry.physicalPage;
        pdfOptions.landscape = geometry.orientation === 'landscape';
      } else {
        pdfOptions.width = `${geometry.widthPx}px`;
        pdfOptions.height = `${geometry.heightPx}px`;
      }

      const pdfBuffer: Buffer = await page.pdf(pdfOptions);

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

  private extractSlideContent(html: string): { styles: string[]; body: string } {
    const styles: string[] = [];

    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let styleMatch: RegExpExecArray | null;
    while ((styleMatch = styleRegex.exec(html)) !== null) {
      styles.push(styleMatch[1]);
    }

    let body = html;
    const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
    if (bodyMatch) {
      body = bodyMatch[1];
    }

    body = body
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<!DOCTYPE[^>]*>/gi, '')
      .replace(/<\/?html[^>]*>/gi, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<\/?body[^>]*>/gi, '')
      .trim();

    return { styles, body };
  }

  private scopeCssToSlide(css: string, slideId: string): string {
    const result: string[] = [];
    let depth = 0;

    for (const line of css.split('\n')) {
      const trimmed = line.trim();
      const opens = (trimmed.match(/\{/g) || []).length;
      const closes = (trimmed.match(/\}/g) || []).length;

      if (depth === 0 && opens > 0 && !trimmed.startsWith('@')) {
        const braceIdx = trimmed.indexOf('{');
        const selectors = trimmed.substring(0, braceIdx);
        const rest = trimmed.substring(braceIdx);

        const scoped = selectors
          .split(',')
          .map((sel) => {
            const normalized = sel.trim();
            if (!normalized) return normalized;
            if (normalized === ':root') return `#${slideId}`;
            if (normalized === '*') return `#${slideId}, #${slideId} *`;
            return `#${slideId} ${normalized}`;
          })
          .join(', ');

        result.push(`${scoped} ${rest}`);
      } else {
        result.push(line);
      }

      depth += opens - closes;
    }

    return result.join('\n');
  }
}
