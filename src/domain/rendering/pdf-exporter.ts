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
 * comment. When present (and not hidden), the exporter renders a header
 * strip (running title) and footer strip (page number) AS HTML inside the
 * composite document — absolutely positioned within each `.slide-page`
 * section, in the safe-area band. Playwright's `displayHeaderFooter`
 * mechanism is intentionally not used because it reserves PDF page margin
 * space that conflicts with our full-A4-sized `.slide-page` container,
 * causing content to be clipped at the top and chrome to overlap content.
 *
 * Because chrome is per-section HTML, per-page `hide: true` is fully
 * supported. Each slide's chrome (or absence) is independent. Page
 * numbers are computed at composite-build time using each slide's index
 * and the deck's total page count — Chromium's template substitution
 * (`<span class="pageNumber">`) is not used.
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

/**
 * Geometry of the running header / footer strips. Each strip sits
 * inside the slide's safe-area padding band (96px on A4) so it never
 * overlaps authored content.
 *
 * - PAGE_INSET_PX: vertical distance from the physical page edge. Real
 *   printed documents inset chrome ~10mm so it doesn't feel cramped.
 * - STRIP_HEIGHT_PX: height of the chrome strip itself.
 * - HORIZONTAL_INSET_PX: matches the deck's safe-area inset so the
 *   running title and page number align visually with body content.
 */
const CHROME_PAGE_INSET_PX = 48;
const CHROME_STRIP_HEIGHT_PX = 24;
const CHROME_HORIZONTAL_INSET_PX = 96;

export interface PdfExportOptions {
  mode?: PdfMode;
  /** Either a FormatKind or a fully-resolved geometry. */
  format?: FormatKind;
  geometry?: FormatGeometry;
}

// ── Page chrome mode discriminant ────────────────────────────────

/**
 * Describes how page-chrome was applied across the deck:
 *   - 'none'           — no slide had a directive
 *   - 'uniform'        — every slide gets chrome (no hides)
 *   - 'mixed'          — chrome is applied per slide; some pages opt out via hide:true
 *   - 'cover-hide-only'— retained for backward compatibility; same as 'mixed'
 *                        when only the first page is hidden
 */
export type PageChromeMode = 'uniform' | 'mixed' | 'cover-hide-only' | 'none';

// ── Extended export result ───────────────────────────────────────

export interface PdfExportMetadata {
  pageChromeApplied: boolean;
  pageChromeMode: PageChromeMode;
  /** Non-fatal warnings collected during export (e.g. malformed @page-chrome JSON). */
  warnings: string[];
}

interface ChromePlan {
  pageChromeApplied: boolean;
  pageChromeMode: PageChromeMode;
  warnings: string[];
  /** Per-slide resolved chrome (parallel to slides[]); used to render section chrome. */
  perSlide: ResolvedPageChrome[];
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
    let chromePlan: ChromePlan = {
      pageChromeApplied: false,
      pageChromeMode: 'none',
      warnings,
      perSlide: slides.map(() => ({
        runningTitle: deckTitle,
        pageNumber: false,
        footerAlign: 'right' as const,
        hide: true,
      })),
    };

    if (geometry.medium === 'print') {
      chromePlan = this.buildChromePlan(slides, deckTitle, warnings);
    }

    const chromeMeta: PdfExportMetadata = {
      pageChromeApplied: chromePlan.pageChromeApplied,
      pageChromeMode: chromePlan.pageChromeMode,
      warnings: chromePlan.warnings,
    };

