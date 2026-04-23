/**
 * Parser and resolver for the @page-chrome directive.
 *
 * The directive is an HTML comment of the form:
 *   <!-- @page-chrome {"runningTitle": "...", "pageNumber": true, "footerAlign": "right", "hide": false} -->
 *
 * It lives alongside @slide-meta in the slide's HTML. Parsing is tolerant:
 * an absent directive yields {directive: null}; a malformed JSON payload
 * yields {directive: null, parseError: "..."} so the caller can surface a
 * warning without hard-failing the export.
 */

import type {
  PageChromeDirective,
  PageChromeParseResult,
  ResolvedPageChrome,
} from '../../types/page-chrome.js';

/**
 * Regex that captures the JSON payload inside a @page-chrome HTML comment.
 * Handles optional whitespace around the directive name and multiline JSON.
 */
const PAGE_CHROME_REGEX = /<!--\s*@page-chrome\s+([\s\S]*?)\s*-->/;

/**
 * Extract and parse the @page-chrome directive from a slide's HTML string.
 *
 * @returns ParseResult with:
 *   - `{directive: null}` — no @page-chrome comment present.
 *   - `{directive: null, parseError}` — comment present but JSON is malformed.
 *   - `{directive: {...}}` — comment present and JSON parsed successfully.
 */
export function parsePageChrome(html: string): PageChromeParseResult {
  const match = html.match(PAGE_CHROME_REGEX);
  if (!match || !match[1]) {
    return { directive: null };
  }

  try {
    const parsed = JSON.parse(match[1]) as PageChromeDirective;
    return { directive: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      directive: null,
      parseError: `@page-chrome JSON is malformed: ${message}`,
    };
  }
}

/**
 * Resolve a (potentially absent) PageChromeDirective against deck-level
 * defaults, producing a fully-resolved PageChrome with no optional fields.
 *
 * @param directive  The parsed directive, or null if no @page-chrome comment
 *                   was present on this slide.
 * @param defaults   Deck-level fallback values (at minimum, the deck title).
 */
export function resolvePageChrome(
  directive: PageChromeDirective | null,
  defaults: { deckTitle: string },
): ResolvedPageChrome {
  return {
    runningTitle: directive?.runningTitle ?? defaults.deckTitle,
    pageNumber: directive?.pageNumber ?? true,
    footerAlign: directive?.footerAlign ?? 'right',
    hide: directive?.hide ?? false,
  };
}
