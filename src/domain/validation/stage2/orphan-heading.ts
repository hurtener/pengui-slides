/**
 * Orphan Heading Check (Document Stage 2)
 *
 * Detects headings (h1/h2/h3) that sit at the bottom of a page with
 * their body content on the next page. Composer already emits
 * `h1,h2,h3 { break-after: avoid-page }` but Chromium honors it only
 * when there's a nearby alternative break point.
 *
 * Heuristic: for each heading, compute its bottom edge relative to the
 * page content boundary; if the heading's bottom is within the last
 * `TAIL_MARGIN_PX` of a page, emit a warning.
 */

import type { Page } from 'playwright';
import type {
  Stage2Check,
  ValidationContext,
  ValidationIssue,
} from '../../../types/validation.js';
import { getCssPageDims } from './split-keep-together.js';

/** A heading's bottom within this distance of a page boundary is "orphaned". */
const TAIL_MARGIN_PX = 60;

export class OrphanHeadingCheck implements Stage2Check {
  readonly id = 'orphan-heading';
  readonly name = 'Orphan Heading Detection';

  async run(
    page: unknown,
    _soulTokenNames: string[],
    context?: ValidationContext,
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    if (!context?.geometry) return issues;

    const dims = getCssPageDims(context.geometry);
    const pwPage = page as Page;

    const orphans = await pwPage.evaluate(
      (args: { contentHeightPx: number; marginTopPx: number; tailPx: number }) => {
        const found: Array<{
          tag: string;
          text: string;
          bottomPx: number;
          pageIndex: number;
        }> = [];
        const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
        for (const el of headings) {
          const rect = (el as HTMLElement).getBoundingClientRect();
          const bottomRelativeToFirstContent = rect.bottom - args.marginTopPx;
          const pageIndex = Math.floor(bottomRelativeToFirstContent / args.contentHeightPx);
          const posInPage = bottomRelativeToFirstContent - pageIndex * args.contentHeightPx;
          if (args.contentHeightPx - posInPage <= args.tailPx) {
            found.push({
              tag: (el as HTMLElement).tagName.toLowerCase(),
              text: ((el as HTMLElement).textContent ?? '').trim().slice(0, 80),
              bottomPx: rect.bottom,
              pageIndex,
            });
          }
        }
        return found;
      },
      {
        contentHeightPx: dims.contentHeightPx,
        marginTopPx: dims.marginTopPx,
        tailPx: TAIL_MARGIN_PX,
      },
    );

    for (const o of orphans) {
      issues.push({
        id: `${this.id}-${o.pageIndex}-${o.text.slice(0, 16).replace(/\W+/g, '_')}`,
        stage: 'stage2_render',
        severity: 'warning',
        rule: this.id,
        message:
          `<${o.tag}> "${o.text}" sits at the bottom of page ${o.pageIndex + 1} with its body content starting on the next page. ` +
          'The composer emits `break-after: avoid-page` but Chromium cannot always honor it without a nearby alternative break point.',
        element: o.tag,
        fixSuggestion:
          'Shorten the preceding prose so the heading moves to the top of the next page, or split the prose section to create a cleaner break point.',
      });
    }

    return issues;
  }
}
