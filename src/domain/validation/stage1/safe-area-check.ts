/**
 * Safe Area Check (Stage 1)
 *
 * Verifies the root slide container declares the correct
 * dimensions (1920x1080) for the presentation canvas.
 */

import * as cheerio from 'cheerio';
import postcss from 'postcss';
import type { Stage1Check, ValidationIssue } from '../../../types/validation.js';

const EXPECTED_WIDTH = '1920px';
const EXPECTED_HEIGHT = '1080px';
const EXPECTED_SAFE_AREA_TOKEN = 'var(--space-safe-area)';

export class SafeAreaCheck implements Stage1Check {
  readonly id = 'safe-area-check';
  readonly name = 'Safe Area Dimensions';

  run(html: string, _soulTokenNames: string[], _allowedFonts: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const $ = cheerio.load(html);

    // Collect all CSS rules that target .slide
    let foundWidth = false;
    let foundHeight = false;
    let foundSafeAreaInset = false;
    let actualWidth: string | undefined;
    let actualHeight: string | undefined;
    let actualSafeAreaInset: string | undefined;

    $('style').each((_i, el) => {
      const cssText = $(el).text();
      if (!cssText.trim()) return;

      let root: postcss.Root;
      try {
        root = postcss.parse(cssText);
      } catch {
        return;
      }

      root.walkRules((rule) => {
        // Check if the selector targets the .slide root container
        const selectors = rule.selector.split(',').map((s) => s.trim());
        const targetsSlide = selectors.some(
          (s) => s === '.slide' || s === 'div.slide' || s === '.slide:root'
        );

        if (!targetsSlide) return;

        rule.walkDecls('width', (decl) => {
          foundWidth = true;
          actualWidth = decl.value.trim();
        });

        rule.walkDecls('height', (decl) => {
          foundHeight = true;
          actualHeight = decl.value.trim();
        });

        rule.walkDecls(/^padding(?:-(top|right|bottom|left))?$/, (decl) => {
          if (decl.value.includes('--space-safe-area')) {
            foundSafeAreaInset = true;
            actualSafeAreaInset = decl.value.trim();
          }
        });
      });
    });

    // Also check inline style on the .slide element
    const slideEl = $('div.slide');
    if (slideEl.length > 0) {
      const inlineStyle = slideEl.attr('style');
      if (inlineStyle) {
        const widthMatch = /width\s*:\s*([^;]+)/i.exec(inlineStyle);
        const heightMatch = /height\s*:\s*([^;]+)/i.exec(inlineStyle);
        if (widthMatch) {
          foundWidth = true;
          actualWidth = widthMatch[1].trim();
        }
        if (heightMatch) {
          foundHeight = true;
          actualHeight = heightMatch[1].trim();
        }
        const paddingMatch = /padding(?:-[a-z]+)?\s*:\s*([^;]+)/i.exec(inlineStyle);
        if (paddingMatch && paddingMatch[1].includes('--space-safe-area')) {
          foundSafeAreaInset = true;
          actualSafeAreaInset = paddingMatch[1].trim();
        }
      }
    }

    if (!foundWidth) {
      issues.push({
        id: `${this.id}-width-missing`,
        stage: 'stage1_lint',
        severity: 'warning',
        rule: this.id,
        message: `Root .slide container is missing a width declaration. Expected ${EXPECTED_WIDTH}.`,
        expected: EXPECTED_WIDTH,
        fixSuggestion: `Add "width: ${EXPECTED_WIDTH}" to the .slide CSS rule.`,
      });
    } else if (actualWidth && actualWidth !== EXPECTED_WIDTH) {
      issues.push({
        id: `${this.id}-width-mismatch`,
        stage: 'stage1_lint',
        severity: 'warning',
        rule: this.id,
        message: `Root .slide container width is "${actualWidth}", expected "${EXPECTED_WIDTH}".`,
        expected: EXPECTED_WIDTH,
        actual: actualWidth,
        fixSuggestion: `Set "width: ${EXPECTED_WIDTH}" on the .slide container.`,
      });
    }

    if (!foundHeight) {
      issues.push({
        id: `${this.id}-height-missing`,
        stage: 'stage1_lint',
        severity: 'warning',
        rule: this.id,
        message: `Root .slide container is missing a height declaration. Expected ${EXPECTED_HEIGHT}.`,
        expected: EXPECTED_HEIGHT,
        fixSuggestion: `Add "height: ${EXPECTED_HEIGHT}" to the .slide CSS rule.`,
      });
    } else if (actualHeight && actualHeight !== EXPECTED_HEIGHT) {
      issues.push({
        id: `${this.id}-height-mismatch`,
        stage: 'stage1_lint',
        severity: 'warning',
        rule: this.id,
        message: `Root .slide container height is "${actualHeight}", expected "${EXPECTED_HEIGHT}".`,
        expected: EXPECTED_HEIGHT,
        actual: actualHeight,
        fixSuggestion: `Set "height: ${EXPECTED_HEIGHT}" on the .slide container.`,
      });
    }

    if (!foundSafeAreaInset) {
      issues.push({
        id: `${this.id}-safe-area-missing`,
        stage: 'stage1_lint',
        severity: 'error',
        rule: this.id,
        message: 'Root .slide container is missing the required safe-area inset token.',
        expected: EXPECTED_SAFE_AREA_TOKEN,
        fixSuggestion: 'Set padding on the .slide container using var(--space-safe-area).',
      });
    } else if (actualSafeAreaInset && !actualSafeAreaInset.includes('--space-safe-area')) {
      issues.push({
        id: `${this.id}-safe-area-mismatch`,
        stage: 'stage1_lint',
        severity: 'error',
        rule: this.id,
        message: `Root .slide container safe-area inset is "${actualSafeAreaInset}", expected "${EXPECTED_SAFE_AREA_TOKEN}".`,
        expected: EXPECTED_SAFE_AREA_TOKEN,
        actual: actualSafeAreaInset,
        fixSuggestion: 'Use var(--space-safe-area) for the slide padding to preserve the required inset.',
      });
    }

    return issues;
  }
}
