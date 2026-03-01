/**
 * HTML Exporter for Pengui Slides.
 *
 * Produces a self-contained HTML file with all slides rendered
 * as inline sections. Optionally includes JavaScript navigation
 * for arrow key control and a slide counter overlay.
 */

import type { Logger } from '../../infrastructure/logger.js';
import type { Slide } from '../../types/deck.js';
import type { ExportResult } from '../../types/export.js';

// ── HTML Exporter ────────────────────────────────────────────────

export class HtmlExporter {
  constructor(private readonly logger: Logger) {}

  /**
   * Export slides as a self-contained HTML buffer.
   *
   * @param slides             Ordered array of slides.
   * @param deckTitle          Title for the document.
   * @param includeNavigation  When true, adds keyboard navigation and slide counter.
   */
  async export(
    slides: Slide[],
    deckTitle: string,
    includeNavigation: boolean = true,
  ): Promise<ExportResult> {
    this.logger.info('Starting HTML export', {
      slideCount: slides.length,
      includeNavigation,
    });

    const html = this.buildHtml(slides, deckTitle, includeNavigation);
    const data = Buffer.from(html, 'utf-8');
    const filename = this.sanitizeFilename(deckTitle) + '.html';

    this.logger.info('HTML export complete', {
      filename,
      slideCount: slides.length,
      bytes: data.length,
    });

    return {
      format: 'html',
      data,
      mimeType: 'text/html',
      filename,
      slideCount: slides.length,
      fileSizeBytes: data.length,
      exportedAt: new Date().toISOString(),
    };
  }

  // ── HTML Generation ──────────────────────────────────────────

  private buildHtml(
    slides: Slide[],
    deckTitle: string,
    includeNavigation: boolean,
  ): string {
    const sections = slides
      .map(
        (slide, index) =>
          `    <section class="slide" id="slide-${index + 1}" data-slide-id="${slide.id}">\n${this.indentHtml(slide.html, 6)}\n    </section>`,
      )
      .join('\n\n');

    const navigationStyles = includeNavigation
      ? this.getNavigationStyles()
      : '';

    const navigationScript = includeNavigation
      ? this.getNavigationScript(slides.length)
      : '';

    const counterHtml = includeNavigation
      ? `\n    <div id="slide-counter" class="slide-counter">1 / ${slides.length}</div>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(deckTitle)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000;
    }
    .slide {
      width: 1920px;
      height: 1080px;
      position: absolute;
      top: 50%;
      left: 50%;
      transform-origin: center center;
      display: none;
      overflow: hidden;
    }
    .slide.active {
      display: block;
    }
${navigationStyles}
  </style>
</head>
<body>
${sections}
${counterHtml}
  <script>
    // Scale slides to fit the viewport
    (function() {
      var slides = document.querySelectorAll('.slide');
      function scaleSlides() {
        var sw = 1920, sh = 1080;
        var vw = window.innerWidth, vh = window.innerHeight;
        var scale = Math.min(vw / sw, vh / sh);
        for (var i = 0; i < slides.length; i++) {
          slides[i].style.transform =
            'translate(-50%, -50%) scale(' + scale + ')';
        }
      }
      window.addEventListener('resize', scaleSlides);
      scaleSlides();

      // Show the first slide
      if (slides.length > 0) {
        slides[0].classList.add('active');
      }
    })();
${navigationScript}
  </script>
</body>
</html>`;
  }

  // ── Navigation ───────────────────────────────────────────────

  private getNavigationStyles(): string {
    return `
    .slide-counter {
      position: fixed;
      bottom: 16px;
      right: 24px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      color: rgba(255, 255, 255, 0.6);
      background: rgba(0, 0, 0, 0.4);
      padding: 4px 12px;
      border-radius: 4px;
      z-index: 9999;
      user-select: none;
      pointer-events: none;
    }`;
  }

  private getNavigationScript(slideCount: number): string {
    return `
    // Keyboard navigation
    (function() {
      var current = 0;
      var total = ${slideCount};
      var slides = document.querySelectorAll('.slide');
      var counter = document.getElementById('slide-counter');

      function goTo(index) {
        if (index < 0 || index >= total) return;
        slides[current].classList.remove('active');
        current = index;
        slides[current].classList.add('active');
        if (counter) {
          counter.textContent = (current + 1) + ' / ' + total;
        }
      }

      document.addEventListener('keydown', function(e) {
        switch (e.key) {
          case 'ArrowRight':
          case 'ArrowDown':
          case ' ':
          case 'PageDown':
            e.preventDefault();
            goTo(current + 1);
            break;
          case 'ArrowLeft':
          case 'ArrowUp':
          case 'PageUp':
            e.preventDefault();
            goTo(current - 1);
            break;
          case 'Home':
            e.preventDefault();
            goTo(0);
            break;
          case 'End':
            e.preventDefault();
            goTo(total - 1);
            break;
        }
      });
    })();`;
  }

  // ── Helpers ──────────────────────────────────────────────────

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private indentHtml(html: string, spaces: number): string {
    const indent = ' '.repeat(spaces);
    return html
      .split('\n')
      .map((line) => indent + line)
      .join('\n');
  }

  private sanitizeFilename(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100)
      || 'presentation';
  }
}
