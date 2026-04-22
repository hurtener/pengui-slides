/**
 * Types for the @page-chrome directive.
 *
 * Print decks opt into running page chrome (header + footer with page numbers)
 * via an HTML comment alongside @slide-meta:
 *
 *   <!-- @page-chrome {"runningTitle": "My Deck", "pageNumber": true, "footerAlign": "right"} -->
 *
 * Resolution happens at PDF export time, not per-slide.
 */

export interface PageChromeDirective {
  /** Running title rendered in the header strip. Defaults to deck.title. */
  runningTitle?: string;
  /** Whether to render page numbers in the footer. Defaults to true. */
  pageNumber?: boolean;
  /** Footer text alignment. Defaults to 'right'. */
  footerAlign?: 'left' | 'center' | 'right';
  /** Suppress chrome on this specific page (e.g. cover, TOC). Defaults to false. */
  hide?: boolean;
}

export interface ResolvedPageChrome {
  runningTitle: string;
  pageNumber: boolean;
  footerAlign: 'left' | 'center' | 'right';
  hide: boolean;
}

export interface PageChromeParseResult {
  directive: PageChromeDirective | null;
  /** Set when a @page-chrome comment is present but its JSON payload is malformed. */
  parseError?: string;
}
