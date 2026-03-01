/**
 * Metadata Parser for Pengui Slides.
 *
 * Extracts structured SlideMetadata from HTML comments embedded
 * in slide markup using the format:
 *   <!-- @slide-meta { ... JSON ... } -->
 */

import type { SlideMetadata } from '../../types/metadata.js';

/**
 * Regex to capture the JSON payload inside a slide-meta HTML comment.
 * Handles multiline JSON and optional whitespace.
 */
const SLIDE_META_REGEX = /<!--\s*@slide-meta\s+([\s\S]*?)\s*-->/;

export class MetadataParser {
  /**
   * Parse slide metadata from an HTML string.
   *
   * Looks for the first `<!-- @slide-meta {...} -->` comment and
   * parses the JSON payload into a SlideMetadata object.
   *
   * @param html - The slide HTML that may contain an embedded metadata comment.
   * @returns The parsed SlideMetadata, or null if no metadata comment is found
   *          or parsing fails.
   */
  parse(html: string): SlideMetadata | null {
    const match = html.match(SLIDE_META_REGEX);
    if (!match || !match[1]) {
      return null;
    }

    try {
      const parsed = JSON.parse(match[1]) as SlideMetadata;
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Check whether the given HTML contains a slide-meta comment.
   */
  hasMetadata(html: string): boolean {
    return SLIDE_META_REGEX.test(html);
  }
}