    const data =
      mode === 'direct'
        ? await this.exportDirect(slides, geometry, chromePlan)
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
   * Parse each slide's @page-chrome directive and build a per-slide chrome
   * plan used at composite-build time.
   * and metadata for this export run.
   *
   * Strategy:
   *   - No slide has a @page-chrome directive → mode 'none'.
   *   - All slides have chrome and none are hidden → mode 'uniform'.
   *   - Mix of chromed and hidden pages → mode 'mixed' (or 'cover-hide-only'
   *     when only the first page is hidden, for back-compat reporting).
   *
   * Per-page hide is fully supported because chrome is rendered as HTML
   * within each section (not via Playwright's deck-wide displayHeaderFooter).
   */
  private buildChromePlan(
    slides: Slide[],
    deckTitle: string,
    warnings: string[],
  ): ChromePlan {
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
      return {
        pageChromeApplied: false,
        pageChromeMode: 'none',
        warnings,
        perSlide: resolved,
      };
    }

    const visibleCount = resolved.filter((c) => !c.hide).length;
    const hiddenCount = resolved.length - visibleCount;
    const firstHidden = resolved.length > 0 && resolved[0].hide;
    const onlyFirstHidden = firstHidden && hiddenCount === 1;

    let mode: PageChromeMode;
    if (hiddenCount === 0) {
      mode = 'uniform';
    } else if (onlyFirstHidden) {
      mode = 'cover-hide-only';
    } else {
      mode = 'mixed';
    }

    return {
      pageChromeApplied: visibleCount > 0,
      pageChromeMode: mode,
      warnings,
      perSlide: resolved,
    };
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
   * Combine all slide HTML into a single document with CSS page breaks
   * and use Playwright's page.pdf() directly.
   *
   * When chromePlan.pageChromeApplied is true, each section receives a
   * header strip (running title) and/or footer strip (page number) as
   * absolutely-positioned HTML inside the safe-area band of that page.
   * Page numbering counts only non-hidden pages so the cover/TOC don't
   * occupy "Page 1" — common print convention.
   */
  private async exportDirect(
    slides: Slide[],
    geometry: FormatGeometry,
    chromePlan: ChromePlan,
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

    // Compute page numbers (counting only non-hidden pages so the cover/TOC
    // don't occupy "Page 1" — matches typical print conventions).
    const pageNumbers: number[] = new Array(slides.length).fill(0);
    let runningPageNumber = 0;
    let visiblePageTotal = 0;
    for (let i = 0; i < slides.length; i++) {
      if (!chromePlan.perSlide[i].hide) {
        runningPageNumber += 1;
        pageNumbers[i] = runningPageNumber;
        visiblePageTotal = runningPageNumber;
      }
    }

    // Extract soul colors once from the first slide for chrome styling
    const colors = chromePlan.pageChromeApplied
      ? this.extractSoulColors(resolvedHtmls[0] ?? '')
      : CHROME_FALLBACK_COLORS;

    const sections = extracted
      .map((slide, index) => {
        const chrome = chromePlan.perSlide[index];
        const chromeHtml =
          chromePlan.pageChromeApplied && !chrome.hide
            ? this.buildSectionChromeHtml(chrome, pageNumbers[index], visiblePageTotal, colors)
            : '';
        return `<section class="slide-page" id="slide-${index + 1}">${chromeHtml}${slide.body}</section>`;
      })
      .join('\n');

    const chromeCss = chromePlan.pageChromeApplied
      ? `
  .pengui-chrome-header,
  .pengui-chrome-footer {
    position: absolute;
    left: ${CHROME_HORIZONTAL_INSET_PX}px;
    right: ${CHROME_HORIZONTAL_INSET_PX}px;
    height: ${CHROME_STRIP_HEIGHT_PX}px;
    display: flex;
    align-items: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 8.5pt;
    line-height: 1;
    z-index: 10;
    pointer-events: none;
  }
  .pengui-chrome-header { top: ${CHROME_PAGE_INSET_PX}px; }
  .pengui-chrome-footer { bottom: ${CHROME_PAGE_INSET_PX}px; }
  .pengui-chrome-running-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-weight: 500;
  }
  .pengui-chrome-page-number {
    letter-spacing: 0.04em;
    font-variant-numeric: tabular-nums;
  }
`
      : '';

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
  .slide-page:last-child { page-break-after: auto; }${chromeCss}
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

  // ── Section chrome builder ───────────────────────────────────

  /**
   * Build the per-section header + footer chrome HTML for a single page.
   *
   * The chrome strips are absolutely positioned within the `.slide-page`
   * section in the safe-area band (top 0–CHROME_STRIP_HEIGHT_PX,
   * bottom HEIGHT-CHROME_STRIP_HEIGHT_PX–HEIGHT). Slide content uses the
   * deck's safe-area padding (96px on A4) so it never overlaps.
   *
   * Page numbers are pre-resolved at composite-build time — Chromium's
   * `<span class="pageNumber">` template substitution is not used.
   */
  private buildSectionChromeHtml(
    chrome: ResolvedPageChrome,
    pageNumber: number,
    totalPages: number,
    colors: ChromeColors,
  ): string {
    const justifyMap: Record<'left' | 'center' | 'right', string> = {
      left: 'flex-start',
      center: 'center',
      right: 'flex-end',
    };
    const footerJustify = justifyMap[chrome.footerAlign];

    const headerHtml = chrome.runningTitle
      ? `<div class="pengui-chrome-header" style="color: ${colors.textSecondary}; border-bottom: 0.5px solid ${colors.border}; padding-bottom: 8px;"><span class="pengui-chrome-running-title">${this.escapeHtml(chrome.runningTitle)}</span></div>`
      : '';

    const footerHtml = chrome.pageNumber
      ? `<div class="pengui-chrome-footer" style="color: ${colors.textSecondary}; border-top: 0.5px solid ${colors.border}; padding-top: 8px; justify-content: ${footerJustify};"><span class="pengui-chrome-page-number">${pageNumber} / ${totalPages}</span></div>`
      : '';

    return headerHtml + footerHtml;
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
