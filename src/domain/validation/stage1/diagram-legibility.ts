/**
 * Diagram Legibility Check (Stage 1)
 *
 * Fires only when the slide's @slide-meta `type` is `content_diagram` or
 * `content_chart`. All findings are warnings — they are guidance, not gates.
 *
 * Rules (per SPEC §8.4):
 *
 * 1. SVG must declare a `viewBox` attribute.
 * 2. All `<text>` elements must set `font-size` via a `var(--text-*)` token
 *    reference. Literal px/pt sizes raise a warning.
 * 3. SVG fills on `<rect>` / `<circle>` / `<path>` / `<polygon>` must be
 *    `var(--color-*)` references, or `none` / `transparent` / `currentColor`.
 *    Literal hex colors raise a warning.
 * 4. If the SVG has more than 2 data-series elements (heuristic: `<rect>`s
 *    OR `<path class="series">` count > 2), a legend element must be present.
 *    Raise a warning if missing.
 * 5. If a legend element is present, all legend swatches must use fills that
 *    are `var(--color-*)` references (same rule as #3).
 *
 * Performance target: < 20ms on a typical slide (no Playwright, pure cheerio).
 */

import * as cheerio from 'cheerio';
import type { Stage1Check, ValidationIssue } from '../../../types/validation.js';

// ── Helpers ──────────────────────────────────────────────────────

const SLIDE_META_REGEX = /<!--\s*@slide-meta\s+([\s\S]*?)-->/;

/**
 * Diagram slide types that trigger this check.
 */
const DIAGRAM_TYPES = new Set(['content_diagram', 'content_chart']);

/**
 * Return the `type` field from the @slide-meta JSON, or `null` if not parseable.
 */
function extractSlideType(html: string): string | null {
  const match = SLIDE_META_REGEX.exec(html);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim()) as Record<string, unknown>;
    return typeof parsed.type === 'string' ? parsed.type : null;
  } catch {
    return null;
  }
}

/**
 * Return `true` if the value is an allowed non-token fill:
 * `none`, `transparent`, or `currentColor` (case-insensitive).
 */
function isAllowedNonTokenFill(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === 'none' || v === 'transparent' || v === 'currentcolor';
}

/**
 * Return `true` if the value is a valid `var(--color-*)` or `var(--color-category-*)` token reference.
 */
