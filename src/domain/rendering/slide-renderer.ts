/**
 * Slide Renderer for Pengui Slides.
 *
 * Renders a single HTML slide to a screenshot buffer using
 * a Playwright page obtained from the pool.
 */

import type { Logger } from '../../infrastructure/logger.js';
import type { PlaywrightPool } from './playwright-pool.js';
import type {
  RenderOptions,
  SlideRenderResult,
  ImageFormat,
} from '../../types/export.js';
import { DEFAULT_RENDER_OPTIONS } from '../../types/export.js';

// ── Slide Renderer ───────────────────────────────────────────────

export class SlideRenderer {
  constructor(
    private readonly pool: PlaywrightPool,
    private readonly logger: Logger,
  ) {}

  /**
   * Render an HTML slide to a screenshot image.
   *
   * @param html     Full HTML string for the slide (including <html>/<body>).
   * @param slideId  Identifier attached to the result for tracking.
   * @param options  Partial render options merged with defaults.
   * @returns        A SlideRenderResult with image data, dimensions, and timing.
   */
  async render(
    html: string,
    slideId: string,
    options?: Partial<RenderOptions>,
  ): Promise<SlideRenderResult> {
    const opts: RenderOptions = { ...DEFAULT_RENDER_OPTIONS, ...options };
    const start = performance.now();

    this.logger.debug('Rendering slide', {
      slideId,
      width: opts.width,
      height: opts.height,
      format: opts.format,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let page: any | null = null;

    try {
      page = await this.pool.getPage();

      await page.setViewportSize({
        width: opts.width,
        height: opts.height,
      });

      await page.setContent(html, { waitUntil: 'networkidle' });

      const screenshotOptions: Record<string, unknown> = {
        type: opts.format,
        fullPage: false,
      };

      if (opts.format === 'jpeg' && opts.quality !== undefined) {
        screenshotOptions.quality = opts.quality;
      }

      const imageData: Buffer = await page.screenshot(screenshotOptions);

      const renderTimeMs = Math.round(performance.now() - start);

      this.logger.debug('Slide rendered', {
        slideId,
        renderTimeMs,
        bytes: imageData.length,
      });

      return {
        slideId,
        imageData,
        format: opts.format as ImageFormat,
        width: opts.width,
        height: opts.height,
        renderTimeMs,
      };
    } finally {
      if (page) {
        await this.pool.releasePage(page);
      }
    }
  }
}
