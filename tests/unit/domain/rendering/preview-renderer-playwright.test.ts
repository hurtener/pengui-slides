/**
 * Tests for PreviewRenderer.
 *
 * Verifies that:
 * - Preview renders produce valid base64 output
 * - Different slides produce visually different previews
 * - Preview dimensions are reported correctly
 * - Rendering at native resolution prevents blank/identical thumbnails
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PreviewRenderer } from '../../../../src/domain/rendering/preview-renderer.js';
import type { PreviewInput } from '../../../../src/domain/rendering/preview-renderer.js';
import { SlideRenderer } from '../../../../src/domain/rendering/slide-renderer.js';
import { PlaywrightPool } from '../../../../src/domain/rendering/playwright-pool.js';
import { Logger } from '../../../../src/infrastructure/logger.js';

// ── Helpers ──────────────────────────────────────────────────────────

function makeSlideHtml(options: {
  bgColor?: string;
  title?: string;
  body?: string;
}): string {
  const bg = options.bgColor ?? '#ffffff';
  const title = options.title ?? 'Slide Title';
  const body = options.body ?? '';
  return `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1920px;
    height: 1080px;
    background: ${bg};
    font-family: sans-serif;
    overflow: hidden;
  }
  .slide-container {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px;
  }
  h1 {
    font-size: 64px;
    color: #1a1a2e;
    margin-bottom: 24px;
  }
  p {
    font-size: 32px;
    color: #333;
  }
</style>
</head>
<body>
  <div class="slide-container">
    <h1>${title}</h1>
    ${body ? `<p>${body}</p>` : ''}
  </div>
</body>
</html>`;
}

function getPngDimensions(buffer: Buffer): { width: number; height: number } {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

// ── Test Suite ────────────────────────────────────────────────────────

describe('PreviewRenderer', () => {
  let pool: PlaywrightPool;
  let slideRenderer: SlideRenderer;
  let previewRenderer: PreviewRenderer;

  beforeAll(() => {
    pool = new PlaywrightPool({ headless: true, maxPoolSize: 2 });
    const logger = new Logger('test:preview-renderer', 'error');
    slideRenderer = new SlideRenderer(pool, logger.child('slide'));
    previewRenderer = new PreviewRenderer(slideRenderer, logger.child('preview'));
  });

  afterAll(async () => {
    await pool.shutdown();
  }, 20000);

  it('should produce valid base64 output', async () => {
    const input: PreviewInput = {
      slideId: 'preview-1',
      position: 0,
      html: makeSlideHtml({ title: 'Preview Test' }),
    };

    const result = await previewRenderer.renderPreview(input);

    expect(result.slideId).toBe('preview-1');
    expect(result.position).toBe(0);
    expect(result.format).toBe('png');
    expect(result.imageBase64).toBeTruthy();
    expect(result.imageBase64.length).toBeGreaterThan(0);

    // Verify it is valid base64 by decoding it
    const buffer = Buffer.from(result.imageBase64, 'base64');
    expect(buffer.length).toBeGreaterThan(0);
  }, 10000);

  it('should report the requested preview dimensions', async () => {
    const input: PreviewInput = {
      slideId: 'dims-preview',
      position: 1,
      html: makeSlideHtml({ title: 'Dimensions' }),
    };

    const result = await previewRenderer.renderPreview(input, {
      width: 480,
      height: 270,
    });

    expect(result.width).toBe(480);
    expect(result.height).toBe(270);

    const buffer = Buffer.from(result.imageBase64, 'base64');
    expect(getPngDimensions(buffer)).toEqual({ width: 480, height: 270 });
  });

  it('should produce different previews for different slides', async () => {
    const inputs: PreviewInput[] = [
      {
        slideId: 'slide-a',
        position: 0,
        html: makeSlideHtml({
          bgColor: '#e74c3c',
          title: 'Red Slide',
          body: 'This is a red slide with unique content.',
        }),
      },
      {
        slideId: 'slide-b',
        position: 1,
        html: makeSlideHtml({
          bgColor: '#3498db',
          title: 'Blue Slide',
          body: 'This is a blue slide with different content.',
        }),
      },
      {
        slideId: 'slide-c',
        position: 2,
        html: makeSlideHtml({
          bgColor: '#2ecc71',
          title: 'Green Slide',
          body: 'This is a green slide, also unique.',
        }),
      },
    ];

    const results = await previewRenderer.renderPreviews(inputs);

    expect(results).toHaveLength(3);

    // All three previews must be different from each other
    const base64Values = results.map((r) => r.imageBase64);
    const uniqueValues = new Set(base64Values);
    expect(uniqueValues.size).toBe(3);
  });

  it('should produce a non-blank preview (not a minimal image)', async () => {
    const input: PreviewInput = {
      slideId: 'non-blank',
      position: 0,
      html: makeSlideHtml({
        bgColor: '#2c3e50',
        title: 'Dark Background',
        body: 'Content should render properly at native resolution.',
      }),
    };

    const result = await previewRenderer.renderPreview(input);

    const buffer = Buffer.from(result.imageBase64, 'base64');
    expect(buffer.length).toBeGreaterThan(500);
  });

  it('should render previews with CSS custom properties correctly', async () => {
    const htmlWithCssVars = `<!DOCTYPE html>
<html>
<head>
<style>
  :root {
    --bg: #1a1a2e;
    --accent: #e94560;
    --text: #eaeaea;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1920px;
    height: 1080px;
    background: var(--bg);
    overflow: hidden;
  }
  .slide {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  h1 {
    font-size: 72px;
    color: var(--accent);
  }
  p {
    font-size: 36px;
    color: var(--text);
    margin-top: 20px;
  }
</style>
</head>
<body>
  <div class="slide">
    <h1>CSS Variables</h1>
    <p>Preview should capture styled content</p>
  </div>
</body>
</html>`;

    const input: PreviewInput = {
      slideId: 'css-vars-preview',
      position: 0,
      html: htmlWithCssVars,
    };

    const result = await previewRenderer.renderPreview(input);

    const buffer = Buffer.from(result.imageBase64, 'base64');
    expect(buffer.length).toBeGreaterThan(500);
  });

  it('should handle multiple sequential previews correctly', async () => {
    const inputs: PreviewInput[] = Array.from({ length: 5 }, (_, i) => ({
      slideId: `seq-${i}`,
      position: i,
      html: makeSlideHtml({
        bgColor: `hsl(${i * 72}, 70%, 50%)`,
        title: `Sequential Slide ${i + 1}`,
        body: `Unique body content for slide number ${i + 1}.`,
      }),
    }));

    const results = await previewRenderer.renderPreviews(inputs);

    expect(results).toHaveLength(5);

    // Each result should have the correct position
    results.forEach((r, i) => {
      expect(r.slideId).toBe(`seq-${i}`);
      expect(r.position).toBe(i);
    });

    // All 5 should be unique (the original bug had all identical)
    const base64Set = new Set(results.map((r) => r.imageBase64));
    expect(base64Set.size).toBe(5);
  });
});
