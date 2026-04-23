/**
 * Split Keep-Together Check (Document Stage 2)
 *
 * The composer emits `break-inside: avoid` on every element that carries
 * a canonical keep-together class (.pengui-figure, .pengui-chart,
 * .pengui-diagram, .pengui-callout, .pengui-quote, .pengui-image). But
 * Chromium's paginator treats `break-inside: avoid` as a STRONG HINT,
 * not a guarantee — if an element is taller than the page content area,
 * it will be split.
 *
 * This check composes the full document, measures each keep-together
 * element, and compares its top/bottom offsets to the composed document's
 * page boundaries. Anything that crosses a boundary is flagged so the
 * author can shrink the figure, break it up, or force an earlier page.
 *
 * Runs only on continuous-document decks (authoringModel = 'document').
 * The page height in CSS px comes from the composed document's @page
 * size and margins, derived centrally in `getCssPageDims`.
 */

import type { Page } from 'playwright';
import type {
  Stage2Check,
  ValidationContext,
  ValidationIssue,
} from '../../../types/validation.js';
import type { FormatGeometry } from '../../../types/format.js';

const KEEP_TOGETHER_SELECTORS = [
  '.pengui-figure',
  '.pengui-chart',
  '.pengui-diagram',
  '.pengui-callout',
  '.pengui-quote',
  '.pengui-image',
];

/**
 * Convert a physical page dimension to CSS px. Composer emits @page
 * sizes in physical units (mm); the browser lays the document out in
 * CSS px inside those bounds. At the conventional 96 DPI: 1mm ≈ 3.78px.
 */
function mmToPx(mm: number): number {
  return (mm / 25.4) * 96;
}

export interface CssPageDims {
  pageHeightPx: number;
  pageWidthPx: number;
  marginTopPx: number;
  marginBottomPx: number;
  /** Usable content height = pageHeight − top/bottom margins. */
  contentHeightPx: number;
}

/**
 * Resolve the composed document's page dimensions in CSS px. Mirrors
 * the composer's `buildPageSizeDecl` + `buildPageMarginDecl` math. If
 * either changes, this helper must follow — there's a single source of
 * truth for CSS px conversion here.
 */
export function getCssPageDims(geometry: FormatGeometry): CssPageDims {
  let pageWidthPx = geometry.widthPx;
  let pageHeightPx = geometry.heightPx;

  // A4 / Letter — use physical units for conversion (geometry.widthPx
  // is our soul-level pixel approximation, not the @page size Chromium
  // actually uses when preferCSSPageSize is on). Compute from the known
  // physical sizes.
  if (geometry.physicalPage === 'A4') {
    pageWidthPx = mmToPx(210);
    pageHeightPx = mmToPx(297);
  } else if (geometry.physicalPage === 'Letter') {
    pageWidthPx = mmToPx(215.9);
    pageHeightPx = mmToPx(279.4);
  }

  // Composer default: 18mm top, 22mm bottom, 15mm sides.
  const marginTopPx = mmToPx(18);
  const marginBottomPx = mmToPx(22);

  return {
    pageWidthPx,
    pageHeightPx,
    marginTopPx,
    marginBottomPx,
    contentHeightPx: pageHeightPx - marginTopPx - marginBottomPx,
  };
}

export class SplitKeepTogetherCheck implements Stage2Check {
  readonly id = 'split-keep-together';
  readonly name = 'Keep-Together Split Detection';

  async run(
    page: unknown,
    _soulTokenNames: string[],
    context?: ValidationContext,
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    if (!context?.geometry) return issues;

    const dims = getCssPageDims(context.geometry);
    const pwPage = page as Page;

    const measured = await pwPage.evaluate(
      (args: { selectors: string[]; contentHeightPx: number; marginTopPx: number }) => {
        const results: Array<{
          selector: string;
          index: number;
          topPx: number;
          heightPx: number;
          startPage: number;
          endPage: number;
        }> = [];

        for (const selector of args.selectors) {
          const els = Array.from(document.querySelectorAll(selector));
          els.forEach((el, i) => {
            const rect = (el as HTMLElement).getBoundingClientRect();
            const topRelativeToFirstContent = rect.top - args.marginTopPx;
            const startPage = Math.floor(topRelativeToFirstContent / args.contentHeightPx);
            const endPage = Math.floor((topRelativeToFirstContent + rect.height - 1) / args.contentHeightPx);
            results.push({
              selector,
              index: i,
              topPx: rect.top,
              heightPx: rect.height,
              startPage,
              endPage,
            });
          });
        }
        return results;
      },
      {
        selectors: KEEP_TOGETHER_SELECTORS,
        contentHeightPx: dims.contentHeightPx,
        marginTopPx: dims.marginTopPx,
      },
    );

    for (const m of measured) {
      // Element taller than one page content area — CSS can't win here.
      if (m.heightPx > dims.contentHeightPx) {
        issues.push({
          id: `${this.id}-exceeds-page-${m.selector.replace('.', '')}-${m.index}`,
          stage: 'stage2_render',
          severity: 'warning',
          rule: this.id,
          message:
            `Keep-together element ${m.selector} #${m.index} is ${Math.round(m.heightPx)}px tall, ` +
            `which exceeds one page's content area (${Math.round(dims.contentHeightPx)}px). ` +
            'It WILL split across pages — `break-inside: avoid` is a hint, not a guarantee.',
          element: m.selector,
          fixSuggestion:
            'Shrink the figure (reduce the SVG viewBox height, lower the caption size) or split it into two smaller figures.',
        });
        continue;
      }

      // Split across physical pages — the composer's break rule didn't
      // take (element sits straddling the boundary).
      //
      // Severity is `warning`, not `error`: the detection is DOM-coord
      // based (pre-pagination), so `break-before: page` on a preceding
      // section manifests as a "split" in the measurement even when the
      // printed PDF actually honors the break. This check is informative
      // but the printed PDF is the authority — treating a likely split
      // as a hard blocker produces frustrating false positives.
      if (m.startPage !== m.endPage) {
        issues.push({
          id: `${this.id}-split-${m.selector.replace('.', '')}-${m.index}`,
          stage: 'stage2_render',
          severity: 'warning',
          rule: this.id,
          message:
            `Keep-together element ${m.selector} #${m.index} looks like it may split across pages ${m.startPage + 1} → ${m.endPage + 1} at the pre-pagination layout stage. ` +
            '`break-inside: avoid` is a STRONG hint but not a guarantee. ' +
            'If the exported PDF shows a clean break, this warning is a false positive (the break-before: page on a preceding section is honored during pagination but not in DOM coords).',
          element: m.selector,
          fixSuggestion:
            'If the printed PDF confirms the split, force a page break before this section via `break_hints: { break_before: "page" }`, or shrink the figure so it fits on one page.',
        });
      }
    }

    return issues;
  }
}
