/**
 * Font Compliance Check (Stage 1)
 *
 * Ensures all font-family declarations reference only fonts approved
 * by the Design Soul or generic CSS font families.
 */

import * as cheerio from 'cheerio';
import postcss from 'postcss';
import type { Stage1Check, ValidationIssue } from '../../../types/validation.js';

/** CSS generic font families that are always allowed. */
const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
]);

/**
 * Parse a font-family value into individual family names.
 * Strips quotes and trims whitespace.
 */
function parseFontFamilies(value: string): string[] {
  // If the value is a var() reference, it is token-based and allowed
  if (value.trim().toLowerCase().startsWith('var(')) {
    return [];
  }

  return value
    .split(',')
    .map((f) => f.trim().replace(/^["']|["']$/g, '').trim())
    .filter(Boolean);
}

export class FontComplianceCheck implements Stage1Check {
  readonly id = 'font-compliance';
  readonly name = 'Font Compliance';

  run(html: string, _soulTokenNames: string[], allowedFonts: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const $ = cheerio.load(html);

    const allowedLower = new Set(allowedFonts.map((f) => f.toLowerCase()));

    $('style').each((_i, el) => {
      const cssText = $(el).text();
      if (!cssText.trim()) return;

      let root: postcss.Root;
      try {
        root = postcss.parse(cssText);
      } catch {
        return;
      }

      root.walkDecls('font-family', (decl) => {
        const families = parseFontFamilies(decl.value);

        for (const family of families) {
          const familyLower = family.toLowerCase();

          // Generic families are always allowed
          if (GENERIC_FAMILIES.has(familyLower)) continue;

          // Allowed by the Design Soul
          if (allowedLower.has(familyLower)) continue;

          // var() references handled in parseFontFamilies
          if (familyLower.startsWith('var(')) continue;

          // inherit / initial / unset
          if (['inherit', 'initial', 'unset'].includes(familyLower)) continue;

          issues.push({
            id: `${this.id}-${issues.length}`,
            stage: 'stage1_lint',
            severity: 'error',
            rule: this.id,
            message: `Font family "${family}" is not in the allowed fonts list.`,
            element: decl.parent?.type === 'rule' ? (decl.parent as postcss.Rule).selector : undefined,
            expected: `One of: ${allowedFonts.join(', ')}`,
            actual: family,
            line: decl.source?.start?.line,
            fixSuggestion: `Use an allowed font family: ${allowedFonts.join(', ')} or a generic family (serif, sans-serif, monospace, etc.).`,
          });
        }
      });
    });

    return issues;
  }
}
