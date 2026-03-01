/**
 * Token Compliance Check (Stage 1)
 *
 * Ensures all color-related CSS values use design token variables
 * (var(--token)) rather than literal color values.
 */

import * as cheerio from 'cheerio';
import postcss from 'postcss';
import type { Stage1Check, ValidationIssue } from '../../../types/validation.js';

const COLOR_PROPERTIES = new Set([
  'color',
  'background',
  'background-color',
  'border-color',
  'box-shadow',
  'text-shadow',
  'outline-color',
  'fill',
  'stroke',
]);

/** Values that are always allowed without a token reference. */
const ALLOWED_LITERALS = new Set([
  'transparent',
  'inherit',
  'currentcolor',
  'none',
  'initial',
  'unset',
]);

/** Patterns that indicate a literal color (not a token). */
const LITERAL_COLOR_PATTERNS = [
  /^#([0-9a-fA-F]{3,8})$/,          // hex
  /^rgb\s*\(/,                        // rgb()
  /^rgba\s*\(/,                       // rgba()
  /^hsl\s*\(/,                        // hsl()
  /^hsla\s*\(/,                       // hsla()
];

function isLiteralColor(value: string): boolean {
  const trimmed = value.trim().toLowerCase();

  if (ALLOWED_LITERALS.has(trimmed)) {
    return false;
  }

  // If the value contains var(), it is token-based
  if (trimmed.includes('var(')) {
    return false;
  }

  for (const pattern of LITERAL_COLOR_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  return false;
}

/**
 * For properties like box-shadow / text-shadow / background that may have
 * multiple segments, split by commas and check each segment for literal colors.
 */
function containsLiteralColor(fullValue: string): string | null {
  // Split composite values by whitespace to find individual color tokens
  const segments = fullValue.split(/\s+/);
  for (const seg of segments) {
    // Also handle comma-separated values (e.g. multi-shadow)
    const parts = seg.split(',');
    for (const part of parts) {
      if (isLiteralColor(part.trim())) {
        return part.trim();
      }
    }
  }
  return null;
}

export class TokenComplianceCheck implements Stage1Check {
  readonly id = 'token-compliance';
  readonly name = 'Token Compliance';

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
        // If CSS is unparseable, structural-check will flag it
        return;
      }

      root.walkDecls((decl) => {
        const prop = decl.prop.toLowerCase();
        if (!COLOR_PROPERTIES.has(prop)) return;

        const literal = containsLiteralColor(decl.value);
        if (literal) {
          issues.push({
            id: `${this.id}-${issues.length}`,
            stage: 'stage1_lint',
            severity: 'error',
            rule: this.id,
            message: `Property "${prop}" uses literal color "${literal}" instead of a design token variable.`,
            element: decl.parent?.type === 'rule' ? (decl.parent as postcss.Rule).selector : undefined,
            expected: 'var(--<token-name>)',
            actual: literal,
            line: decl.source?.start?.line,
            fixSuggestion: `Replace "${literal}" with a var(--<token-name>) reference from the Design Soul.`,
          });
        }
      });
    });

    return issues;
  }
}
