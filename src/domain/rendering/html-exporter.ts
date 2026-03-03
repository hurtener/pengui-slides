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
    // Extract body content and styles from each slide's full HTML document
    const extracted = slides.map((slide) => this.extractSlideContent(slide.html));

    // Scope each slide's CSS to its section id to prevent cross-slide collisions
    const scopedStyles = extracted
      .map((ex, index) => {
        const slideId = `slide-${index + 1}`;
        return ex.styles
          .map((style) => this.scopeCssToSlide(style, slideId))
          .join('\n');
      })
      .join('\n\n');

    // Collect and deduplicate <link> tags (e.g. Google Fonts)
    const allLinks = new Set<string>();
    for (const { links } of extracted) {
      for (const link of links) {
        allLinks.add(link.trim());
      }
    }
    const linkTags = Array.from(allLinks)
      .map((l) => `  ${l}`)
      .join('\n');

    const sections = extracted
      .map(
        (ex, index) =>
          `    <section class="slide-frame" id="slide-${index + 1}" data-slide-id="${slides[index].id}">\n${this.indentHtml(ex.body, 6)}\n    </section>`,
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
${linkTags}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #111;
    }
    .slide-frame {
      width: 1920px;
      height: 1080px;
      position: absolute;
      top: 50%;
      left: 50%;
      transform-origin: center center;
      display: none;
      overflow: hidden;
    }
    .slide-frame.active {
      display: block;
    }
${navigationStyles}
  </style>
  <style>
${scopedStyles}
  </style>
</head>
<body>
${sections}
${counterHtml}
  <script>
    // Scale slides to fit the viewport
    (function() {
      var slides = document.querySelectorAll('.slide-frame');
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
      var slides = document.querySelectorAll('.slide-frame');
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

  // ── Content Extraction ───────────────────────────────────────

  /**
   * Extract usable content from a full slide HTML document.
   * Strips <!DOCTYPE>, <html>, <head>, <body> wrappers and separates
   * <style> blocks from body content.
   */
  private extractSlideContent(html: string): { styles: string[]; body: string; links: string[] } {
    const styles: string[] = [];
    const links: string[] = [];

    // Extract all <style> blocks
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let styleMatch: RegExpExecArray | null;
    while ((styleMatch = styleRegex.exec(html)) !== null) {
      styles.push(styleMatch[1]);
    }

    // Extract <link> tags from <head> (e.g. Google Fonts preconnects, stylesheets)
    const linkRegex = /<link\s[^>]*>/gi;
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = linkRegex.exec(html)) !== null) {
      links.push(linkMatch[0]);
    }

    // Remove everything outside <body>...</body>, or use the full HTML if no body tag
    let body = html;
    const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
    if (bodyMatch) {
      body = bodyMatch[1];
    }

    // Remove <style> blocks from body (they're hoisted to <head>)
    body = body.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Remove any stray <!DOCTYPE>, <html>, <head>, </head>, </html> tags
    body = body
      .replace(/<!DOCTYPE[^>]*>/gi, '')
      .replace(/<\/?html[^>]*>/gi, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<\/?body[^>]*>/gi, '')
      .trim();

    return { styles, body, links };
  }

  /**
   * Scope CSS rules to a specific slide section by prefixing selectors
   * with the slide's DOM id, preventing cross-slide style collisions.
   */
  private scopeCssToSlide(css: string, slideId: string): string {
    const result: string[] = [];
    let depth = 0;

    for (const line of css.split('\n')) {
      const trimmed = line.trim();
      const opens = (trimmed.match(/\{/g) || []).length;
      const closes = (trimmed.match(/\}/g) || []).length;

      if (depth === 0 && opens > 0 && !trimmed.startsWith('@')) {
        // Line contains a selector at top level — scope it
        const braceIdx = trimmed.indexOf('{');
        const selectors = trimmed.substring(0, braceIdx);
        const rest = trimmed.substring(braceIdx);

        const scoped = selectors
          .split(',')
          .map((sel) => {
            sel = sel.trim();
            if (!sel) return sel;
            if (sel === ':root') return `#${slideId}`;
            if (sel === '*') return `#${slideId}, #${slideId} *`;
            return `#${slideId} ${sel}`;
          })
          .join(', ');

        result.push(`${scoped} ${rest}`);
      } else {
        result.push(line);
      }

      depth += opens - closes;
    }

    return result.join('\n');
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
