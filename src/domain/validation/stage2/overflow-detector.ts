/// <reference lib="dom" />

/**
 * Overflow Detector (Stage 2)
 *
 * Uses Playwright to check whether any elements extend beyond the deck's
 * canvas bounds, which would be clipped or invisible in the final output.
 * Canvas dimensions are derived from the deck's format geometry passed in
 * via ValidationContext; omission falls back to slides_16_9 defaults
 * (1920×1080 with 48px safe area) so pre-v2.0 callers see identical
 * behavior.
 */

import { FORMAT_REGISTRY } from '../../formats/format-registry.js';
import type { Stage2Check, ValidationContext, ValidationIssue } from '../../../types/validation.js';

const DEFAULT_GEOMETRY = FORMAT_REGISTRY.slides_16_9.geometry;

interface OverflowInfo {
  selector: string;
  rect: { left: number; top: number; right: number; bottom: number; width: number; height: number };
}

export class OverflowDetector implements Stage2Check {
  readonly id = 'overflow-detector';
  readonly name = 'Overflow Detection';

  async run(
    page: unknown,
    _soulTokenNames: string[],
    context?: ValidationContext,
  ): Promise<ValidationIssue[]> {
    const geometry = context?.geometry ?? DEFAULT_GEOMETRY;
    const slideWidth = geometry.widthPx;
    const slideHeight = geometry.heightPx;
    const safeInset = geometry.safeAreaInsetPx;

    const issues: ValidationIssue[] = [];
    const pwPage = page as import('playwright').Page;

    const overflows: OverflowInfo[] = await pwPage.evaluate(
      ([slideW, slideH, inset]: [number, number, number]) => {
        const results: OverflowInfo[] = [];
        const slide = document.querySelector('.slide');
        if (!slide) return results;

        // Measure all child rects in the SLIDE's coordinate system rather
        // than the viewport's. This way the check is independent of any
        // body/html margin, browser UA defaults, or wrapper offsets: the
        // slide's top-left is always (0, 0) in our measurement frame.
        const slideRect = slide.getBoundingClientRect();
        const allElements = slide.querySelectorAll('*');

        for (const el of Array.from(allElements)) {
          const r = el.getBoundingClientRect();

          // Skip zero-size elements
          if (r.width === 0 || r.height === 0) continue;

          const left = r.left - slideRect.left;
          const top = r.top - slideRect.top;
          const right = r.right - slideRect.left;
          const bottom = r.bottom - slideRect.top;

          const overflowsRight = right > slideW - inset;
          const overflowsBottom = bottom > slideH - inset;
          const overflowsLeft = left < inset;
          const overflowsTop = top < inset;

          if (overflowsRight || overflowsBottom || overflowsLeft || overflowsTop) {
            results.push({
              selector:
                el.tagName.toLowerCase() +
                (el.className ? '.' + String(el.className).split(/\s+/).join('.') : ''),
              rect: {
                left: Math.round(left),
                top: Math.round(top),
                right: Math.round(right),
                bottom: Math.round(bottom),
                width: Math.round(r.width),
                height: Math.round(r.height),
              },
            });
          }
        }

        return results;
      },
      [slideWidth, slideHeight, safeInset] as [number, number, number],
    );

    for (const overflow of overflows) {
      const directions: string[] = [];
      if (overflow.rect.right > slideWidth) directions.push('right');
      if (overflow.rect.bottom > slideHeight) directions.push('bottom');
      if (overflow.rect.left < 0) directions.push('left');
      if (overflow.rect.top < 0) directions.push('top');

      issues.push({
        id: `${this.id}-${issues.length}`,
        stage: 'stage2_render',
        severity: 'error',
        rule: this.id,
        message: `Element "${overflow.selector}" overflows the safe area (${directions.join(', ')}). Bounding rect: [${overflow.rect.left}, ${overflow.rect.top}, ${overflow.rect.right}, ${overflow.rect.bottom}].`,
        element: overflow.selector,
        expected: `Within ${safeInset},${safeInset} to ${slideWidth - safeInset},${slideHeight - safeInset}`,
        actual: `[${overflow.rect.left}, ${overflow.rect.top}] to [${overflow.rect.right}, ${overflow.rect.bottom}]`,
        fixSuggestion: 'Adjust element size or position so all content stays inside the safe-area inset.',
      });
    }

    return issues;
  }
}
