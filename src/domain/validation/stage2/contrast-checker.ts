/**
 * Contrast Checker (Stage 2)
 *
 * Uses Playwright to compute actual rendered text colors and background
 * colors, then verifies WCAG 2.1 contrast ratio requirements:
 * - 4.5:1 for normal text (< 24px)
 * - 3:1 for large text (>= 24px or >= 18.66px bold)
 */

import type { Stage2Check, ValidationIssue } from '../../../types/validation.js';

/** sRGB relative luminance per WCAG 2.1 definition. */
function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** WCAG contrast ratio between two relative luminances. */
function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Parse a CSS color string (rgb/rgba) into [r, g, b] components.
 * Returns null if the format is unrecognized.
 */
function parseRgb(color: string): [number, number, number] | null {
  const match = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(color);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

interface TextElementInfo {
  selector: string;
  text: string;
  color: string;
  backgroundColor: string;
  fontSize: number;
  fontWeight: number;
}

export class ContrastChecker implements Stage2Check {
  readonly id = 'contrast-checker';
  readonly name = 'WCAG Contrast';

  async run(page: unknown, _soulTokenNames: string[]): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const pwPage = page as import('playwright').Page;

    const elements: TextElementInfo[] = await pwPage.evaluate(() => {
      const results: TextElementInfo[] = [];
      const textTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'a', 'li', 'td', 'th', 'label', 'strong', 'em', 'b', 'i', 'blockquote', 'figcaption', 'dt', 'dd'];
      const allElements: Element[] = [];

      for (const tag of textTags) {
        allElements.push(...Array.from(document.querySelectorAll(tag)));
      }

      for (const el of allElements) {
        const textContent = el.textContent?.trim();
        if (!textContent) continue;

        const computed = window.getComputedStyle(el);
        const color = computed.color;
        const fontSize = parseFloat(computed.fontSize);
        const fontWeight = parseInt(computed.fontWeight, 10) || 400;

        // Walk up the DOM to find a non-transparent background
        let bg = 'rgba(0, 0, 0, 0)';
        let current: Element | null = el;
        while (current) {
          const currentBg = window.getComputedStyle(current).backgroundColor;
          if (currentBg && currentBg !== 'rgba(0, 0, 0, 0)' && currentBg !== 'transparent') {
            bg = currentBg;
            break;
          }
          current = current.parentElement;
        }

        // Default to white if no background found
        if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
          bg = 'rgb(255, 255, 255)';
        }

        results.push({
          selector: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(/\s+/).join('.') : ''),
          text: textContent.slice(0, 50),
          color,
          backgroundColor: bg,
          fontSize,
          fontWeight,
        });
      }

      return results;
    });

    for (const el of elements) {
      const fg = parseRgb(el.color);
      const bg = parseRgb(el.backgroundColor);
      if (!fg || !bg) continue;

      const fgLum = luminance(fg[0], fg[1], fg[2]);
      const bgLum = luminance(bg[0], bg[1], bg[2]);
      const ratio = contrastRatio(fgLum, bgLum);

      // Large text: >= 24px, or >= 18.66px and bold (weight >= 700)
      const isLargeText = el.fontSize >= 24 || (el.fontSize >= 18.66 && el.fontWeight >= 700);
      const requiredRatio = isLargeText ? 3.0 : 4.5;

      if (ratio < requiredRatio) {
        issues.push({
          id: `${this.id}-${issues.length}`,
          stage: 'stage2_render',
          severity: 'error',
          rule: this.id,
          message: `Text "${el.text}" has insufficient contrast ratio ${ratio.toFixed(2)}:1 (requires ${requiredRatio}:1 for ${isLargeText ? 'large' : 'normal'} text).`,
          element: el.selector,
          expected: `>= ${requiredRatio}:1`,
          actual: `${ratio.toFixed(2)}:1`,
          fixSuggestion: `Increase the contrast between text color (${el.color}) and background (${el.backgroundColor}).`,
        });
      }
    }

    return issues;
  }
}
