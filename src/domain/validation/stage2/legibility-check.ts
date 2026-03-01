/**
 * Legibility Check (Stage 2)
 *
 * Uses Playwright to verify that text elements are actually visible
 * and legible in the rendered slide. Checks:
 * - opacity is not zero or near-zero
 * - visibility is not 'hidden'
 * - display is not 'none'
 * - font-size is at least 10px
 */

import type { Stage2Check, ValidationIssue } from '../../../types/validation.js';

interface LegibilityInfo {
  selector: string;
  text: string;
  opacity: number;
  visibility: string;
  display: string;
  fontSize: number;
}

export class LegibilityCheck implements Stage2Check {
  readonly id = 'legibility-check';
  readonly name = 'Text Legibility';

  async run(page: unknown, _soulTokenNames: string[]): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const pwPage = page as import('playwright').Page;

    const elements: LegibilityInfo[] = await pwPage.evaluate(() => {
      const results: LegibilityInfo[] = [];
      const textTags = [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'span', 'a', 'li', 'td', 'th',
        'label', 'strong', 'em', 'b', 'i',
        'blockquote', 'figcaption', 'dt', 'dd',
      ];

      for (const tag of textTags) {
        const els = document.querySelectorAll(tag);
        for (const el of Array.from(els)) {
          const textContent = el.textContent?.trim();
          if (!textContent) continue;

          const computed = window.getComputedStyle(el);

          // Compute effective opacity by walking up the tree
          let effectiveOpacity = parseFloat(computed.opacity) || 0;
          let parent: Element | null = el.parentElement;
          while (parent) {
            const parentOpacity = parseFloat(window.getComputedStyle(parent).opacity);
            if (!isNaN(parentOpacity)) {
              effectiveOpacity *= parentOpacity;
            }
            parent = parent.parentElement;
          }

          results.push({
            selector:
              el.tagName.toLowerCase() +
              (el.className ? '.' + String(el.className).split(/\s+/).join('.') : ''),
            text: textContent.slice(0, 50),
            opacity: effectiveOpacity,
            visibility: computed.visibility,
            display: computed.display,
            fontSize: parseFloat(computed.fontSize) || 0,
          });
        }
      }

      return results;
    });

    for (const el of elements) {
      // Check opacity
      if (el.opacity < 0.1) {
        issues.push({
          id: `${this.id}-${issues.length}`,
          stage: 'stage2_render',
          severity: 'error',
          rule: this.id,
          message: `Text "${el.text}" has effectively zero opacity (${el.opacity.toFixed(2)}). It will be invisible.`,
          element: el.selector,
          expected: 'opacity >= 0.1',
          actual: `opacity: ${el.opacity.toFixed(2)}`,
          fixSuggestion: 'Set opacity to a visible value (e.g. 1) or remove the element if it is intentionally hidden.',
        });
      }

      // Check visibility
      if (el.visibility === 'hidden') {
        issues.push({
          id: `${this.id}-${issues.length}`,
          stage: 'stage2_render',
          severity: 'error',
          rule: this.id,
          message: `Text "${el.text}" has visibility: hidden. It will not be visible.`,
          element: el.selector,
          expected: 'visibility: visible',
          actual: `visibility: ${el.visibility}`,
          fixSuggestion: 'Set visibility to "visible" or remove the element.',
        });
      }

      // Check display
      if (el.display === 'none') {
        issues.push({
          id: `${this.id}-${issues.length}`,
          stage: 'stage2_render',
          severity: 'error',
          rule: this.id,
          message: `Text "${el.text}" has display: none. It will not be rendered.`,
          element: el.selector,
          expected: 'display != none',
          actual: `display: ${el.display}`,
          fixSuggestion: 'Remove display: none or use a different element if the text should be visible.',
        });
      }

      // Check font size
      if (el.fontSize > 0 && el.fontSize < 10) {
        issues.push({
          id: `${this.id}-${issues.length}`,
          stage: 'stage2_render',
          severity: 'warning',
          rule: this.id,
          message: `Text "${el.text}" has font-size ${el.fontSize}px, which is below the 10px minimum for legibility.`,
          element: el.selector,
          expected: '>= 10px',
          actual: `${el.fontSize}px`,
          fixSuggestion: 'Increase font-size to at least 10px for readability on slides.',
        });
      }
    }

    return issues;
  }
}
