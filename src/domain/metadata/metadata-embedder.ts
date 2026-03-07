/**
 * Metadata Embedder for Pengui Slides.
 *
 * Inserts or updates `<!-- @slide-meta {...} -->` comments in slide HTML.
 * The metadata comment is placed immediately before the slide's root div
 * element so it travels with the markup but does not render visually.
 */

import type { SlideMetadata } from '../../types/metadata.js';

/**
 * Regex to match an existing slide-meta comment (including surrounding whitespace).
 */
const SLIDE_META_REGEX = /<!--\s*@slide-meta\s+[\s\S]*?\s*-->\n?/;

/**
 * Regex to locate the opening root slide div in the markup.
 */
const SLIDE_DIV_REGEX = /(<div[^>]*class=["'][^"']*\bslide\b[^"']*["'][^>]*>)/i;

export class MetadataEmbedder {
  /**
   * Insert a metadata comment before the slide div in HTML that does
   * not yet contain one.
   *
   * If the HTML already contains a `@slide-meta` comment, this method
   * delegates to `update()` instead.
   *
   * @param html - The slide HTML without a metadata comment.
   * @param metadata - The metadata to embed.
   * @returns The HTML with the metadata comment inserted.
   */
  embed(html: string, metadata: SlideMetadata): string {
    if (SLIDE_META_REGEX.test(html)) {
      return this.update(html, metadata);
    }

    const comment = this.formatComment(metadata);

    const divMatch = html.match(SLIDE_DIV_REGEX);
    if (divMatch && divMatch.index !== undefined) {
      return (
        html.slice(0, divMatch.index) +
        comment + '\n' +
        html.slice(divMatch.index)
      );
    }

    // Fallback: prepend the comment if no div is found
    return comment + '\n' + html;
  }

  /**
   * Replace an existing metadata comment or insert one if none exists.
   *
   * @param html - The slide HTML that may or may not contain a metadata comment.
   * @param metadata - The new metadata to embed.
   * @returns The HTML with the updated metadata comment.
   */
  update(html: string, metadata: SlideMetadata): string {
    const comment = this.formatComment(metadata);

    if (SLIDE_META_REGEX.test(html)) {
      return html.replace(SLIDE_META_REGEX, comment + '\n');
    }

    // No existing comment found -- insert fresh
    return this.embed(html, metadata);
  }

  /**
   * Format a SlideMetadata object as an HTML comment string.
   */
  private formatComment(metadata: SlideMetadata): string {
    const json = JSON.stringify(metadata, null, 2);
    return `<!-- @slide-meta ${json} -->`;
  }
}
