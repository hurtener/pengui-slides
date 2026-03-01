/// <reference lib="dom" />

/**
 * Overflow Detector (Stage 2)
 *
 * Uses Playwright to check whether any elements extend beyond the
 * 1920x1080 slide bounds, which would be clipped or invisible in
 * the final presentation.
 */

import type { Stage2Check, ValidationIssue } from '../../../types/validation.js';

const SLIDE_WIDTH = 1920;
const SLIDE_HEIGHT = 1080;

interface OverflowInfo {
  selector: string;
  rect: { left: number; top: number; right: number; bottom: number; width: number; height: number };
}

export class OverflowDetector implements Stage2Check {
  readonly id = 'overflow-detector';
  readonly name = 'Overflow Detection';

  async run(page: unknown, _soulTokenNames: string[]): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const pwPage = page as import('playwright').Page;

    const overflows: OverflowInfo[] = await pwPage.evaluate(
      ([slideW, slideH]: [number, number]) => {
        const results: OverflowInfo[] = [];
        const allElements = document.querySelectorAll('.slide *');

        for (const el of Array.from(allElements)) {
          const rect = el.getBoundingClientRect();

          // Skip zero-size elements
          if (rect.width === 0 || rect.height === 0) continue;

          const overflowsRight = rect.right > slideW;
          const overflowsBottom = rect.bottom > slideH;
          const overflowsLeft = rect.left < 0;
          const overflowsTop = rect.top < 0;

          if (overflowsRight || overflowsBottom || overflowsLeft || overflowsTop) {
            results.push({
              selector:
                el.tagName.toLowerCase() +
                (el.className ? '.' + String(el.className).split(/\s+/).join('.') : ''),
              rect: {
                left: Math.round(rect.left),
                top: Math.round(rect.top),
                right: Math.round(rect.right),
                bottom: Math.round(rect.bottom),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              },
            });
          }
        }

        return results;
      },
      [SLIDE_WIDTH, SLIDE_HEIGHT] as [number, number]
    );

    for (const overflow of overflows) {
      const directions: string[] = [];
      if (overflow.rect.right > SLIDE_WIDTH) directions.push('right');
      if (overflow.rect.bottom > SLIDE_HEIGHT) directions.push('bottom');
      if (overflow.rect.left < 0) directions.push('left');
      if (overflow.rect.top < 0) directions.push('top');

      issues.push({
        id: `${this.id}-${issues.length}`,
        stage: 'stage2_render',
        severity: 'warning',
        rule: this.id,
        message: `Element "${overflow.selector}" overflows the slide bounds (${directions.join(', ')}). Bounding rect: [${overflow.rect.left}, ${overflow.rect.top}, ${overflow.rect.right}, ${overflow.rect.bottom}].`,
        element: overflow.selector,
        expected: `Within 0,0 to ${SLIDE_WIDTH},${SLIDE_HEIGHT}`,
        actual: `[${overflow.rect.left}, ${overflow.rect.top}] to [${overflow.rect.right}, ${overflow.rect.bottom}]`,
        fixSuggestion: 'Adjust element size or position to fit within the 1920x1080 slide bounds.',
      });
    }

    return issues;
  }
}
