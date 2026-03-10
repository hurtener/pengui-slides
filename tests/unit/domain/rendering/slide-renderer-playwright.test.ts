/**
 * Tests for SlideRenderer.
 *
 * Uses actual Playwright to verify that:
 * - Rendering produces a non-empty image buffer
 * - Different HTML inputs produce different screenshots
 * - Viewport dimensions are applied correctly
 * - CSS is fully resolved before the screenshot is taken
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

// ── Test Suite ────────────────────────────────────────────────────────

describe('SlideRenderer', () => {
  let pool: PlaywrightPool;
  let renderer: SlideRenderer;

  beforeAll(() => {
    pool = new PlaywrightPool({ headless: true, maxPoolSize: 2 });
    const logger = new Logger('test:slide-renderer', 'error');
    renderer = new SlideRenderer(pool, logger);
  });

  afterAll(async () => {
    await pool.shutdown();
  }, 20000);

  it('should produce a non-empty image buffer', async () => {
    const html = makeSlideHtml({ title: 'Hello World' });
    const result = await renderer.render(html, 'slide-1');

    expect(result.imageData).toBeInstanceOf(Buffer);
    expect(result.imageData.length).toBeGreaterThan(0);
    expect(result.slideId).toBe('slide-1');
    expect(result.format).toBe('png');
    expect(result.renderTimeMs).toBeGreaterThanOrEqual(0);
  }, 10000);

  it('should render at the requested viewport dimensions', async () => {
    const html = makeSlideHtml({ title: 'Dimensions Test' });
    const result = await renderer.render(html, 'slide-dims', {
      width: 1920,
      height: 1080,
    });

    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    // A 1920x1080 PNG screenshot should be significantly larger
    // than a tiny blank image (the old bug produced ~1356 bytes)
    expect(result.imageData.length).toBeGreaterThan(2000);
  });

  it('should produce different images for different HTML inputs', async () => {
    const redSlide = makeSlideHtml({
      bgColor: '#ff0000',
      title: 'Red Slide',
      body: 'This slide has a red background.',
    });
    const blueSlide = makeSlideHtml({
      bgColor: '#0000ff',
      title: 'Blue Slide',
      body: 'This slide has a blue background.',
    });

    const [resultRed, resultBlue] = await Promise.all([
      renderer.render(redSlide, 'red'),
      renderer.render(blueSlide, 'blue'),
    ]);

    // Both should be non-empty
    expect(resultRed.imageData.length).toBeGreaterThan(0);
    expect(resultBlue.imageData.length).toBeGreaterThan(0);

    // They must not be identical
    const redBase64 = resultRed.imageData.toString('base64');
    const blueBase64 = resultBlue.imageData.toString('base64');
    expect(redBase64).not.toBe(blueBase64);
  });

  it('should properly render CSS custom properties', async () => {
    const html = `<!DOCTYPE html>
<html>
<head>
<style>
  :root {
    --primary-color: #e74c3c;
    --slide-bg: #2c3e50;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1920px;
    height: 1080px;
    background: var(--slide-bg);
    overflow: hidden;
  }
  .content {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  h1 {
    font-size: 80px;
    color: var(--primary-color);
  }
</style>
</head>
<body>
  <div class="content">
    <h1>CSS Custom Properties</h1>
  </div>
</body>
</html>`;

    const result = await renderer.render(html, 'css-vars', {
      width: 1920,
      height: 1080,
    });

    // A properly rendered slide with a dark background and red text
    // should produce a substantially sized image (not blank)
    expect(result.imageData.length).toBeGreaterThan(2000);
  });

  it('should support JPEG format with quality', async () => {
    const html = makeSlideHtml({ title: 'JPEG Test', bgColor: '#f0f0f0' });
    const result = await renderer.render(html, 'jpeg-test', {
      format: 'jpeg',
      quality: 80,
    });

    expect(result.format).toBe('jpeg');
    expect(result.imageData.length).toBeGreaterThan(0);
  });
});
