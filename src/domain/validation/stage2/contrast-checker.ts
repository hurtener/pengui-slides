/// <reference lib="dom" />

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
  /** True when the element (or any ancestor) carries a `pengui-text-{role}`
   *  class — i.e. the agent explicitly chose this color via a RichText
   *  `color:` flag. False when the color came from the default cascade. */
  deliberateColor: boolean;
  /** The semantic role from the pengui-text-{role} class, when applicable.
   *  Used to suggest concrete alternatives in the fix message. */
  deliberateColorRole: string | null;
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

        // Walk self + ancestors to detect a `pengui-text-{role}` class —
        // these are emitted by the RichText renderer ONLY when the agent
        // sets `color:` explicitly on a run, so their presence means the
        // contrast trade-off is intentional.
        let deliberateRole: string | null = null;
        for (let cur: Element | null = el; cur && !deliberateRole; cur = cur.parentElement) {
          for (const cls of Array.from(cur.classList)) {
            if (cls.startsWith('pengui-text-')) {
              deliberateRole = cls.slice('pengui-text-'.length);
              break;
            }
          }
        }

        results.push({
          selector: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(/\s+/).join('.') : ''),
          text: textContent.slice(0, 50),
          color,
          backgroundColor: bg,
          fontSize,
          fontWeight,
          deliberateColor: deliberateRole !== null,
          deliberateColorRole: deliberateRole,
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
        // Severity model:
        //  - Default-cascade text below WCAG = ERROR (the slide may be
        //    unreadable by accident, blocks export).
        //  - Explicitly colored runs (`<span class="pengui-text-{role}">`)
        //    below WCAG = WARNING (the agent chose the role; this is a
        //    design trade-off, not a structural failure). Surface the
        //    diagnostic so the agent can decide, but don't block.
        const severity: 'error' | 'warning' = el.deliberateColor ? 'warning' : 'error';

        const baseMessage = `Text "${el.text}" has insufficient contrast ratio ${ratio.toFixed(2)}:1 (requires ${requiredRatio}:1 for ${isLargeText ? 'large' : 'normal'} text).`;
        const message = el.deliberateColor
          ? `${baseMessage} The color was chosen explicitly via \`color: '${el.deliberateColorRole}'\` — this is a deliberate trade-off, not blocking.`
          : baseMessage;

        const fixSuggestion = el.deliberateColor
          ? `If you want to keep the colored emphasis, increasing font size to >=24px (or >=18.66px with bold) lowers the required ratio to 3:1. Otherwise drop the \`color\` flag (default text color is contrast-safe by design) or try a higher-contrast role: \`success\` and \`error\` are usually darker than \`accent\` / \`accent_warm\` on warm canvases.`
          : `Increase the contrast between text color (${el.color}) and background (${el.backgroundColor}). If this is body text, the default cascade should already be safe — check whether a parent class is overriding the text color.`;

        issues.push({
          id: `${this.id}-${issues.length}`,
          stage: 'stage2_render',
          severity,
          rule: this.id,
          message,
          element: el.selector,
          expected: `>= ${requiredRatio}:1`,
          actual: `${ratio.toFixed(2)}:1`,
          fixSuggestion,
        });
      }
    }

    return issues;
  }
}
