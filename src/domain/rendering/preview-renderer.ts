/**
 * Preview Renderer for Pengui Slides.
 *
 * Generates lightweight base64-encoded thumbnails suitable
 * for quick previews in the MCP client.
 */

import type { Logger } from '../../infrastructure/logger.js';
import type { SlideRenderer } from './slide-renderer.js';
import type {
  PreviewOptions,
  PreviewResult,
  RenderOptions,
} from '../../types/export.js';
import { DEFAULT_PREVIEW_OPTIONS } from '../../types/export.js';

// ── Types ────────────────────────────────────────────────────────

export interface PreviewInput {
  slideId: string;
  position: number;
  html: string;
}

// ── Preview Renderer ─────────────────────────────────────────────

export class PreviewRenderer {
  constructor(
    private readonly renderer: SlideRenderer,
    private readonly logger: Logger,
  ) {}

  /**
   * Render a single slide as a base64-encoded preview thumbnail.
   */
  async renderPreview(
    input: PreviewInput,
    options?: Partial<PreviewOptions>,
  ): Promise<PreviewResult> {
    const opts: PreviewOptions = { ...DEFAULT_PREVIEW_OPTIONS, ...options };

    const renderOptions: Partial<RenderOptions> = {
      width: opts.width,
      height: opts.height,
      deviceScaleFactor: 1,
      format: opts.format,
      ...(opts.quality !== undefined ? { quality: opts.quality } : {}),
    };

    const result = await this.renderer.render(
      input.html,
      input.slideId,
      renderOptions,
    );

    const imageBase64 = result.imageData.toString('base64');

    return {
      slideId: input.slideId,
      position: input.position,
      imageBase64,
      format: opts.format,
      width: opts.width,
      height: opts.height,
    };
  }

  /**
   * Render previews for multiple slides sequentially.
   *
   * Sequential rendering avoids overloading the browser with
   * too many concurrent pages and keeps memory usage predictable.
   */
  async renderPreviews(
    inputs: PreviewInput[],
    options?: Partial<PreviewOptions>,
  ): Promise<PreviewResult[]> {
    this.logger.info('Rendering previews', { slideCount: inputs.length });

    const results: PreviewResult[] = [];

    for (const input of inputs) {
      const preview = await this.renderPreview(input, options);
      results.push(preview);
    }

    this.logger.info('Previews rendered', { count: results.length });
    return results;
  }
}
