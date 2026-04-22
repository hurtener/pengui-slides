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
    sourceKind: 'legacy',
    translationIssues: [],
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

interface FakePage {
  setViewportSize: ReturnType<typeof vi.fn>;
  setContent: ReturnType<typeof vi.fn>;
  pdf: ReturnType<typeof vi.fn>;
}

function makeFakePage(pdfSpy: ReturnType<typeof vi.fn>): FakePage {
  return {
    setViewportSize: vi.fn().mockResolvedValue(undefined),
    setContent: vi.fn().mockResolvedValue(undefined),
    pdf: pdfSpy,
  };
}

function makeFakePool(fakePage: FakePage) {
  return {
    getPage: vi.fn().mockResolvedValue(fakePage),
    releasePage: vi.fn().mockResolvedValue(undefined),
  };
}

function lastSetContentHtml(fakePage: FakePage): string {
  const calls = fakePage.setContent.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as string;
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
//
// The chrome strategy renders header/footer strips as HTML inside each
// .slide-page section (not via Playwright displayHeaderFooter). Tests assert
// that the composite HTML passed to setContent contains the expected chrome
// markup — and that page.pdf is invoked WITHOUT displayHeaderFooter.

describe('PdfExporter — page chrome (HTML composition strategy)', () => {
  describe('two-page print deck — all pages with chrome', () => {
    it('injects header + footer HTML into each slide-page section and never sets displayHeaderFooter', async () => {
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

      const html = lastSetContentHtml(fakePage);
      // Both pages get a header strip with the running title
      expect(html.match(/<div class="pengui-chrome-header"/g)?.length).toBe(2);
      expect(html.match(/<div class="pengui-chrome-footer"/g)?.length).toBe(2);
      expect(html).toContain('Organic Chemistry');
      expect(html).toContain('Page 1 of 2');
      expect(html).toContain('Page 2 of 2');

      // page.pdf is called WITHOUT displayHeaderFooter — chrome lives in the body
      expect(pdfSpy).toHaveBeenCalledOnce();
      const pdfCallArgs = pdfSpy.mock.calls[0][0] as Record<string, unknown>;
      expect(pdfCallArgs.displayHeaderFooter).toBeUndefined();
    });
  });

  describe('cover page with hide:true — cover-hide-only mode', () => {
    it('skips chrome on the hidden cover and numbers the visible page as Page 1', async () => {
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

      const html = lastSetContentHtml(fakePage);
      // Only the second section has chrome (1 header, 1 footer)
      expect(html.match(/<div class="pengui-chrome-header"/g)?.length).toBe(1);
      expect(html.match(/<div class="pengui-chrome-footer"/g)?.length).toBe(1);
      // The visible page is "Page 1 of 1" — hidden pages don't count
      expect(html).toContain('Page 1 of 1');
      expect(html).toContain('My Deck');
    });
  });

  describe('mid-deck hide — fully supported (no warning)', () => {
    it('hides chrome on a mid-deck page and reports mode "mixed" without a limitation warning', async () => {
      const pdfSpy = vi.fn().mockResolvedValue(Buffer.from('pdf'));
      const fakePage = makeFakePage(pdfSpy);
      const fakePool = makeFakePool(fakePage);

      const exporter = new PdfExporter(
        fakeRenderer as never,
        fakePool as never,
        new Logger('test', 'error'),
      );

      const slides = [
        makeSlide(printSlideHtml('{"runningTitle":"Doc","pageNumber":true}', 'Page 1'), 'slide-1'),
        // mid-deck hidden insert (e.g. a divider)
        makeSlide(printSlideHtml('{"hide":true}', 'Divider'), 'slide-2'),
        makeSlide(printSlideHtml('{"runningTitle":"Doc","pageNumber":true}', 'Page 3'), 'slide-3'),
      ];

      const result = await exporter.export(slides, 'Doc', {
        mode: 'direct',
        format: 'print_a4_portrait',
      });

      expect(result.pageChromeApplied).toBe(true);
      expect(result.pageChromeMode).toBe('mixed');
      // No "non-first hide unsupported" warning — fully supported now
      expect(result.warnings).toHaveLength(0);

      const html = lastSetContentHtml(fakePage);
      // Only 2 chrome bars (the mid-deck hidden page is skipped)
      expect(html.match(/<div class="pengui-chrome-header"/g)?.length).toBe(2);
      // Page numbers count visible pages only: 1 of 2, 2 of 2
      expect(html).toContain('Page 1 of 2');
      expect(html).toContain('Page 2 of 2');
    });
  });

  describe('malformed @page-chrome JSON', () => {
    it('surfaces a warning in result.warnings and falls back to no chrome when the only directive is malformed', async () => {
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
        makeSlide(
          printSlideHtml('{"runningTitle":"Good","pageNumber":true}', 'Good Slide'),
          'slide-1',
        ),
        makeSlide(
          printSlideHtml('{bad}', 'Bad Slide'),
          'slide-2',
        ),
      ];

      const result = await exporter.export(slides, 'Mixed Deck', {
        mode: 'direct',
        format: 'print_a4_portrait',
      });

      expect(result.pageChromeApplied).toBe(true);
      expect(result.warnings.some((w) => w.includes('@page-chrome JSON is malformed'))).toBe(true);
    });
  });

  describe('slide-format deck (non-print)', () => {
    it('never applies chrome even if a slide carries @page-chrome', async () => {
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

      const html = lastSetContentHtml(fakePage);
      expect(html).not.toContain('pengui-chrome-header');
      expect(html).not.toContain('pengui-chrome-footer');
    });
  });

  describe('print deck without any @page-chrome directive', () => {
    it('produces mode:none and no chrome HTML', async () => {
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

      const html = lastSetContentHtml(fakePage);
      expect(html).not.toContain('pengui-chrome-header');
    });
  });

  describe('footer alignment', () => {
    it.each([
      ['left', 'flex-start'],
      ['center', 'center'],
      ['right', 'flex-end'],
    ] as const)('footerAlign %s injects justify-content:%s on the footer strip', async (align, justify) => {
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
          printSlideHtml(`{"runningTitle":"Align Test","pageNumber":true,"footerAlign":"${align}"}`, 'Align Test'),
          'slide-1',
        ),
      ];

      await exporter.export(slides, 'Align Deck', {
        mode: 'direct',
        format: 'print_a4_portrait',
      });

      const html = lastSetContentHtml(fakePage);
      expect(html).toContain(`justify-content: ${justify}`);
    });
  });

  describe('soul color extraction', () => {
    it('uses colors from the first slide :root block in the chrome HTML', async () => {
      const pdfSpy = vi.fn().mockResolvedValue(Buffer.from('pdf'));
      const fakePage = makeFakePage(pdfSpy);
      const fakePool = makeFakePool(fakePage);

      const exporter = new PdfExporter(
        fakeRenderer as never,
        fakePool as never,
        new Logger('test', 'error'),
      );

      const customBorder = '#AABBCC';
      const html = `<!DOCTYPE html>
<html>
<head>
<style>
:root {
  --color-canvas: #F7F2EA;
  --color-text-primary: #111111;
  --color-text-secondary: #999999;
  --color-border: ${customBorder};
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

      const composite = lastSetContentHtml(fakePage);
      // The extracted border color should appear in the chrome HTML
      expect(composite).toContain(customBorder);
    });
  });
});