function isColorTokenRef(value: string): boolean {
  return /var\(\s*--color-[\w-]+/.test(value);
}

/**
 * Return `true` if the value looks like a literal hex color.
 */
function isLiteralHex(value: string): boolean {
  return /#[0-9a-fA-F]{3,8}\b/.test(value);
}

/**
 * Return `true` if the font-size value references a `var(--text-*)` token.
 */
function isTextTokenRef(value: string): boolean {
  return /var\(\s*--text-[\w-]+/.test(value);
}

/**
 * Return `true` if the font-size value is a literal pixel or point size.
 */
function isLiteralFontSize(value: string): boolean {
  return /\d+\s*(px|pt)/.test(value);
}

// ── Check Implementation ─────────────────────────────────────────

export class DiagramLegibilityCheck implements Stage1Check {
  readonly id = 'diagram-legibility';
  readonly name = 'Diagram Legibility';

  run(html: string, _soulTokenNames: string[], _allowedFonts: string[]): ValidationIssue[] {
    // Only run for diagram/chart slide types
    const slideType = extractSlideType(html);
    if (!slideType || !DIAGRAM_TYPES.has(slideType)) {
      return [];
    }

    const issues: ValidationIssue[] = [];
    const $ = cheerio.load(html);

    // ── Rule 1: SVG viewBox ────────────────────────────────────────
    const svgs = $('svg');
    svgs.each((_, svgEl) => {
      const viewBox = $(svgEl).attr('viewBox');
      if (!viewBox) {
        issues.push({
          id: `${this.id}-no-viewbox`,
          stage: 'stage1_lint',
          severity: 'warning',
          rule: this.id,
          message: 'SVG element is missing a `viewBox` attribute. Add viewBox so the diagram scales correctly across different container sizes.',
          element: 'svg',
          fixSuggestion: 'Add viewBox="0 0 <width> <height>" to the <svg> opening tag.',
        });
      }
    });

    // ── Rule 2: <text> font-size must use var(--text-*) ───────────
    $('text').each((_, textEl) => {
      // Check inline font-size attribute
      const attrFontSize = $(textEl).attr('font-size');
      if (attrFontSize && isLiteralFontSize(attrFontSize) && !isTextTokenRef(attrFontSize)) {
        issues.push({
          id: `${this.id}-literal-font-size-attr`,
          stage: 'stage1_lint',
          severity: 'warning',
          rule: this.id,
          message: `SVG <text> element uses a literal font-size attribute ("${attrFontSize}"). Use font-size="var(--text-caption)" or similar soul typography token instead.`,
          element: 'text',
          actual: attrFontSize,
          fixSuggestion: 'Replace the literal font-size attribute value with a CSS var(--text-*) token reference.',
        });
      }

      // Check inline style font-size
      const style = $(textEl).attr('style') ?? '';
      const styleMatch = /font-size\s*:\s*([^;]+)/i.exec(style);
      if (styleMatch) {
        const styleFs = styleMatch[1].trim();
        if (isLiteralFontSize(styleFs) && !isTextTokenRef(styleFs)) {
          issues.push({
            id: `${this.id}-literal-font-size-style`,
            stage: 'stage1_lint',
            severity: 'warning',
            rule: this.id,
            message: `SVG <text> element uses a literal font-size in its style attribute ("${styleFs}"). Use var(--text-*) token references.`,
            element: 'text',
            actual: styleFs,
            fixSuggestion: 'Replace the literal font-size value with a CSS var(--text-*) token reference.',
          });
        }
      }
    });

    // ── Rule 3: fills on shape elements must be token refs or allowed values ──
    const shapeSelectors = ['rect', 'circle', 'path', 'polygon'];

    for (const selector of shapeSelectors) {
      $(selector).each((_, shapeEl) => {
        const fillAttr = $(shapeEl).attr('fill');
        if (fillAttr && !isAllowedNonTokenFill(fillAttr) && !isColorTokenRef(fillAttr)) {
          if (isLiteralHex(fillAttr)) {
            issues.push({
              id: `${this.id}-literal-fill-${selector}`,
              stage: 'stage1_lint',
              severity: 'warning',
              rule: this.id,
              message: `SVG <${selector}> uses a literal hex fill color ("${fillAttr}"). Use a soul color token: fill="var(--color-*)" or fill="var(--color-category-a)" etc.`,
              element: selector,
              actual: fillAttr,
              fixSuggestion: `Replace fill="${fillAttr}" with a var(--color-*) reference to stay consistent with the soul's color system.`,
            });
          }
        }
      });
    }

    // ── Rules 4 & 5: legend presence and legend swatch compliance ──
    const legendEl = $('g.legend, g#legend');
    const hasLegend = legendEl.length > 0;

    // Count data-series heuristic: standalone <rect>s NOT inside .legend + <path class="series">
    const seriesRects = $('rect').not(legendEl.find('rect')).not($('g.legend rect')).not($('g#legend rect'));
    const seriesPaths = $('path.series');
    const seriesCount = seriesRects.length + seriesPaths.length;

    if (seriesCount > 2 && !hasLegend) {
      issues.push({
        id: `${this.id}-missing-legend`,
        stage: 'stage1_lint',
        severity: 'warning',
        rule: this.id,
        message: `Chart appears to have ${seriesCount} data-series elements but no legend element was found. Add <g class="legend"> with color swatches and labels for each series.`,
        element: 'svg',
        fixSuggestion: 'Add a <g class="legend"> group with <rect> swatches (fill="var(--color-*)") and matching <text> labels for each data series.',
      });
    }

    if (hasLegend) {
      legendEl.find('rect, circle, path, polygon').each((_, swatchEl) => {
        const fill = $(swatchEl).attr('fill');
        if (fill && !isAllowedNonTokenFill(fill) && !isColorTokenRef(fill) && isLiteralHex(fill)) {
          issues.push({
            id: `${this.id}-legend-literal-fill`,
            stage: 'stage1_lint',
            severity: 'warning',
            rule: this.id,
            message: `Legend swatch uses a literal hex fill ("${fill}") that doesn't reference a soul color token. Legend swatches must match chart fills via var(--color-*) references.`,
            element: $(swatchEl).prop('tagName') ?? 'shape',
            actual: fill,
            fixSuggestion: 'Update legend swatch fills to use the same var(--color-*) token as the corresponding chart bar/slice/line.',
          });
        }
      });
    }

    return issues;
  }
}
