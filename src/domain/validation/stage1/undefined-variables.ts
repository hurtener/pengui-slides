/**
 * Undefined CSS Variables Check (Stage 1)
 *
 * Scans every `var(--name)` reference in the slide's `<style>` blocks and
 * inline styles and verifies that `--name` is either declared in a `:root`
 * block (or any selector that applies to html) or carries a fallback
 * (`var(--name, fallback)`).
 *
 * Motivation: a real failure mode is authoring `.slide { padding:
 * var(--space-safe-area) }` but forgetting to paste the soul's token
 * definitions into the slide's `:root` block. The variable then resolves
 * to nothing, padding collapses to 0, and the slide renders with its
 * content flush against the page edge. The symptom (content at 0,0
 * instead of at the safe-area inset) is misleading and easy to
 * misdiagnose as "CSS variables don't work in the render context" —
 * which some LLMs then "fix" by hardcoding literal px values.
 *
 * This check catches the root cause directly: naming the specific
 * undefined variable in the error message.
 */

import * as cheerio from 'cheerio';
import postcss from 'postcss';
import type { Stage1Check, ValidationIssue } from '../../../types/validation.js';

/** Pull every `var(--name [, fallback])` reference from a CSS value string. */
function extractVarReferences(value: string): Array<{ name: string; hasFallback: boolean }> {
  const refs: Array<{ name: string; hasFallback: boolean }> = [];
  // Match var( --name ) or var( --name, fallback ). Nested parens in the
  // fallback are rare enough for a flat scan; we only care about whether
  // a comma appears before the closing paren to flag "has fallback".
  const re = /var\(\s*(--[a-zA-Z0-9_-]+)\s*(,[^)]*)?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value)) !== null) {
    refs.push({ name: m[1], hasFallback: Boolean(m[2]) });
  }
  return refs;
}

export class UndefinedVariablesCheck implements Stage1Check {
  readonly id = 'undefined-variables';
  readonly name = 'Undefined CSS Variables';

  run(html: string, _soulTokenNames: string[], _allowedFonts: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const $ = cheerio.load(html);

    // ── Collect every --name DECLARED in a `:root` or `html` selector ──
    const declared = new Set<string>();
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
        const selectors = rule.selector.split(',').map((s) => s.trim());
        const appliesToRoot = selectors.some(
          (s) => s === ':root' || s === 'html' || s === ':where(:root)' || s.startsWith(':root'),
        );
        // We're specifically looking for the base declaration scope. If a
        // medium-scoped selector like [data-pengui-medium="print"] also
        // declares a token it will still apply at runtime, so accept that too.
        const applies =
          appliesToRoot ||
          selectors.some(
            (s) =>
              s.includes('data-pengui-medium') ||
              s === 'body' ||
              s === 'html, body' ||
              s === 'html,body',
          );
        if (!applies) return;

        rule.walkDecls((decl) => {
          if (decl.prop.startsWith('--')) declared.add(decl.prop);
        });
      });
    });

    // ── Collect every --name REFERENCED anywhere in styles or inline attrs ──
    // Key: variable name → one sample (property/value) for error context.
    const referenced = new Map<string, { prop: string; value: string }>();

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
        if (!decl.value.includes('var(')) return;
        for (const ref of extractVarReferences(decl.value)) {
          if (ref.hasFallback) continue; // fallbacks make undefined vars benign
          if (!referenced.has(ref.name)) {
            referenced.set(ref.name, { prop: decl.prop, value: decl.value });
          }
        }
      });
    });

    // Inline `style="..."` attributes too — common for per-element overrides.
    $('[style]').each((_i, el) => {
      const style = $(el).attr('style') ?? '';
      if (!style.includes('var(')) return;
      for (const ref of extractVarReferences(style)) {
        if (ref.hasFallback) continue;
        if (!referenced.has(ref.name)) {
          referenced.set(ref.name, { prop: 'inline style', value: style.slice(0, 120) });
        }
      }
    });

    // ── Report anything referenced that isn't declared ──
    for (const [name, ctx] of referenced) {
      if (declared.has(name)) continue;

      issues.push({
        id: `${this.id}-${issues.length}`,
        stage: 'stage1_lint',
        // warning, not error: the lint's job is to tell the author about a
        // design-breaking pattern, not to block export. A slide with undefined
        // variables still renders (resolved to initial values) — the author
        // may want to see what they actually produced before correcting it.
        severity: 'warning',
        rule: this.id,
        message:
          `CSS variable "${name}" is referenced (e.g., ${ctx.prop}: ${ctx.value}) ` +
          'but not declared in the slide\'s :root block. ' +
          'It will resolve to nothing at render time and the property will silently ' +
          'collapse to its initial value (often 0 for padding/margin, "initial" for colors). ' +
          'This is the usual cause of "padding / position / dimensions not applying" symptoms ' +
          'even though the slide\'s .slide CSS rule looks correct — the root cause is the ' +
          'missing :root declaration, not the var() syntax.',
        expected: `:root { ${name}: <value>; ... }`,
        actual: 'variable referenced without a :root declaration and without a fallback',
        fixSuggestion:
          `Paste the soul's full token block into :root (use get_design_soul with include_skeletons: true to fetch css_tokens), ` +
          `or add a fallback to the reference: \`var(${name}, <fallback>)\`. ` +
          'Do NOT replace the var() with a literal — that breaks token compliance and brand consistency.',
      });
    }

    return issues;
  }
}
