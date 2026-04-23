/**
 * Stage 0 — Defensive defaults injection.
 *
 * Some CSS declarations are hygiene-defaults with no design intent: any
 * slide author would want them, and their absence causes silent layout
 * breakage that is hard to diagnose from validator error messages alone.
 * Rather than making these pure lint errors that the author must fix by
 * hand, we prepend a defensive stylesheet at validate + render + export
 * time. The author's own rules come later in the cascade and win on
 * specificity ties, so explicit design choices are never overridden.
 *
 * What we inject (when missing from the author's HTML):
 *
 *   html, body { margin: 0; padding: 0; }
 *     — Universal "*" selector has specificity 0 and does NOT override
 *       the browser UA stylesheet's body { margin: 8px } rule. Without
 *       an explicit html/body reset, the slide renders 8px off.
 *
 *   * { box-sizing: border-box; }
 *     — Modern convention. With border-box, .slide { width: 1240px;
 *       padding: 96px } fits inside 1240px total; with content-box
 *       (the default) it expands to 1432px and overflows the page.
 *
 *   .slide { position: relative; overflow: hidden; }
 *     — position:relative makes .slide the containing block for any
 *       absolutely-positioned descendants. Without it, absolute
 *       children escape up to <html> and fill the viewport.
 *       overflow:hidden clips content to the slide's drawn area so
 *       minor bleed doesn't show up in the exported PDF.
 *
 * The injector reports every default it filled in so authors can learn
 * the pattern and optionally include the rules explicitly in their own
 * HTML (slides are then portable outside the Pengui render context).
 * We do NOT inject tokens, colors, dimensions, fonts, or any other
 * design-intent property — those remain the author's responsibility
 * and are caught by the lint rules when missing.
 */

import * as cheerio from 'cheerio';
import postcss from 'postcss';

/** A single default that Stage 0 may inject. */
export interface Injection {
  /** Stable ID used in info-level validation issues. */
  id:
    | 'html-body-margin'
    | 'universal-box-sizing'
    | 'slide-position-relative'
    | 'slide-overflow-hidden';
  /** Human-readable description emitted in the info note. */
  reason: string;
  /** The CSS declaration that was injected. */
  rule: string;
}

export interface DefensiveResult {
  /** Slide HTML with the defensive prelude prepended into <head>. */
  html: string;
  /** Which defaults Stage 0 had to fill in for this slide. */
  injections: Injection[];
}

// ── Default prelude ──────────────────────────────────────────────

const DEFENSIVE_STYLE_ID = 'pengui-defensive-defaults';

const ALL_DEFAULTS: Injection[] = [
  {
    id: 'html-body-margin',
    reason:
      'html, body { margin: 0; padding: 0 } — the universal "*" selector has specificity 0 and does not override the UA stylesheet\'s default body margin of 8px. Declaring html and body explicitly is the only reliable reset.',
    rule: 'html, body { margin: 0; padding: 0; }',
  },
  {
    id: 'universal-box-sizing',
    reason:
      '* { box-sizing: border-box } — with content-box (the CSS default), a 1240px .slide with 96px padding expands to 1432px total and overflows the page.',
    rule: '* { box-sizing: border-box; }',
  },
  {
    id: 'slide-position-relative',
    reason:
      '.slide { position: relative } — without a positioned ancestor, any absolutely-positioned descendant escapes up to <html> and fills the viewport instead of being laid out inside the slide box.',
    rule: '.slide { position: relative; }',
  },
  {
    id: 'slide-overflow-hidden',
    reason:
      '.slide { overflow: hidden } — clips content at the slide\'s drawn edge so minor bleed (e.g. a shadow or a glyph descender) does not render outside the page.',
    rule: '.slide { overflow: hidden; }',
  },
];

// ── Detection helpers ────────────────────────────────────────────

interface AuthorCss {
  /** Does html and body both have margin: 0 declarations? */
  htmlBodyMarginReset: boolean;
  /** Does the universal selector declare box-sizing: border-box? */
  universalBoxSizing: boolean;
  /** Does .slide have position: relative? */
  slidePositionRelative: boolean;
  /** Does .slide have overflow: hidden? */
  slideOverflowHidden: boolean;
}

