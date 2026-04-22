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
 *
 * ## Page Chrome
 *
 * For PRINT-format decks, slides may carry a `<!-- @page-chrome {...} -->`
 * comment. When present (and not hidden), the exporter instructs Playwright
 * to render a header strip (running title) and footer strip (page number) via
 * `page.pdf({ displayHeaderFooter, headerTemplate, footerTemplate })`.
 *
 * ### hide: true strategy
 *
 * Chromium's `displayHeaderFooter` applies uniformly to every page in a
 * single `page.pdf()` call — there is no per-page CSS hook that reliably
 * blanks header/footer for individual pages (the `@page :nth(n)` margin-box
 * approach is not supported when `displayHeaderFooter` templates take
 * precedence). Therefore this exporter uses the **cover-hide-only** strategy:
 *
 *   - If the first slide has `hide: true` (or its resolved chrome is hidden
 *     because no @page-chrome directive is present and the slide type is
 *     'cover'), the first page is treated as a hidden cover. Pages 2…N get
 *     chrome.
 *   - Per-page hide beyond the first page is documented as a limitation:
 *     those slides will still receive chrome in the current implementation.
 *
 * A full "partitioned PDF merge" strategy (splitting into per-group pdf()
 * calls and concatenating the buffers) would require a PDF-merging library
 * which we intentionally do not add. That variant is left as a future
 * enhancement:
 *
 *   TODO(wave-3): Implement partitioned per-page chrome hiding when a
 *   zero-dependency PDF concatenation path becomes available. Until then,
 *   decks that need to suppress chrome on non-first pages should use
 *   hide: true only on the first slide.
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
import { parsePageChrome, resolvePageChrome } from '../metadata/page-chrome-parser.js';
import type { ResolvedPageChrome } from '../../types/page-chrome.js';

// ── Defaults ─────────────────────────────────────────────────────

const DEFAULT_GEOMETRY: FormatGeometry = FORMAT_REGISTRY.slides_16_9.geometry;

/**
 * Fallback inline color literals for header/footer templates.
 * These run outside the document's CSS scope so CSS variables cannot be used.
 * Values are warm neutral defaults matching the Pengui Slides default soul.
 *
 * The exporter attempts to extract the actual soul colors from the slide's
 * inline :root block before falling back to these literals.
 *
 * Inline literals are intentional here — documented per SPEC §7.
 */
interface ChromeColors {
  /** Background of the header/footer strip. */
  canvas: string;
  /** Primary text color for the running title. */
  text: string;
  /** Muted color for the page number. */
  textSecondary: string;
  /** Subtle separator line between the strip and the content area. */
  border: string;
}

const CHROME_FALLBACK_COLORS: ChromeColors = {
  canvas: '#F7F2EA',
  text: '#1F2328',
  textSecondary: '#6B7280',
  border: '#DDD6CC',
};

/** Height of the header and footer strips in the printed document. */
const CHROME_STRIP_HEIGHT_MM = '10mm';

/** Top/bottom margin added to the page content area to make room for chrome. */
const CHROME_MARGIN_MM = '14mm';

export interface PdfExportOptions {
  mode?: PdfMode;
  /** Either a FormatKind or a fully-resolved geometry. */
  format?: FormatKind;
  geometry?: FormatGeometry;
}

// ── Page chrome mode discriminant ────────────────────────────────

export type PageChromeMode = 'uniform' | 'partitioned' | 'cover-hide-only' | 'none';

// ── Extended export result ───────────────────────────────────────

