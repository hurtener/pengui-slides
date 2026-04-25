/**
 * Auto-substitute literal color values for soul-declared tokens.
 *
 * If an agent's HTML carries `background: #228be6` and the active soul
 * declares that exact hex as `--color-accent-primary`, the substituter
 * rewrites the value to `var(--color-accent-primary)` before storage.
 * Same intent, same render — but the slide/section now tracks the soul
 * if its tokens shift, and the validator stops nagging about literals
 * the agent had no real disagreement on.
 *
 * Deliberately conservative:
 *   - Only hex literals (3/6/8 digit) are substituted; rgb()/hsl()/named
 *     colors fall through. Hex is what agents emit ~99% of the time.
 *   - Only declarations whose property is in COLOR_PROPERTIES (color,
 *     background, border-color, etc.) are touched.
 *   - Composite values (box-shadow, multi-stop gradients) get every
 *     token-matching segment rewritten; non-matching parts stay literal.
 *   - When the soul lookup is empty (no soul, or no hex tokens), the
 *     function is a fast no-op.
 *
 * Returns the post-substitution HTML alongside a structured log of every
 * change made. Callers surface the log to the agent so it learns the
 * substitution and emits the var() form on the next turn.
 */

import * as cheerio from 'cheerio';
import postcss from 'postcss';
import { normalizeHex } from './color-token-lookup.js';

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

const HEX_LITERAL_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;

export interface ColorSubstitution {
  /** The original literal as written by the author (e.g. "#228BE6"). */
  literal: string;
  /** The CSS custom property name the literal maps to (e.g. "--color-accent-primary"). */
  token: string;
  /** The CSS property the substitution happened in (e.g. "background"). */
  property: string;
  /** True when the change was inside a `style="..."` attribute; false for `<style>` blocks. */
  inline: boolean;
  /**
   * For `<style>` block matches: the rule selector that contained the
   * declaration. Helps the agent locate the change visually. Omitted for
   * inline-style matches (the inline element identifies itself).
   */
  selector?: string;
}

export interface ColorSubstitutionResult {
  html: string;
  substitutions: ColorSubstitution[];
}

/**
 * Walk every color-relevant CSS declaration and rewrite hex literals that
 * match a soul token. Idempotent: a fragment that already uses var() is
 * unchanged and produces an empty substitutions list.
 */
export function substituteColorLiterals(
  html: string,
  lookup: ReadonlyMap<string, string>,
): ColorSubstitutionResult {
  if (lookup.size === 0) {
    return { html, substitutions: [] };
  }

  const substitutions: ColorSubstitution[] = [];
  // Load as a FRAGMENT (third arg false) so cheerio does not synthesise
  // <html>/<head>/<body> wrappers and pull <style> elements into <head>.
  // Without this, a "style-only" fragment like `<style>...</style><div>...</div>`
  // round-trips with the body content empty.
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
      if (!COLOR_PROPERTIES.has(prop)) return;

      const next = rewriteValue(decl.value, lookup, (sub) => {
        substitutions.push({
          ...sub,
          property: prop,
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
      if (!COLOR_PROPERTIES.has(prop)) return;

      const next = rewriteValue(decl.value, lookup, (sub) => {
        substitutions.push({
          ...sub,
          property: prop,
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
        // Reassemble the inline style: drop the synthetic selector wrapper
        // and emit just the declarations as `prop: value; prop: value;`.
        const next = rule.nodes
          .filter((n): n is postcss.Declaration => n.type === 'decl')
          .map((d) => `${d.prop}: ${d.value}`)
          .join('; ');
        $(el).attr('style', next);
      }
    }
  });

  return { html: serialize($), substitutions };
}

function rewriteValue(
  value: string,
  lookup: ReadonlyMap<string, string>,
  onSubstitute: (sub: Pick<ColorSubstitution, 'literal' | 'token'>) => void,
): string {
  return value.replace(HEX_LITERAL_RE, (match) => {
    const normalized = normalizeHex(match);
    if (!normalized) return match;
    const token = lookup.get(normalized);
    if (!token) return match;
    onSubstitute({ literal: match, token });
    return `var(${token})`;
  });
}

function serialize($: cheerio.CheerioAPI): string {
  // Fragment-mode load (isDocument=false) keeps the document tree as-is,
  // so $.html() returns the original fragment shape including any
  // top-level <style> blocks.
  return $.html();
}