function parseAuthorCss(html: string): AuthorCss {
  const state: AuthorCss = {
    htmlBodyMarginReset: false,
    universalBoxSizing: false,
    slidePositionRelative: false,
    slideOverflowHidden: false,
  };

  let htmlMarginZero = false;
  let bodyMarginZero = false;

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

    root.walkRules((rule) => {
      const selectors = rule.selector.split(',').map((s) => s.trim());

      const targetsHtml = selectors.some((s) => s === 'html' || s === 'html, body' || s === 'html,body');
      const targetsBody = selectors.some((s) => s === 'body' || s === 'html, body' || s === 'html,body');
      const targetsUniversal = selectors.some((s) => s === '*');
      const targetsSlide = selectors.some(
        (s) => s === '.slide' || s === 'div.slide' || s === '.slide:root',
      );

      rule.walkDecls((decl) => {
        const prop = decl.prop.toLowerCase();
        const val = decl.value.trim();

        if ((prop === 'margin' || prop === 'margin-top') && isZero(val)) {
          if (targetsHtml) htmlMarginZero = true;
          if (targetsBody) bodyMarginZero = true;
        }
        if (prop === 'box-sizing' && val === 'border-box' && targetsUniversal) {
          state.universalBoxSizing = true;
        }
        if (prop === 'position' && val === 'relative' && targetsSlide) {
          state.slidePositionRelative = true;
        }
        if (prop === 'overflow' && targetsSlide && (val === 'hidden' || val === 'clip')) {
          state.slideOverflowHidden = true;
        }
      });
    });
  });

  // Inline style on the .slide element can declare position/overflow too.
  const slideEl = $('div.slide');
  if (slideEl.length > 0) {
    const style = slideEl.attr('style') ?? '';
    if (/position\s*:\s*relative/i.test(style)) state.slidePositionRelative = true;
    if (/overflow\s*:\s*(hidden|clip)/i.test(style)) state.slideOverflowHidden = true;
  }

  state.htmlBodyMarginReset = htmlMarginZero && bodyMarginZero;
  return state;
}

function isZero(value: string): boolean {
  const trimmed = value.trim().toLowerCase();
  if (trimmed === '0') return true;
  // "0 0", "0 0 0 0", "0px", "0px 0px", etc.
  return /^(\s*0(?:px|em|rem|%|)?\s*)+$/.test(trimmed);
}

// ── Injection ────────────────────────────────────────────────────

/**
 * Prepend the defensive prelude into the HTML's <head> (or create a head
 * if one isn't present) and report which defaults were missing before
 * the injection — those become info-level validation notes so the
 * author can learn the pattern.
 *
 * The prelude is always injected whole. Explicit author rules come
 * LATER in the cascade and win on specificity ties, so design intent
 * is never overridden. Idempotent: if Stage 0 has already run on this
 * HTML (the prelude carries a stable id), it is not injected twice.
 */
export function applyDefensiveDefaults(html: string): DefensiveResult {
  // Idempotency guard — avoid double-injection on re-validation.
  if (html.includes(`id="${DEFENSIVE_STYLE_ID}"`) || html.includes(`id='${DEFENSIVE_STYLE_ID}'`)) {
    return { html, injections: [] };
  }

  const authorCss = parseAuthorCss(html);

  const missing: Injection[] = [];
  if (!authorCss.htmlBodyMarginReset) missing.push(ALL_DEFAULTS[0]);
  if (!authorCss.universalBoxSizing) missing.push(ALL_DEFAULTS[1]);
  if (!authorCss.slidePositionRelative) missing.push(ALL_DEFAULTS[2]);
  if (!authorCss.slideOverflowHidden) missing.push(ALL_DEFAULTS[3]);

  // Even if nothing is missing, we still prepend an empty (comment-only)
  // defensive block so the idempotency guard works on re-validation.
  const preludeCss = ALL_DEFAULTS.map((d) => d.rule).join('\n  ');
  const styleTag = `<style id="${DEFENSIVE_STYLE_ID}">\n  /* pengui-defensive-defaults: lowest-priority fallbacks. Author rules later in the cascade win. */\n  ${preludeCss}\n</style>`;

  // Insert immediately after <head> opening tag, or wrap in <head> if missing.
  let injected: string;
  if (/<head[^>]*>/i.test(html)) {
    injected = html.replace(/<head([^>]*)>/i, (match) => `${match}\n${styleTag}`);
  } else if (/<html[^>]*>/i.test(html)) {
    injected = html.replace(/<html([^>]*)>/i, (match) => `${match}\n<head>${styleTag}</head>`);
  } else {
    // Headless fragment — prepend the style tag. Cheerio / Playwright
    // will wrap in <html><head> when parsing.
    injected = `${styleTag}\n${html}`;
  }

  return { html: injected, injections: missing };
}