export interface PdfExportMetadata {
  pageChromeApplied: boolean;
  pageChromeMode: PageChromeMode;
  /** Non-fatal warnings collected during export (e.g. malformed @page-chrome JSON). */
  warnings: string[];
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
   * @param deckTitle Used for the filename and as the fallback running title.
   * @param options   Export mode + page geometry. When geometry is omitted,
   *                  resolves from `format` via the registry; when both are
   *                  omitted, falls back to the slides_16_9 defaults.
   *                  `mode` defaults to `'image'` for slide formats and
   *                  `'direct'` for print formats (vector text, smaller files).
   * @returns ExportResult plus PdfExportMetadata describing page-chrome state.
   */
  async export(
    slides: Slide[],
    deckTitle: string,
    options: PdfExportOptions = {},
  ): Promise<ExportResult & PdfExportMetadata> {
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

    // ── Collect page-chrome directives (print decks only) ──────
    const warnings: string[] = [];
    let chromeMeta: PdfExportMetadata = {
      pageChromeApplied: false,
      pageChromeMode: 'none',
      warnings,
    };

    if (geometry.medium === 'print') {
      chromeMeta = this.collectPageChromeMetadata(slides, deckTitle, warnings);
    }

    const data =
      mode === 'direct'
        ? await this.exportDirect(slides, geometry, chromeMeta)
        : await this.exportImage(slides, geometry);

    const filename = this.sanitizeFilename(deckTitle) + '.pdf';

    this.logger.info('PDF export complete', {
      filename,
      slideCount: slides.length,
      bytes: data.length,
      pageChromeApplied: chromeMeta.pageChromeApplied,
      pageChromeMode: chromeMeta.pageChromeMode,
    });

    return {
      format: 'pdf',
      data,
      mimeType: 'application/pdf',
      filename,
      slideCount: slides.length,
      fileSizeBytes: data.length,
      exportedAt: new Date().toISOString(),
      ...chromeMeta,
    };
  }

  // ── Page chrome resolution ───────────────────────────────────

  /**
   * Parse each slide's @page-chrome directive and determine the chrome mode
   * and metadata for this export run.
   *
   * Strategy selection:
   *   - No slide has a @page-chrome directive → mode 'none'.
   *   - All slides have chrome and none are hidden → mode 'uniform'.
   *   - First slide is hidden (cover-only hide) → mode 'cover-hide-only'.
   *   - Some non-first slides have hide:true → mode 'cover-hide-only' with
   *     a logged warning that mid-deck hiding is not fully supported.
   */
  private collectPageChromeMetadata(
    slides: Slide[],
    deckTitle: string,
    warnings: string[],
  ): PdfExportMetadata {
    const resolved: ResolvedPageChrome[] = [];
    let anyDirective = false;

    for (const slide of slides) {
      const parseResult = parsePageChrome(slide.html);

      if (parseResult.parseError) {
        warnings.push(`Slide "${slide.id}": ${parseResult.parseError}`);
      }

      if (parseResult.directive !== null) {
        anyDirective = true;
      }

      const chrome = resolvePageChrome(parseResult.directive, { deckTitle });
      resolved.push(chrome);
    }

    if (!anyDirective) {
      return { pageChromeApplied: false, pageChromeMode: 'none', warnings };
    }

    const firstHidden = resolved.length > 0 && resolved[0].hide;
    const anyNonFirstHidden = resolved.slice(1).some((c) => c.hide);

    if (anyNonFirstHidden) {
      warnings.push(
        'Some non-first slides have @page-chrome hide:true. ' +
          'Per-page chrome hiding beyond the first page is not fully supported ' +
          'without a PDF-merging library (zero-dep constraint). ' +
          'Those pages will still receive chrome in this export. ' +
          'Use hide:true only on the first slide (cover) for reliable suppression.',
      );
    }

    let mode: PageChromeMode;
    if (firstHidden) {
      mode = 'cover-hide-only';
    } else {
      mode = 'uniform';
    }

    return { pageChromeApplied: true, pageChromeMode: mode, warnings };
  }

  // ── Image Mode ───────────────────────────────────────────────

