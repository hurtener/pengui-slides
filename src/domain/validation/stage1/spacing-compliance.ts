/**
 * Spacing Compliance Check (Stage 1)
 *
 * Ensures spacing properties (padding, margin, gap) use design token
 * variables (var(--space-*)) rather than literal px/rem values.
 */

import * as cheerio from 'cheerio';
import postcss from 'postcss';
import type { Stage1Check, ValidationIssue } from '../../../types/validation.js';

const SPACING_PROPERTIES = new Set([
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'gap',
  'row-gap',
  'column-gap',
]);

/** Values that are always allowed without a token reference. */
const ALLOWED_VALUES = new Set([
  '0',
  '0px',
  'auto',
  'inherit',
  'initial',
  'unset',
]);

/** Pattern matching literal px or rem values. */
const LITERAL_SPACING_PATTERN = /\b\d+(\.\d+)?\s*(px|rem|em)\b/;

/**
 * Check whether a single CSS value segment contains a literal spacing value.
 */
function hasLiteralSpacing(value: string): boolean {
  const trimmed = value.trim().toLowerCase();

  if (ALLOWED_VALUES.has(trimmed)) {
    return false;
  }

  // Token-based values are fine
  if (trimmed.includes('var(')) {
    return false;
  }

  // calc() containing only var() references is fine
  if (trimmed.startsWith('calc(') && !LITERAL_SPACING_PATTERN.test(trimmed)) {
    return false;
  }

  return LITERAL_SPACING_PATTERN.test(trimmed);
}

export class SpacingComplianceCheck implements Stage1Check {
  readonly id = 'spacing-compliance';
  readonly name = 'Spacing Compliance';

  run(html: string, _soulTokenNames: string[], _allowedFonts: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const $ = cheerio.load(html);

    $('style').each((_i, el) => {
      const cssText = $(el).text();
      if (!cssText.trim()) return;

      let root: postcss.Root;
      try {
        root = postcss.parse(cssText);
      } catch {
        return;
      }

      root.walkDecls((decl) => {
        const prop = decl.prop.toLowerCase();
        if (!SPACING_PROPERTIES.has(prop)) return;

        if (hasLiteralSpacing(decl.value)) {
          issues.push({
            id: `${this.id}-${issues.length}`,
            stage: 'stage1_lint',
            severity: 'warning',
            rule: this.id,
            message: `Property "${prop}" uses a literal spacing value instead of a token variable.`,
            element: decl.parent?.type === 'rule' ? (decl.parent as postcss.Rule).selector : undefined,
            expected: 'var(--space-*)',
            actual: decl.value,
            line: decl.source?.start?.line,
            fixSuggestion: `Replace literal spacing with a var(--space-*) token (e.g. var(--space-md)).`,
          });
        }
      });
    });

    return issues;
  }
}
