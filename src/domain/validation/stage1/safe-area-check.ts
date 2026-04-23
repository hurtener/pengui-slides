/**
 * Safe Area Check (Stage 1)
 *
 * Verifies the root slide container declares the dimensions that match
 * the deck's format geometry. When geometry is not supplied, the check
 * falls back to the slides_16_9 defaults (1920×1080) so pre-v2.0 callers
 * and existing tests see byte-identical behavior.
 */

import * as cheerio from 'cheerio';
import postcss from 'postcss';
import { FORMAT_REGISTRY } from '../../formats/format-registry.js';
import type { Stage1Check, ValidationContext, ValidationIssue } from '../../../types/validation.js';

const EXPECTED_SAFE_AREA_TOKEN = 'var(--space-safe-area)';
const DEFAULT_GEOMETRY = FORMAT_REGISTRY.slides_16_9.geometry;

export class SafeAreaCheck implements Stage1Check {
  readonly id = 'safe-area-check';
  readonly name = 'Safe Area Dimensions';

  run(
    html: string,
    _soulTokenNames: string[],
    _allowedFonts: string[],
    context?: ValidationContext,
  ): ValidationIssue[] {
    const geometry = context?.geometry ?? DEFAULT_GEOMETRY;
    const expectedWidth = `${geometry.widthPx}px`;
    const expectedHeight = `${geometry.heightPx}px`;
    // Human-readable phrase naming the deck format, appended to each
    // message so the LLM doesn't have to infer why these dimensions.
    const formatNote = context?.formatKind
      ? ` (deck format: ${context.formatKind})`
      : '';
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
        message: `Root .slide container is missing a width declaration. Expected ${expectedWidth}${formatNote}.`,
        expected: expectedWidth,
        fixSuggestion: `Add "width: ${expectedWidth}" to the .slide CSS rule.`,
      });
    } else if (actualWidth && actualWidth !== expectedWidth) {
      issues.push({
        id: `${this.id}-width-mismatch`,
        stage: 'stage1_lint',
        severity: 'warning',
        rule: this.id,
        message: `Root .slide container width is "${actualWidth}", expected "${expectedWidth}"${formatNote}.`,
        expected: expectedWidth,
        actual: actualWidth,
        fixSuggestion: `Set "width: ${expectedWidth}" on the .slide container.`,
      });
    }

    if (!foundHeight) {
      issues.push({
        id: `${this.id}-height-missing`,
        stage: 'stage1_lint',
        severity: 'warning',
        rule: this.id,
        message: `Root .slide container is missing a height declaration. Expected ${expectedHeight}${formatNote}.`,
        expected: expectedHeight,
        fixSuggestion: `Add "height: ${expectedHeight}" to the .slide CSS rule.`,
      });
    } else if (actualHeight && actualHeight !== expectedHeight) {
      issues.push({
        id: `${this.id}-height-mismatch`,
        stage: 'stage1_lint',
        severity: 'warning',
        rule: this.id,
        message: `Root .slide container height is "${actualHeight}", expected "${expectedHeight}"${formatNote}.`,
        expected: expectedHeight,
        actual: actualHeight,
        fixSuggestion: `Set "height: ${expectedHeight}" on the .slide container.`,
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
