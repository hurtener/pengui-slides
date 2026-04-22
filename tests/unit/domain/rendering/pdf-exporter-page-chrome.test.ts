import { describe, it, expect, vi } from 'vitest';
import { PdfExporter } from '../../../../src/domain/rendering/pdf-exporter.js';
import { Logger } from '../../../../src/infrastructure/logger.js';
import type { Slide } from '../../../../src/types/deck.js';
import type { DeckId, SlideId } from '../../../../src/types/common.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeSlide(html: string, id = 'slide-1'): Slide {
  return {
    id: id as SlideId,
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

/** Minimal print-format slide HTML with a @page-chrome directive. */
function printSlideHtml(
  chromeJson: string | null,
  title = 'Content Slide',
): string {
  const chromeComment =
    chromeJson !== null ? `<!-- @page-chrome ${chromeJson} -->` : '';
  return `<!DOCTYPE html>
<html>
<head>
<style>
:root {
  --color-canvas: #F7F2EA;
  --color-text-primary: #1F2328;
  --color-text-secondary: #6B7280;
  --color-border: #DDD6CC;
}
.slide { width: 1240px; height: 1754px; }
</style>
</head>
<body>
<!-- @slide-meta {"title":"${title}","type":"content","narrative":"","keyPoints":[],"dataPoints":[],"tags":[],"generatedAt":"2026-01-01","soulId":"s1","deckId":"d1","position":0,"metaVersion":"1.0","revisionHash":"abc"} -->
${chromeComment}
<div class="slide"><p>${title}</p></div>
</body>
</html>`;
}

/** Minimal slide-format (16:9) HTML — no @page-chrome applied. */
function slideDeckHtml(): string {
  return `<!DOCTYPE html>
<html>
<head><style>.slide { width: 1920px; height: 1080px; }</style></head>
<body>
<!-- @slide-meta {"title":"Intro","type":"title","narrative":"","keyPoints":[],"dataPoints":[],"tags":[],"generatedAt":"2026-01-01","soulId":"s1","deckId":"d1","position":0,"metaVersion":"1.0","revisionHash":"abc"} -->
<!-- @page-chrome {"runningTitle":"Should Be Ignored","pageNumber":true} -->
<div class="slide"><p>Slide</p></div>
</body>
</html>`;
}

// ── Fake Playwright infrastructure ───────────────────────────────────────────

function makeFakePage(pdfSpy: ReturnType<typeof vi.fn>) {
  return {
    setViewportSize: vi.fn().mockResolvedValue(undefined),
    setContent: vi.fn().mockResolvedValue(undefined),
    pdf: pdfSpy,
  };
}

function makeFakePool(fakePage: ReturnType<typeof makeFakePage>) {
  return {
    getPage: vi.fn().mockResolvedValue(fakePage),
    releasePage: vi.fn().mockResolvedValue(undefined),
  };
}

const fakeRenderer = {
  render: vi.fn().mockResolvedValue({
    slideId: 'slide-1',
    imageData: Buffer.from('png'),
    format: 'png' as const,
    width: 1240,
    height: 1754,
    renderTimeMs: 0,
  }),
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PdfExporter — page chrome', () => {
  describe('two-page print deck — all pages with chrome', () => {
    it('calls page.pdf with displayHeaderFooter:true and header containing the running title', async () => {
      const pdfSpy = vi.fn().mockResolvedValue(Buffer.from('pdf'));
      const fakePage = makeFakePage(pdfSpy);
      const fakePool = makeFakePool(fakePage);

      const exporter = new PdfExporter(
        fakeRenderer as never,
        fakePool as never,
        new Logger('test', 'error'),
      );

      const slides = [
        makeSlide(
          printSlideHtml('{"runningTitle":"Organic Chemistry","pageNumber":true,"footerAlign":"right"}', 'Page 1'),
          'slide-1',
        ),
        makeSlide(
          printSlideHtml('{"runningTitle":"Organic Chemistry","pageNumber":true,"footerAlign":"right"}', 'Page 2'),
          'slide-2',
        ),
      ];

      const result = await exporter.export(slides, 'Organic Chemistry', {
        mode: 'direct',
        format: 'print_a4_portrait',
      });

      expect(result.pageChromeApplied).toBe(true);
      expect(result.pageChromeMode).toBe('uniform');
      expect(result.warnings).toHaveLength(0);

      // page.pdf should have been called once with displayHeaderFooter: true
      expect(pdfSpy).toHaveBeenCalledOnce();
      const pdfCallArgs = pdfSpy.mock.calls[0][0] as Record<string, unknown>;
      expect(pdfCallArgs.displayHeaderFooter).toBe(true);
      expect(typeof pdfCallArgs.headerTemplate).toBe('string');
      expect(typeof pdfCallArgs.footerTemplate).toBe('string');

      // The header template should embed the running title
      expect(pdfCallArgs.headerTemplate as string).toContain('Organic Chemistry');

      // Footer should contain the Playwright page-number class spans
      expect(pdfCallArgs.footerTemplate as string).toContain('pageNumber');
      expect(pdfCallArgs.footerTemplate as string).toContain('totalPages');
    });
  });

  describe('cover page with hide:true — cover-hide-only strategy', () => {
    it('applies chrome mode cover-hide-only and still calls page.pdf with displayHeaderFooter:true', async () => {
      const pdfSpy = vi.fn().mockResolvedValue(Buffer.from('pdf'));
      const fakePage = makeFakePage(pdfSpy);
      const fakePool = makeFakePool(fakePage);

      const exporter = new PdfExporter(
        fakeRenderer as never,
        fakePool as never,
        new Logger('test', 'error'),
      );

      const slides = [
        // Cover: hide:true
        makeSlide(printSlideHtml('{"hide":true}', 'Cover'), 'slide-1'),
        // Content: show chrome
        makeSlide(
          printSlideHtml('{"runningTitle":"My Deck","pageNumber":true}', 'Content'),
          'slide-2',
        ),
      ];

      const result = await exporter.export(slides, 'My Deck', {
        mode: 'direct',
        format: 'print_a4_portrait',
      });

      expect(result.pageChromeApplied).toBe(true);
      expect(result.pageChromeMode).toBe('cover-hide-only');
      expect(result.warnings).toHaveLength(0);

      expect(pdfSpy).toHaveBeenCalledOnce();
      const pdfCallArgs = pdfSpy.mock.calls[0][0] as Record<string, unknown>;
      expect(pdfCallArgs.displayHeaderFooter).toBe(true);

      // The header template should contain the running title from the first non-hidden slide
      expect(pdfCallArgs.headerTemplate as string).toContain('My Deck');
    });
  });

  describe('malformed @page-chrome JSON', () => {
    it('surfaces a warning in result.warnings and sets pageChromeApplied to false', async () => {
      const pdfSpy = vi.fn().mockResolvedValue(Buffer.from('pdf'));
      const fakePage = makeFakePage(pdfSpy);
      const fakePool = makeFakePool(fakePage);

      const exporter = new PdfExporter(
        fakeRenderer as never,
        fakePool as never,
        new Logger('test', 'error'),
      );

      const slides = [
        makeSlide(
          printSlideHtml('{invalid json}', 'Bad Slide'),
          'slide-1',
        ),
      ];

      const result = await exporter.export(slides, 'Bad Deck', {
        mode: 'direct',
        format: 'print_a4_portrait',
      });

      // Chrome not applied because the only directive was malformed (null after parse error)
      expect(result.pageChromeApplied).toBe(false);
      expect(result.pageChromeMode).toBe('none');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('@page-chrome JSON is malformed');
    });

    it('applies chrome to valid slides when some slides have malformed JSON', async () => {
      const pdfSpy = vi.fn().mockResolvedValue(Buffer.from('pdf'));
      const fakePage = makeFakePage(pdfSpy);
      const fakePool = makeFakePool(fakePage);

      const exporter = new PdfExporter(
        fakeRenderer as never,
        fakePool as never,
        new Logger('test', 'error'),
      );

      const slides = [
        // This slide has a valid directive
        makeSlide(
          printSlideHtml('{"runningTitle":"Good","pageNumber":true}', 'Good Slide'),
          'slide-1',
        ),
        // This slide has a malformed directive
        makeSlide(
          printSlideHtml('{bad}', 'Bad Slide'),
          'slide-2',
        ),
      ];

      const result = await exporter.export(slides, 'Mixed Deck', {
        mode: 'direct',
        format: 'print_a4_portrait',
      });

      // The first slide had a valid directive, so chrome is applied
      expect(result.pageChromeApplied).toBe(true);
      // A warning is also emitted for the malformed second slide
      expect(result.warnings.some((w) => w.includes('@page-chrome JSON is malformed'))).toBe(true);
    });
  });

  describe('slide-format deck (non-print)', () => {
    it('never applies chrome even if a slide has @page-chrome', async () => {
      const pdfSpy = vi.fn().mockResolvedValue(Buffer.from('pdf'));
      const fakePage = makeFakePage(pdfSpy);
      const fakePool = makeFakePool(fakePage);

      const exporter = new PdfExporter(
        fakeRenderer as never,
        fakePool as never,
        new Logger('test', 'error'),
      );

      const slides = [makeSlide(slideDeckHtml(), 'slide-1')];

      const result = await exporter.export(slides, 'Slide Deck', {
        mode: 'direct',
        format: 'slides_16_9',
      });

      expect(result.pageChromeApplied).toBe(false);
      expect(result.pageChromeMode).toBe('none');

      // page.pdf should have been called without displayHeaderFooter
      expect(pdfSpy).toHaveBeenCalledOnce();
      const pdfCallArgs = pdfSpy.mock.calls[0][0] as Record<string, unknown>;
      expect(pdfCallArgs.displayHeaderFooter).toBeUndefined();
    });
  });

  describe('print deck without any @page-chrome directive', () => {
    it('produces mode:none and pageChromeApplied:false when no slides have the directive', async () => {
      const pdfSpy = vi.fn().mockResolvedValue(Buffer.from('pdf'));
      const fakePage = makeFakePage(pdfSpy);
      const fakePool = makeFakePool(fakePage);

      const exporter = new PdfExporter(
        fakeRenderer as never,
        fakePool as never,
        new Logger('test', 'error'),
      );

      const slides = [
        makeSlide(printSlideHtml(null, 'No Chrome'), 'slide-1'),
        makeSlide(printSlideHtml(null, 'No Chrome 2'), 'slide-2'),
      ];

      const result = await exporter.export(slides, 'Plain Print', {
        mode: 'direct',
        format: 'print_a4_portrait',
      });

      expect(result.pageChromeApplied).toBe(false);
      expect(result.pageChromeMode).toBe('none');
      expect(result.warnings).toHaveLength(0);

      const pdfCallArgs = pdfSpy.mock.calls[0][0] as Record<string, unknown>;
      expect(pdfCallArgs.displayHeaderFooter).toBeUndefined();
    });
  });

  describe('footer alignment', () => {
    it.each([
      ['left', 'flex-start'],
      ['center', 'center'],
      ['right', 'flex-end'],
    ] as const)('footerAlign %s produces justify-content:%s in footer template', async (align, justify) => {
      const pdfSpy = vi.fn().mockResolvedValue(Buffer.from('pdf'));
      const fakePage = makeFakePage(pdfSpy);
      const fakePool = makeFakePool(fakePage);

      const exporter = new PdfExporter(
        fakeRenderer as never,
        fakePool as never,
        new Logger('test', 'error'),
      );

      const slides = [
        makeSlide(
          printSlideHtml(`{"runningTitle":"Align Test","footerAlign":"${align}"}`, 'Align Test'),
          'slide-1',
        ),
      ];

      await exporter.export(slides, 'Align Deck', {
        mode: 'direct',
        format: 'print_a4_portrait',
      });

      const pdfCallArgs = pdfSpy.mock.calls[0][0] as Record<string, unknown>;
      expect(pdfCallArgs.footerTemplate as string).toContain(justify);
    });
  });

  describe('soul color extraction', () => {
    it('uses colors from the first slide :root block in header template', async () => {
      const pdfSpy = vi.fn().mockResolvedValue(Buffer.from('pdf'));
      const fakePage = makeFakePage(pdfSpy);
      const fakePool = makeFakePool(fakePage);

      const exporter = new PdfExporter(
        fakeRenderer as never,
        fakePool as never,
        new Logger('test', 'error'),
      );

      const customCanvas = '#AABBCC';
      const html = `<!DOCTYPE html>
<html>
<head>
<style>
:root {
  --color-canvas: ${customCanvas};
  --color-text-primary: #111111;
  --color-text-secondary: #999999;
  --color-border: #CCCCCC;
}
</style>
</head>
<body>
<!-- @slide-meta {"title":"Soul Test","type":"content","narrative":"","keyPoints":[],"dataPoints":[],"tags":[],"generatedAt":"2026-01-01","soulId":"s1","deckId":"d1","position":0,"metaVersion":"1.0","revisionHash":"abc"} -->
<!-- @page-chrome {"runningTitle":"Soul Test","pageNumber":true} -->
<div class="slide"><p>Soul</p></div>
</body>
</html>`;

      const slides = [makeSlide(html, 'slide-1')];

      await exporter.export(slides, 'Soul Test', {
        mode: 'direct',
        format: 'print_a4_portrait',
      });

      const pdfCallArgs = pdfSpy.mock.calls[0][0] as Record<string, unknown>;
      // The extracted canvas color should appear in the header template
      expect(pdfCallArgs.headerTemplate as string).toContain(customCanvas);
    });
  });
});
