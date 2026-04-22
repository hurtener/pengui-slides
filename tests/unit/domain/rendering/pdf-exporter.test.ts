import { describe, it, expect } from 'vitest';
import { PdfExporter } from '../../../../src/domain/rendering/pdf-exporter.js';
import { Logger } from '../../../../src/infrastructure/logger.js';
import type { Slide } from '../../../../src/types/deck.js';
import type { DeckId, SlideId } from '../../../../src/types/common.js';

function makeSlide(html: string): Slide {
  return {
    id: 'slide-1' as SlideId,
    deckId: 'deck-1' as DeckId,
    position: 0,
    html,
    metadata: {
      title: 'Slide',
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
      revisionHash: 'rev-1',
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('PdfExporter', () => {
  it('normalizes standalone slide HTML in direct mode before printing', async () => {
    let capturedHtml = '';

    const fakePage = {
      setViewportSize: async () => undefined,
      setContent: async (html: string) => {
        capturedHtml = html;
      },
      pdf: async () => Buffer.from('pdf'),
    };

    const fakePool = {
      getPage: async () => fakePage,
      releasePage: async () => undefined,
    };

    const fakeRenderer = {
      render: async () => ({
        slideId: 'slide-1',
        imageData: Buffer.from('png'),
        format: 'png' as const,
        width: 1920,
        height: 1080,
        renderTimeMs: 0,
      }),
    };

    const exporter = new PdfExporter(
      fakeRenderer as never,
      fakePool as never,
      new Logger('test', 'error'),
    );

    await exporter.export(
      [
        makeSlide(`<!DOCTYPE html><html><head><style>.slide { color: red; }</style></head><body><div class="slide">Hello</div></body></html>`),
      ],
      'Deck',
      { mode: 'direct' },
    );

    expect(capturedHtml).toContain('<section class="slide-page" id="slide-1">');
    expect(capturedHtml).toContain('#slide-1 .slide { color: red; }');
    expect(capturedHtml).not.toContain('<section class="slide-page" id="slide-1"><!DOCTYPE html>');
    expect(capturedHtml).not.toContain('<html><head>');
  });
});
