/**
 * Auto-substitute literal CSS values for soul-declared tokens.
 *
 * Generalizes the v4.2 hex→token substitution to also cover spacing and
 * radius tokens (v4.3). When the agent writes a value the active soul
 * declares as a token, we rewrite it to `var(--token)` before storage so
 * the slide/section tracks the soul if the token shifts and the validator
 * stops nagging about literals the agent had no real disagreement on.
 *
 * Per-category dispatch by CSS property:
 *   - color  — hex literals in color/background/border-color/...
 *   - spacing — px literals in margin/padding/gap/inset/top/...
 *   - radius — dimension literals in border-radius/...
 *
 * Conservative on purpose:
 *   - Color: only hex literals (3/6/8 digit). rgb()/hsl()/named pass through.
 *   - Spacing/radius: only top-level "word" tokens; values inside
 *     calc()/var()/min()/max() are left alone.
 *   - Composite values (multi-stop shadows, multi-axis padding) get every
 *     token-matching segment rewritten; non-matching parts stay literal.
 *   - When all lookups are empty (no soul, or no relevant tokens), the
 *     function is a fast no-op.
 *
 * Returns the post-substitution HTML and a structured log of every change.
 * Each entry carries `category` so the agent can group / display by layer.
 * Callers surface the log so the agent learns the substitution and emits
 * the var() form on the next turn.
 */

import * as cheerio from 'cheerio';
import postcss from 'postcss';
import valueParser from 'postcss-value-parser';
import { normalizeHex } from './color-token-lookup.js';

export type TokenCategory = 'color' | 'spacing' | 'radius';

export interface SoulTokenLookups {
  color: ReadonlyMap<string, string>;
  spacing: ReadonlyMap<string, string>;
  radius: ReadonlyMap<string, string>;
}

export interface TokenSubstitution {
  /** The original literal as written by the author (e.g. "#228BE6", "16px"). */
  literal: string;
  /** The CSS custom property name the literal maps to. */
  token: string;
  /** The CSS property the substitution happened in (e.g. "background", "padding"). */
  property: string;
  /** Which soul layer the token comes from. */
  category: TokenCategory;
  /** True when the change was inside a `style="..."` attribute; false for `<style>` blocks. */
  inline: boolean;
  /**
   * For `<style>` block matches: the rule selector that contained the
   * declaration. Helps the agent locate the change visually. Omitted for
   * inline-style matches (the inline element identifies itself).
   */
  selector?: string;
}

export interface TokenSubstitutionResult {
  html: string;
  substitutions: TokenSubstitution[];
}

const COLOR_PROPERTIES = new Set([
  'color',
  'background',
  'background-color',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'box-shadow',
  'text-shadow',
  'outline-color',
  'fill',
  'stroke',
  'caret-color',
  'column-rule-color',
  'text-decoration-color',
]);

const SPACING_PROPERTIES = new Set([
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'gap',
  'row-gap',
  'column-gap',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'inset-block',
  'inset-block-start',
  'inset-block-end',
  'inset-inline',
  'inset-inline-start',
  'inset-inline-end',
]);

const RADIUS_PROPERTIES = new Set([
  'border-radius',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'border-start-start-radius',
  'border-start-end-radius',
  'border-end-start-radius',
  'border-end-end-radius',
]);

const HEX_LITERAL_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;

function categoryFor(property: string): TokenCategory | null {
  if (COLOR_PROPERTIES.has(property)) return 'color';
  if (SPACING_PROPERTIES.has(property)) return 'spacing';
  if (RADIUS_PROPERTIES.has(property)) return 'radius';
  return null;
}

