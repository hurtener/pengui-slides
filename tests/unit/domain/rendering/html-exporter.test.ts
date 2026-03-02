import { describe, it, expect, beforeEach } from 'vitest';
import { HtmlExporter } from '../../../../src/domain/rendering/html-exporter.js';
import { Logger } from '../../../../src/infrastructure/logger.js';
import type { Slide } from '../../../../src/types/deck.js';
import type { SlideId, DeckId } from '../../../../src/types/common.js';
import type { SlideMetadata } from '../../../../src/types/metadata.js';

function makeSlide(overrides: Partial<Slide> & { html: string }): Slide {
  return {
    id: 'slide-1' as SlideId,
    deckId: 'deck-1' as DeckId,
    position: 0,
    metadata: {
      title: 'Test Slide',
      type: 'content',
      narrative: '',
      keyPoints: [],
      dataPoints: [],
      tags: [],
      generatedAt: '2026-01-01T00:00:00.000Z',
      soulId: 'soul-1',
      deckId: 'deck-1',
      position: 0,
      metaVersion: '1.0',
      revisionHash: 'abc',
    } as SlideMetadata,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('HtmlExporter', () => {
  let exporter: HtmlExporter;

  beforeEach(() => {
    const logger = new Logger('test', 'error');
    exporter = new HtmlExporter(logger);
  });

  it('exports slides as an ExportResult with format html', async () => {
    const slides = [
      makeSlide({
        html: `<!DOCTYPE html><html><head><style>.slide { color: var(--text); }</style></head><body><div class="slide"><p>Hello</p></div></body></html>`,
      }),
    ];

    const result = await exporter.export(slides, 'Test Deck');

    expect(result.format).toBe('html');
    expect(result.mimeType).toBe('text/html');
    expect(result.slideCount).toBe(1);
    expect(result.data).toBeInstanceOf(Buffer);
    expect(result.fileSizeBytes).toBeGreaterThan(0);
    expect(result.filename).toContain('.html');
    expect(result.exportedAt).toBeDefined();
  });

  it('extracts body content from full HTML documents', async () => {
    const slides = [
      makeSlide({
        html: `<!DOCTYPE html><html><head><style>body{}</style></head><body><div class="slide"><p>Body Content</p></div></body></html>`,
      }),
    ];

    const result = await exporter.export(slides, 'Test');
    const html = result.data.toString('utf-8');

    expect(html).toContain('Body Content');
  });

  it('hoists CSS styles to head', async () => {
    const slides = [
      makeSlide({
        html: `<!DOCTYPE html><html><head><style>.slide { color: red; }</style></head><body><div class="slide">Content</div></body></html>`,
      }),
    ];

    const result = await exporter.export(slides, 'Test');
    const html = result.data.toString('utf-8');

    // Styles should appear in <head> area
    const headEnd = html.indexOf('</head>');
    const styleIndex = html.indexOf('.slide { color: red; }');
    expect(styleIndex).toBeLessThan(headEnd);
  });

  it('uses slide-frame class (not slide) for sections', async () => {
    const slides = [
      makeSlide({
        html: `<!DOCTYPE html><html><head></head><body><div class="slide">Content</div></body></html>`,
      }),
    ];

    const result = await exporter.export(slides, 'Test');
    const html = result.data.toString('utf-8');

    expect(html).toContain('class="slide-frame"');
  });

  it('includes navigation scripts when requested', async () => {
    const slides = [
      makeSlide({
        html: `<!DOCTYPE html><html><head></head><body><div class="slide">Content</div></body></html>`,
      }),
    ];

    const result = await exporter.export(slides, 'Test', true);
    const html = result.data.toString('utf-8');

    expect(html).toContain('ArrowRight');
    expect(html).toContain('ArrowLeft');
    expect(html).toContain('slide-counter');
  });

  it('excludes navigation scripts when not requested', async () => {
    const slides = [
      makeSlide({
        html: `<!DOCTYPE html><html><head></head><body><div class="slide">Content</div></body></html>`,
      }),
    ];

    const result = await exporter.export(slides, 'Test', false);
    const html = result.data.toString('utf-8');

    expect(html).not.toContain('ArrowRight');
    expect(html).not.toContain('slide-counter');
  });

  it('renders multiple slides as separate sections', async () => {
    const slides = [
      makeSlide({
        id: 'slide-1' as SlideId,
        html: `<!DOCTYPE html><html><head></head><body><div class="slide"><p>Slide 1</p></div></body></html>`,
      }),
      makeSlide({
        id: 'slide-2' as SlideId,
        position: 1,
        html: `<!DOCTYPE html><html><head></head><body><div class="slide"><p>Slide 2</p></div></body></html>`,
      }),
    ];

    const result = await exporter.export(slides, 'Test');
    const html = result.data.toString('utf-8');

    expect(html).toContain('id="slide-1"');
    expect(html).toContain('id="slide-2"');
    expect(html).toContain('Slide 1');
    expect(html).toContain('Slide 2');
  });

  it('generates a valid HTML document structure', async () => {
    const slides = [
      makeSlide({
        html: `<!DOCTYPE html><html><head></head><body><div class="slide">Content</div></body></html>`,
      }),
    ];

    const result = await exporter.export(slides, 'Test Deck');
    const html = result.data.toString('utf-8');

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<head>');
    expect(html).toContain('</head>');
    expect(html).toContain('<body>');
    expect(html).toContain('</body>');
    expect(html).toContain('</html>');
  });

  it('sanitizes deck title for filename', async () => {
    const slides = [
      makeSlide({
        html: `<!DOCTYPE html><html><head></head><body><div class="slide">Content</div></body></html>`,
      }),
    ];

    const result = await exporter.export(slides, 'My <Deck> Title!');
    expect(result.filename).toBe('My_Deck_Title.html');
  });

  it('escapes HTML in deck title within document', async () => {
    const slides = [
      makeSlide({
        html: `<!DOCTYPE html><html><head></head><body><div class="slide">Content</div></body></html>`,
      }),
    ];

    const result = await exporter.export(slides, '<script>alert("xss")</script>');
    const html = result.data.toString('utf-8');

    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});