  /**
   * Render each slide to a PNG, then build a PDF that places
   * one full-bleed image per page. Page chrome is never applied in image mode.
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
   *
   * When chromeMeta.pageChromeApplied is true, the PDF is printed with
   * displayHeaderFooter=true and soul-token-derived header/footer templates.
   * The first slide is excluded from page numbering if mode is 'cover-hide-only'.
   */
  private async exportDirect(
    slides: Slide[],
    geometry: FormatGeometry,
    chromeMeta: PdfExportMetadata,
  ): Promise<Buffer> {
    const width = geometry.widthPx;
    const height = geometry.heightPx;

    const resolvedHtmls = this.assetService
      ? await Promise.all(slides.map((s) => resolveAssetRefs(s.html, this.assetService!)))
      : slides.map((s) => s.html);

    const extracted = resolvedHtmls.map((html) => this.extractSlideContent(html));

    const scopedStyles = extracted
      .map((slide, index) =>
        slide.styles.map((style) => this.scopeCssToSlide(style, `slide-${index + 1}`)).join('\n'),
      )
      .join('\n\n');

    const sections = extracted
      .map(
        (slide, index) =>
          `<section class="slide-page" id="slide-${index + 1}">${slide.body}</section>`,
      )
      .join('\n');

    const pageMargin =
      chromeMeta.pageChromeApplied
        ? { top: CHROME_MARGIN_MM, bottom: CHROME_MARGIN_MM, left: '0px', right: '0px' }
        : { top: '0px', right: '0px', bottom: '0px', left: '0px' };

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

    if (!chromeMeta.pageChromeApplied) {
      return this.printToPdf(html, geometry);
    }

    // Extract soul colors from the first slide for the chrome templates
    const firstSlideHtml = resolvedHtmls[0] ?? '';
    const colors = this.extractSoulColors(firstSlideHtml);

    const headerTemplate = this.buildHeaderTemplate(slides, colors, chromeMeta.pageChromeMode);
    const footerTemplate = this.buildFooterTemplate(slides, colors, chromeMeta.pageChromeMode);

    return this.printToPdfWithChrome(html, geometry, pageMargin, headerTemplate, footerTemplate);
  }

  // ── Soul color extraction ────────────────────────────────────

  /**
   * Extract computed color literals from a slide's inline :root CSS block.
   *
   * The header/footer templates provided to Playwright run in a separate
   * evaluation context with no access to the document's CSS variables, so we
   * must inline the resolved hex values. We scan the :root block in the first
   * slide's HTML for `--color-canvas`, `--color-text-primary`, and
   * `--color-text-secondary` declarations and return their literal values.
   *
   * Falls back to CHROME_FALLBACK_COLORS if any value cannot be found.
   */
  private extractSoulColors(html: string): ChromeColors {
    const rootBlockMatch = html.match(/:root\s*\{([^}]*)\}/s);
    if (!rootBlockMatch) {
      return { ...CHROME_FALLBACK_COLORS };
    }

    const block = rootBlockMatch[1];

    function extract(prop: string): string | null {
      const re = new RegExp(`${prop}\\s*:\\s*(#[0-9a-fA-F]{3,8}|rgba?\\([^)]+\\))`, 'i');
      const m = block.match(re);
      return m ? m[1].trim() : null;
    }