export function substituteSoulTokens(
  html: string,
  lookups: SoulTokenLookups,
): TokenSubstitutionResult {
  if (lookups.color.size === 0 && lookups.spacing.size === 0 && lookups.radius.size === 0) {
    return { html, substitutions: [] };
  }

  const substitutions: TokenSubstitution[] = [];
  // Load as a FRAGMENT (third arg false) so cheerio does not synthesise
  // <html>/<head>/<body> wrappers and pull <style> elements into <head>.
  const $ = cheerio.load(html, { xmlMode: false }, false);

  // ── <style> blocks ──────────────────────────────────────────────
  $('style').each((_i, el) => {
    const cssText = $(el).text();
    if (!cssText.trim()) return;

    let root: postcss.Root;
    try {
      root = postcss.parse(cssText);
    } catch {
      return;
    }

    let mutated = false;
    root.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      const category = categoryFor(prop);
      if (!category) return;

      const next = rewriteValue(decl.value, category, lookups, (sub) => {
        substitutions.push({
          ...sub,
          property: prop,
          category,
          inline: false,
          ...(decl.parent?.type === 'rule'
            ? { selector: (decl.parent as postcss.Rule).selector }
            : {}),
        });
      });
      if (next !== decl.value) {
        decl.value = next;
        mutated = true;
      }
    });

    if (mutated) {
      $(el).text(root.toString());
    }
  });

  // ── inline style="..." attributes ────────────────────────────────
  $('[style]').each((_i, el) => {
    const styleText = $(el).attr('style');
    if (!styleText?.trim()) return;

    let root: postcss.Root;
    try {
      root = postcss.parse(`__inline__ { ${styleText} }`);
    } catch {
      return;
    }

    let mutated = false;
    root.walkDecls((decl) => {
      const prop = decl.prop.toLowerCase();
      const category = categoryFor(prop);
      if (!category) return;

      const next = rewriteValue(decl.value, category, lookups, (sub) => {
        substitutions.push({
          ...sub,
          property: prop,
          category,
          inline: true,
        });
      });
      if (next !== decl.value) {
        decl.value = next;
        mutated = true;
      }
    });

    if (mutated) {
      const rule = root.first as postcss.Rule | undefined;
      if (rule) {
        const next = rule.nodes
          .filter((n): n is postcss.Declaration => n.type === 'decl')
          .map((d) => `${d.prop}: ${d.value}`)
          .join('; ');
        $(el).attr('style', next);
      }
    }
  });

  return { html: $.html(), substitutions };
}

function rewriteValue(
  value: string,
  category: TokenCategory,
  lookups: SoulTokenLookups,
  onSubstitute: (sub: Pick<TokenSubstitution, 'literal' | 'token'>) => void,
): string {
  if (category === 'color') {
    return rewriteColorValue(value, lookups.color, onSubstitute);
  }
  const lookup = category === 'spacing' ? lookups.spacing : lookups.radius;
  if (lookup.size === 0) return value;
  return rewriteDimensionValue(value, lookup, onSubstitute);
}

function rewriteColorValue(
  value: string,
  lookup: ReadonlyMap<string, string>,
  onSubstitute: (sub: Pick<TokenSubstitution, 'literal' | 'token'>) => void,
): string {
  if (lookup.size === 0) return value;
  return value.replace(HEX_LITERAL_RE, (match) => {
    const normalized = normalizeHex(match);
    if (!normalized) return match;
    const token = lookup.get(normalized);
    if (!token) return match;
    onSubstitute({ literal: match, token });
    return `var(${token})`;
  });
}

function rewriteDimensionValue(
  value: string,
  lookup: ReadonlyMap<string, string>,
  onSubstitute: (sub: Pick<TokenSubstitution, 'literal' | 'token'>) => void,
): string {
  let parsed: ReturnType<typeof valueParser>;
  try {
    parsed = valueParser(value);
  } catch {
    return value;
  }

  let mutated = false;
  parsed.walk((node) => {
    if (node.type === 'function') {
      // Don't substitute inside calc()/var()/min()/max() — return false to
      // skip walking descendants.
      return false;
    }
    if (node.type === 'word') {
      const literal = node.value;
      const token = lookup.get(literal);
      if (token) {
        onSubstitute({ literal, token });
        node.value = `var(${token})`;
        mutated = true;
      }
    }
    return undefined;
  });

  return mutated ? valueParser.stringify(parsed.nodes) : value;
}
