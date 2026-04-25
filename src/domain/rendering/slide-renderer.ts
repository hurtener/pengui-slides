/**
 * Slide Renderer for Pengui Slides.
 *
 * Renders a single HTML slide to a screenshot buffer using
 * a Playwright page obtained from the pool.
 */

import type { Logger } from '../../infrastructure/logger.js';
import type { AssetService } from '../assets/asset-service.js';
import { resolveAssetRefs } from '../assets/asset-resolver.js';
import { applyDefensiveDefaults } from '../validation/stage0/defensive-injector.js';
import type { PlaywrightPool } from './playwright-pool.js';
import { sha256 } from '../../infrastructure/hash.js';
import type {
  RenderOptions,
  SlideRenderResult,
  ImageFormat,
} from '../../types/export.js';
import { DEFAULT_RENDER_OPTIONS } from '../../types/export.js';

// ── Slide Renderer ───────────────────────────────────────────────

export class SlideRenderer {
  private readonly cache = new Map<string, Omit<SlideRenderResult, 'slideId' | 'renderTimeMs'>>();
  private readonly maxCacheEntries = 200;

  constructor(
    private readonly pool: PlaywrightPool,
    private readonly logger: Logger,
    private readonly assetService?: AssetService,
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

      // Apply Stage 0 defensive defaults and resolve asset://ID refs
      // before rendering. Idempotent if the slide already carries the
      // defensive prelude.
      const defended = applyDefensiveDefaults(html).html;
      const resolved = this.assetService
        ? await resolveAssetRefs(defended, this.assetService)
        : defended;

      const cacheKey = this.buildCacheKey(resolved, opts);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.cache.delete(cacheKey);
        this.cache.set(cacheKey, cached);

        return {
          slideId,
          imageData: Buffer.from(cached.imageData),
          format: cached.format,
          width: cached.width,
          height: cached.height,
          renderTimeMs: Math.round(performance.now() - start),
        };
      }

      await page.setContent(resolved, { waitUntil: 'load' });
      await page.evaluate(() => {
        return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      });

      const screenshotOptions: Record<string, unknown> = {
        type: opts.format,
        fullPage: opts.fullPage === true,
      };

      if (opts.format === 'jpeg' && opts.quality !== undefined) {
        screenshotOptions.quality = opts.quality;
      }

      const imageData: Buffer = await page.screenshot(screenshotOptions);

      // For fullPage screenshots the captured height equals
      // documentElement.scrollHeight (× deviceScaleFactor), which can
      // far exceed the viewport — query it back so the result reports
      // accurate dimensions. Falls back to opts.height on the
      // non-fullPage path.
      let actualHeight = opts.height;
      if (opts.fullPage === true) {
        actualHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      }

      const renderTimeMs = Math.round(performance.now() - start);

      this.logger.debug('Slide rendered', {
        slideId,
        renderTimeMs,
        bytes: imageData.length,
      });

      this.cache.set(cacheKey, {
        imageData: Buffer.from(imageData),
        format: opts.format as ImageFormat,
        width: opts.width,
        height: actualHeight,
      });
      this.trimCache();

      return {
        slideId,
        imageData,
        format: opts.format as ImageFormat,
        width: opts.width,
        height: actualHeight,
        renderTimeMs,
      };
    } finally {
      if (page) {
        await this.pool.releasePage(page);
      }
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  private buildCacheKey(html: string, options: RenderOptions): string {
    return sha256(JSON.stringify({
      html,
      width: options.width,
      height: options.height,
      format: options.format,
      quality: options.quality ?? null,
      deviceScaleFactor: options.deviceScaleFactor,
      fullPage: options.fullPage === true,
    }));
  }

  private trimCache(): void {
    while (this.cache.size > this.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;
      this.cache.delete(oldestKey);
    }
  }
}
