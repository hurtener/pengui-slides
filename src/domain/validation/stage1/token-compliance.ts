/**
 * Token Compliance Check (Stage 1)
 *
 * Ensures all color-related CSS values use design token variables
 * (var(--token)) rather than literal color values.
 */

import * as cheerio from 'cheerio';
import postcss from 'postcss';
import type { Stage1Check, ValidationContext, ValidationIssue } from '../../../types/validation.js';
import { normalizeHex } from '../../souls/color-token-lookup.js';

/**
 * Build the fix suggestion for a literal-color violation. When the active
 * soul declares the same hex value under a known token, we name the token
 * directly so an agent can do a one-character substitution rather than
 * grep through `get_design_soul`.
 */
function buildLiteralColorFixSuggestion(
  literal: string,
  prop: string,
  context?: ValidationContext,
): string {
  const lookup = context?.colorTokenLookup;
  const normalized = normalizeHex(literal);
  if (lookup && normalized) {
    const tokenName = lookup.get(normalized);
    if (tokenName) {
      return (
        `Replace "${literal}" with var(${tokenName}) — the active soul declares this exact color as ${tokenName}. ` +
        `Example: ${prop}: var(${tokenName});`
      );
    }
  }
  return (
    `Replace "${literal}" with a var(--<token-name>) reference from the Design Soul. ` +
    `Call get_design_soul to see the soul's token catalogue (closest matches by hue first).`
  );
}

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

const VAR_REFERENCE_REGEX = /var\(\s*(--[A-Za-z0-9_-]+)/g;

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

function extractVarReferences(value: string): string[] {
  const refs: string[] = [];
  let match: RegExpExecArray | null;
  VAR_REFERENCE_REGEX.lastIndex = 0;

  while ((match = VAR_REFERENCE_REGEX.exec(value)) !== null) {
    refs.push(match[1]);
  }

  return refs;
}

function pushInvalidTokenIssues(
  issues: ValidationIssue[],
  value: string,
  allowedTokens: Set<string>,
  selector?: string,
  line?: number,
): void {
  const refs = extractVarReferences(value);

  for (const ref of refs) {
    if (allowedTokens.has(ref)) continue;

    issues.push({
      id: `token-compliance-${issues.length}`,
      stage: 'stage1_lint',
      severity: 'error',
      rule: 'token-compliance',
      message: `CSS references unknown design token "${ref}".`,
      element: selector,
      expected: 'A token defined by the active Design Soul',
      actual: ref,
      line,
      fixSuggestion: 'Replace the token reference with one returned by get_design_soul.',
    });
  }
}

function parseInlineStyle(styleText: string): postcss.Root | null {
  try {
    return postcss.parse(`__inline__ { ${styleText} }`);
  } catch {
    return null;
  }
}

export class TokenComplianceCheck implements Stage1Check {
  readonly id = 'token-compliance';
  readonly name = 'Token Compliance';

  run(
    html: string,
    soulTokenNames: string[],
    _allowedFonts: string[],
    context?: ValidationContext,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const $ = cheerio.load(html);
    const allowedTokens = new Set(soulTokenNames);

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

      // First pass: harvest locally-declared custom properties so the
      // compiler can introduce derived tokens (e.g. --color-text-default
      // inside the slide-root :root block) without token-compliance
      // flagging downstream var() references as unknown. Soul tokens
      // remain the source of truth — these locals are intermediate
      // indirection, not new design choices.
      root.walkDecls((decl) => {
        if (decl.prop.startsWith('--')) {
          allowedTokens.add(decl.prop);
        }
      });

      root.walkDecls((decl) => {
        if (decl.prop.startsWith('--')) return;

        pushInvalidTokenIssues(
          issues,
          decl.value,
          allowedTokens,
          decl.parent?.type === 'rule' ? (decl.parent as postcss.Rule).selector : undefined,
          decl.source?.start?.line,
        );

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
            fixSuggestion: buildLiteralColorFixSuggestion(literal, prop, context),
          });
        }
      });
    });

    $('[style]').each((_i, el) => {
      const styleText = $(el).attr('style');
      if (!styleText?.trim()) return;

      const root = parseInlineStyle(styleText);
      if (!root) return;

      root.walkDecls((decl) => {
        if (decl.prop.startsWith('--')) return;

        const selector = el.tagName.toLowerCase() +
          (el.attribs.class ? `.${el.attribs.class.split(/\s+/).join('.')}` : '');

        pushInvalidTokenIssues(issues, decl.value, allowedTokens, selector, decl.source?.start?.line);

        const prop = decl.prop.toLowerCase();
        if (!COLOR_PROPERTIES.has(prop)) return;

        const literal = containsLiteralColor(decl.value);
        if (literal) {
          issues.push({
            id: `${this.id}-${issues.length}`,
            stage: 'stage1_lint',
            severity: 'error',
            rule: this.id,
            message: `Inline style property "${prop}" uses literal color "${literal}" instead of a design token variable.`,
            element: selector,
            expected: 'var(--<token-name>)',
            actual: literal,
            line: decl.source?.start?.line,
            fixSuggestion: buildLiteralColorFixSuggestion(literal, prop, context),
          });
        }
      });
    });

    return issues;
  }
}
