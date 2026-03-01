/// <reference lib="dom" />

/**
 * Color Sampler (Stage 2)
 *
 * Uses Playwright to read the actual rendered backgroundColor of
 * elements and compares them against the expected design token values
 * resolved from custom properties.
 */

import type { Stage2Check, ValidationIssue } from '../../../types/validation.js';

interface ColorSample {
  selector: string;
  property: string;
  computed: string;
  expected: string;
}

/**
 * Normalize a CSS color string to a consistent rgb() format for comparison.
 */
function normalizeColor(color: string): string {
  return color.replace(/\s+/g, '').toLowerCase();
}

export class ColorSampler implements Stage2Check {
  readonly id = 'color-sampler';
  readonly name = 'Color Sampling';

  async run(page: unknown, soulTokenNames: string[]): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];
    const pwPage = page as import('playwright').Page;

    const samples: ColorSample[] = await pwPage.evaluate(
      (tokenNames: string[]) => {
        const results: ColorSample[] = [];
        const root = document.documentElement;
        const rootStyles = window.getComputedStyle(root);

        // Build a map of token name -> resolved value
        const tokenValues = new Map<string, string>();
        for (const name of tokenNames) {
          const value = rootStyles.getPropertyValue(name).trim();
          if (value) {
            tokenValues.set(name, value);
          }
        }

        // Check elements that have background-color set
        const elements = document.querySelectorAll('.slide, .slide *');
        for (const el of Array.from(elements)) {
          const computed = window.getComputedStyle(el);
          const bgColor = computed.backgroundColor;

          // Skip transparent backgrounds
          if (!bgColor || bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') continue;

          // Check if this element's background-color comes from a token
          // by reading the element's inline/computed token reference
          const elStyles = window.getComputedStyle(el);
          const bgProp = elStyles.backgroundColor;

          // Compare the computed background-color against known token values
          let matchedToken: string | null = null;
          for (const [tokenName, tokenValue] of tokenValues) {
            // Create a temporary element to resolve the token value to rgb
            const temp = document.createElement('div');
            temp.style.color = tokenValue;
            document.body.appendChild(temp);
            const resolvedTokenColor = window.getComputedStyle(temp).color;
            document.body.removeChild(temp);

            if (resolvedTokenColor === bgProp) {
              matchedToken = tokenName;
              break;
            }
          }

          // If we found a matching token, verify the computed value matches
          if (matchedToken) {
            const expectedValue = tokenValues.get(matchedToken) || '';
            // Create a temp element to get the expected rgb value
            const temp = document.createElement('div');
            temp.style.backgroundColor = expectedValue;
            document.body.appendChild(temp);
            const expectedComputed = window.getComputedStyle(temp).backgroundColor;
            document.body.removeChild(temp);

            if (bgColor !== expectedComputed) {
              results.push({
                selector:
                  el.tagName.toLowerCase() +
                  (el.className ? '.' + String(el.className).split(/\s+/).join('.') : ''),
                property: 'background-color',
                computed: bgColor,
                expected: expectedComputed,
              });
            }
          }
        }

        return results;
      },
      soulTokenNames
    );

    for (const sample of samples) {
      const computedNorm = normalizeColor(sample.computed);
      const expectedNorm = normalizeColor(sample.expected);

      if (computedNorm !== expectedNorm) {
        issues.push({
          id: `${this.id}-${issues.length}`,
          stage: 'stage2_render',
          severity: 'warning',
          rule: this.id,
          message: `Element "${sample.selector}" rendered ${sample.property} as "${sample.computed}" but expected "${sample.expected}".`,
          element: sample.selector,
          expected: sample.expected,
          actual: sample.computed,
          fixSuggestion: `Verify the design token resolves to the correct color value. Check for CSS specificity overrides.`,
        });
      }
    }

    return issues;
  }
}
