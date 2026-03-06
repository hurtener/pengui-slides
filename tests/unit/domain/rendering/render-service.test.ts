import { describe, it, expect, afterAll } from 'vitest';
import { RenderService } from '../../../../src/domain/rendering/render-service.js';
import { loadConfig } from '../../../../src/config.js';
import { Logger } from '../../../../src/infrastructure/logger.js';
import type { Slide } from '../../../../src/types/deck.js';

const config = loadConfig();
const logger = new Logger({ level: 'error', context: 'test' });

function makeSlide(id: string, html: string, position = 0): Slide {
  return {
    id,
    deckId: 'deck-1',
    position,
    html,
    metadata: {
      title: `Slide ${id}`,
      type: 'content',
      narrative: '',
      keyPoints: [],
      dataPoints: [],
      generatedAt: new Date().toISOString(),
      soulId: 'soul-1',
      deckId: 'deck-1',
      position,
      metaVersion: '1.0',
      revisionHash: 'abc',
    },
    isValid: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const simpleHtml = `<!DOCTYPE html><html><head><style>body{background:#fff;}</style></head><body><div class="slide" style="width:1920px;height:1080px;"><h1 style="color:red;">Hello</h1></div></body></html>`;

describe('RenderService', () => {
  const service = new RenderService(config, logger);

  afterAll(async () => {
    await service.shutdown();
  }, 20000);

  it('exports HTML synchronously (no Playwright)', async () => {
    const slides = [makeSlide('s1', simpleHtml, 0)];
    const result = await service.exportHtml(slides, 'Test Deck', true);

    expect(result.format).toBe('html');
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.filename).toContain('Test_Deck');
    expect(result.mimeType).toBe('text/html');
    expect(result.slideCount).toBe(1);
  });

  it('renders previews via Playwright', async () => {
    const slides = [makeSlide('s1', simpleHtml, 0)];
    const results = await service.renderPreview(slides);

    expect(results).toHaveLength(1);
    expect(results[0].imageBase64.length).toBeGreaterThan(100);
    expect(results[0].format).toBe('png');
  });

  it('exports PPTX via Playwright', async () => {
    const slides = [makeSlide('s1', simpleHtml, 0)];
    const result = await service.exportPptx(slides, 'Test Deck');

    expect(result.format).toBe('pptx');
    expect(result.data.length).toBeGreaterThan(1000);
    expect(result.slideCount).toBe(1);
  });

  it('exports PDF via Playwright', async () => {
    const slides = [makeSlide('s1', simpleHtml, 0)];
    const result = await service.exportPdf(slides, 'Test Deck', 'image');

    expect(result.format).toBe('pdf');
    expect(result.data.length).toBeGreaterThan(1000);
    expect(result.slideCount).toBe(1);
  });

  it('shuts down cleanly', async () => {
    // Should not throw
    await service.shutdown();
    // Double shutdown should also not throw
    await service.shutdown();
  });
});