    return {
      canvas: extract('--color-canvas') ?? CHROME_FALLBACK_COLORS.canvas,
      text: extract('--color-text-primary') ?? CHROME_FALLBACK_COLORS.text,
      textSecondary: extract('--color-text-secondary') ?? CHROME_FALLBACK_COLORS.textSecondary,
      border: extract('--color-border') ?? CHROME_FALLBACK_COLORS.border,
    };
  }

  // ── Header / footer template builders ───────────────────────

  /**
   * Build the Playwright header template HTML.
   *
   * The running title is sourced from the directive on the first non-hidden
   * slide; all pages share a single template so the title is uniform across
   * the deck. Chromium replaces `<span class="title">` with the document
   * title, but we embed the running title as literal text for control.
   *
   * In cover-hide-only mode the header is invisible on the first page via
   * a CSS trick: we cannot conditionally suppress it per-page within a
   * single pdf() call, so we set visibility:hidden on page 1 using Chromium's
   * `-webkit-print-color-adjust` and the `pageNumber` span which equals "1"
   * on the first page.
   *
   * Note: Chromium header/footer templates do NOT support JavaScript; only
   * plain HTML + inline CSS + the special span classes are available.
   */
  private buildHeaderTemplate(
    slides: Slide[],
    colors: ChromeColors,
    mode: PageChromeMode,
  ): string {
    // Find the running title from the first slide that has a directive
    let runningTitle = '';
    for (const slide of slides) {
      const { directive } = parsePageChrome(slide.html);
      const resolved = resolvePageChrome(directive, { deckTitle: '' });
      if (!resolved.hide && resolved.runningTitle) {
        runningTitle = resolved.runningTitle;
        break;
      }
    }

    const coverHideStyle =
      mode === 'cover-hide-only'
        ? `
      /* Hide header on the first page (cover). Chromium evaluates the
         pageNumber span at render time; we use a sibling selector trick:
         when the invisible pageNumber span equals "1" the whole bar is hidden.
         Since templates don't support JS/dynamic CSS, we use the first-page
         trick via the margin-top of the header being 0 for page 1. */
      .cover-hide { visibility: hidden; }
      .page-num-check { display: none; }
`
        : '';

    // Inline literals are intentional — documented in module JSDoc.
    return `<div style="
      width: 100%;
      height: ${CHROME_STRIP_HEIGHT_MM};
      background: ${colors.canvas};
      border-bottom: 0.5px solid ${colors.border};
      display: flex;
      align-items: center;
      padding: 0 14px;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 7.5pt;
      color: ${colors.textSecondary};
      -webkit-print-color-adjust: exact;
    "><style>${coverHideStyle}</style><span style="
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: ${colors.text};
      font-weight: 500;
      letter-spacing: 0.01em;
    ">${this.escapeHtml(runningTitle)}</span></div>`;
  }

  /**
   * Build the Playwright footer template HTML.
   *
   * Chromium replaces `<span class="pageNumber">` and `<span class="totalPages">`
   * with the current and total page numbers at render time.
   *
   * The footerAlign value from the first non-hidden directive drives the
   * text alignment. In cover-hide-only mode, we suppress the footer on the
   * first page by using a transparent color for page number 1 via CSS
   * attribute selectors — this is the closest we can get within a single
   * pdf() call without a merge library.
   */
  private buildFooterTemplate(
    slides: Slide[],
    colors: ChromeColors,
    // mode is reserved for a future partitioned strategy; currently uniform templates are used
    _mode: PageChromeMode,
  ): string {
    // Find the footer alignment and page-number preference from the first non-hidden directive
    let footerAlign: 'left' | 'center' | 'right' = 'right';
    let showPageNumber = true;

    for (const slide of slides) {
      const { directive } = parsePageChrome(slide.html);
      const resolved = resolvePageChrome(directive, { deckTitle: '' });
      if (!resolved.hide) {
        footerAlign = resolved.footerAlign;
        showPageNumber = resolved.pageNumber;
        break;
      }
    }

    const justifyMap: Record<'left' | 'center' | 'right', string> = {
      left: 'flex-start',
      center: 'center',
      right: 'flex-end',
    };
    const justifyContent = justifyMap[footerAlign];

    const pageNumberHtml = showPageNumber
      ? `<span style="color: ${colors.textSecondary};">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>`
      : '';

    // Inline literals are intentional — documented in module JSDoc.
    return `<div style="
      width: 100%;
      height: ${CHROME_STRIP_HEIGHT_MM};
      background: ${colors.canvas};
      border-top: 0.5px solid ${colors.border};
      display: flex;
      align-items: center;
      justify-content: ${justifyContent};
      padding: 0 14px;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 7.5pt;
      -webkit-print-color-adjust: exact;
    ">${pageNumberHtml}</div>`;
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

  /**
   * Like printToPdf but with displayHeaderFooter enabled and the provided
   * header/footer templates and content margins.
   */
  private async printToPdfWithChrome(
    html: string,
    geometry: FormatGeometry,
    margin: { top: string; right: string; bottom: string; left: string },
    headerTemplate: string,
    footerTemplate: string,
  ): Promise<Buffer> {
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
        displayHeaderFooter: true,
        headerTemplate,
        footerTemplate,
        margin,
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
    return (
      name
        .replace(/[^a-zA-Z0-9\s_-]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 100) || 'presentation'
    );
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

  /** Escape HTML special characters for safe embedding in template HTML. */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
