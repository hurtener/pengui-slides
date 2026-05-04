/**
 * DocumentComposer — continuous-document assembly for print decks.
 *
 * The composer is the counterpart to the slide renderer: it takes an
 * ordered list of Section fragments (each a single
 * `<section class="pengui-section pengui-{kind}">` element plus a
 * `<!-- @section-meta {...} -->` comment) and produces one flowing
 * HTML document that Chromium's paginator turns into a multi-page PDF.
 *
 * What the composer owns (per SPEC-v3.md §4):
 *
 *   - Document frame (doctype, <html data-pengui-medium="print"
 *     data-pengui-model="document">, <head>, <body>).
 *   - Soul tokens (soul.cssTokens injected ONCE into
 *     <style id="pengui-soul-tokens">).
 *   - Stage-0 defensive defaults (via applyDefensiveDefaults, for
 *     document-level hygiene — can be opted out with applyDefensive=false).
 *   - `@page` size + margins derived from FormatGeometry and
 *     DocumentMeta.pageMargin.
 *   - Universal break rules on canonical wrapper classes
 *     (.pengui-figure, .pengui-chart, .pengui-diagram, .pengui-callout,
 *     .pengui-quote, .pengui-image) plus table/thead/tfoot/tr, plus
 *     heading `break-after: avoid`, plus full-page semantics.
 *   - Running chrome (header/footer rendered as `position: fixed` HTML
 *     with CSS counters for `counter(page) / counter(pages)`).
 *   - Per-section attribute projection: each fragment is re-wrapped
 *     with `id="sec-N"`, `data-kind`, `data-full-page`, `data-chrome`,
 *     and optional `data-running-title` / `data-reset-page-counter`.
 *   - Named `@page` contexts for per-chapter running titles (Chromium
 *     inherits CSS custom properties from @page into fixed descendants).
 *   - TOC auto-generation when a kind='toc' section has an empty body
 *     and documentMeta.toc is set.
 *   - Asset reference resolution (asset://UUID → data URI) via the
 *     existing resolveAssetRefs helper.
 *
 * What the composer does NOT own (handled elsewhere):
 *
 *   - Validation of the fragment contract (Wave 4 — Stage 1 section lints).
 *   - Playwright invocation + page.pdf() call (Wave 5 — PdfExporter).
 *   - Preview rendering (existing preview-renderer heuristics).
 *
 * Keep this file free of side effects at import time. All disk reads
 * happen inside the composer instance, cached by recipe path.
 */

import { readFileSync } from 'node:fs';
import { resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as cheerio from 'cheerio';

import type { Logger } from '../../infrastructure/logger.js';
import type { AssetService } from '../assets/asset-service.js';
import { resolveAssetRefs } from '../assets/asset-resolver.js';
import { resolveChartRefs } from './chart-resolver.js';
import { applyDefensiveDefaults } from '../validation/stage0/defensive-injector.js';
import type { Section, SectionKind, SectionBreakHints } from '../../types/section.js';
import { ALL_SECTION_KINDS } from '../../types/section.js';
import type { Deck, DocumentMeta } from '../../types/deck.js';
import type { DesignSoul } from '../../types/design-soul.js';
import type { FormatGeometry } from '../../types/format.js';
import { NODE_CSS } from '../ir/compile/layout-css.js';

// ── Module-relative template root ────────────────────────────────
//
// The composer reads per-recipe CSS from `templates/document/<kind>.css`.
// We resolve the path at class instantiation time (once per process) so
// unit tests don't care about process.cwd().

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// src/domain/rendering/document-composer.ts  →  <repo>/templates/document
const TEMPLATES_DIR = resolvePath(__dirname, '..', '..', '..', 'templates', 'document');

// ── Public types ─────────────────────────────────────────────────

export interface ComposeInput {
  sections: Section[];
  deck: Deck;
  soul: DesignSoul;
  geometry: FormatGeometry;
  documentMeta: DocumentMeta;
  /** Run Stage 0 defensive defaults on the composed document. Default: true. */
  applyDefensive?: boolean;
  /** Resolve `asset://UUID` refs inside section fragments. Default: true. */
  resolveAssets?: boolean;
  /** Required to resolve asset refs; ignored when resolveAssets is false. */
  assetService?: AssetService;
}

export interface ComposeResult {
  html: string;
  sectionDomIds: Record<string, string>;
  warnings: string[];
}

// ── Helpers ──────────────────────────────────────────────────────

const KNOWN_KINDS: ReadonlySet<SectionKind> = new Set(ALL_SECTION_KINDS);

/** Convert a CSS pixel length to mm (96px = 25.4mm). */
function pxToMm(px: number): number {
  return +((px * 25.4) / 96).toFixed(2);
}

/**
 * Strip an OUTER `:root { ... }` wrapper from a CSS snippet. The soul's
 * cssTokens field is expected to already be a valid CSS string (with its
 * own :root block), so this only fires defensively when a caller has
 * double-wrapped it.
 *
 * Heuristic: if the string starts with `:root {` and ends with `}`, and
 * no other `:root {` appears after the initial one, unwrap once.
 */
function stripRedundantRootWrapper(css: string): string {
  const trimmed = css.trim();
  // Leave alone if the soul already contains multiple blocks or does not
  // start with :root { — the "native" shape from token-generator is
  // `:root { ... }\n\n[data-pengui-medium="print"] { ... }` which we keep.
  if (!trimmed.startsWith(':root')) return css;

  const firstBraceIdx = trimmed.indexOf('{');
  if (firstBraceIdx === -1) return css;

  // Walk to the matching closing brace for this :root block.
  let depth = 0;
  let closeIdx = -1;
  for (let i = firstBraceIdx; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        closeIdx = i;
        break;
      }
    }
  }
  if (closeIdx === -1) return css;

  // If content beyond the first :root block starts with another block
  // or declaration, we keep the file intact (native shape).
  const afterRoot = trimmed.slice(closeIdx + 1).trim();
  if (afterRoot.length > 0) return css;

  // Pure `:root { declarations }` with no sibling blocks and no nested
  // wrapper — safe to unwrap into declarations only, then re-wrap
  // ourselves. But the calling code already wraps cssTokens inside a
  // <style> block with a :root expectation… so keeping the :root is
  // correct. We leave the CSS untouched in this case too.
  return css;
}

/** Sanitize a chrome-override running title into a named @page identifier. */
function sanitizePageName(raw: string, index: number): string {
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned.length > 0 ? `chrome${cleaned}` : `chrome${index}`;
}

/**
 * Escape a string for safe use inside a CSS `content: "..."` / `--var:
 * "..."` string literal. We only need to neutralize double-quotes and
 * backslashes (which are the only characters that can terminate or
 * re-escape a CSS quoted string).
 */
function escapeCssString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Escape a string for safe use inside an HTML text node or attribute. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Merge the existing class attribute on a root section with required classes. */
function mergeSectionClasses(existing: string | undefined, required: string[]): string {
  const have = new Set((existing ?? '').split(/\s+/).filter(Boolean));
  for (const c of required) have.add(c);
  return [...have].join(' ');
}

/** Resolve the set of break-related CSS declarations into an inline style string. */
function buildBreakInlineStyle(kind: SectionKind, hints: SectionBreakHints): string {
  const decls: string[] = [];
  const effectiveBreakBefore =
    hints.breakBefore ?? (kind === 'chapter_header' ? 'page' : undefined);
  if (effectiveBreakBefore === 'page') {
    decls.push('break-before: page');
    decls.push('page-break-before: always');
  } else if (effectiveBreakBefore === 'avoid') {
    decls.push('break-before: avoid');
    decls.push('page-break-before: avoid');
  }
  if (hints.breakAfter === 'page') {
    decls.push('break-after: page');
    decls.push('page-break-after: always');
  } else if (hints.breakAfter === 'avoid') {
    decls.push('break-after: avoid');
    decls.push('page-break-after: avoid');
  }
  if (hints.keepTogether === true) {
    decls.push('break-inside: avoid');
    decls.push('page-break-inside: avoid');
  }
  return decls.join('; ');
}

// ── DocumentComposer ─────────────────────────────────────────────

export class DocumentComposer {
  /**
   * Per-process cache of per-recipe CSS, keyed by absolute path.
   * Avoids hammering the disk when a single deck references the same
   * recipe kind many times, and when multiple composes happen in one
   * server session.
   */
  private readonly cssCache = new Map<string, string>();

  constructor(private readonly logger: Logger) {}

  /**
   * Compose a continuous HTML document from Section fragments.
   *
   * Steps:
   *   1. Parse each fragment's root <section> and emit a wrapped
   *      version with the canonical id + data attributes.
   *   2. Auto-fill empty `kind: 'toc'` sections when documentMeta.toc
   *      is set.
   *   3. Resolve `asset://UUID` refs (if enabled and assetService is
   *      provided).
   *   4. Assemble the document frame with soul tokens, print base CSS,
   *      per-recipe CSS, and chrome CSS.
   *   5. Run Stage 0 defensive defaults on the final document (unless
   *      opted out).
   */
  async compose(input: ComposeInput): Promise<ComposeResult> {
    const {
      sections,
      deck,
      soul,
      geometry,
      documentMeta,
      applyDefensive = true,
      resolveAssets = true,
      assetService,
    } = input;

    const warnings: string[] = [];
    const sectionDomIds: Record<string, string> = {};

    // ── 1. Plan per-section metadata (id, kind, chrome, full-page, etc.) ──

    interface Plan {
      section: Section;
      domId: string;
      kind: SectionKind;
      fullPage: boolean;
      chromeOff: boolean;
      runningTitlePageName: string | null;
      resetPageCounter: boolean;
      breakInline: string;
    }

    // First pass — resolve kind, fullPage, chrome (no break inline yet).
    type PartialPlan = Omit<Plan, 'breakInline'>;
    const partials: PartialPlan[] = sections.map((section, i) => {
      const domId = `sec-${i + 1}`;
      sectionDomIds[section.id] = domId;

      const rawKind = section.kind;
      let kind: SectionKind;
      if (KNOWN_KINDS.has(rawKind)) {
        kind = rawKind;
      } else {
        warnings.push(`Section ${section.id}: unknown kind "${rawKind}"; treating as "prose".`);
        kind = 'prose';
      }

      let fullPage: boolean;
      if (section.breakHints.fullPage === true) fullPage = true;
      else if (section.breakHints.fullPage === false) fullPage = false;
      else fullPage = kind === 'cover' || kind === 'chapter_header';

      const chromeOverrides = section.metadata.chromeOverrides;
      let chromeOff = fullPage;
      if (chromeOverrides?.hide === true) chromeOff = true;

      let runningTitlePageName: string | null = null;
      if (chromeOverrides?.runningTitle !== undefined) {
        if (typeof chromeOverrides.runningTitle !== 'string') {
          warnings.push(
            `Section ${section.id}: chromeOverrides.runningTitle must be a string; got ${typeof chromeOverrides.runningTitle}.`,
          );
        } else if (chromeOverrides.runningTitle.trim().length > 0) {
          runningTitlePageName = sanitizePageName(chromeOverrides.runningTitle, i + 1);
        }
      }

      const resetPageCounter = chromeOverrides?.resetPageCounter === true;

      return { section, domId, kind, fullPage, chromeOff, runningTitlePageName, resetPageCounter };
    });

    // Second pass — resolve break-inline. Suppresses the kind-default
    // `break-before: page` on a chapter_header (or any section whose hint
    // doesn't explicitly set breakBefore) when the previous section already
    // ends with a page break (its own `breakAfter: 'page'` hint OR its
    // `fullPage` flag, since full-page sections universally emit
    // `break-after: page`). Chromium's print pipeline doesn't always
    // collapse adjacent `break-after: page` + `break-before: page` and
    // emits a fully-blank page in between. Authoring-time `breakBefore`
    // hints are always respected.
    const plans: Plan[] = partials.map((p, i) => {
      const prev = i > 0 ? partials[i - 1] : null;
      const prevEndsWithBreak = prev
        ? prev.section.breakHints.breakAfter === 'page' || prev.fullPage
        : false;

      const explicitBefore = p.section.breakHints.breakBefore;
      const effectiveHints = (() => {
        const isDefaultBreakBefore = explicitBefore === undefined;
        if (isDefaultBreakBefore && prevEndsWithBreak) {
          // Suppress the kind-default break-before. We don't want a
          // double break. `'auto'` is emitted as no decl — the previous
          // section's break-after already gave us a fresh page.
          return { ...p.section.breakHints, breakBefore: 'auto' as const };
        }
        return p.section.breakHints;
      })();
      const breakInline = buildBreakInlineStyle(p.kind, effectiveHints);
      return { ...p, breakInline };
    });

    // ── 2. Build per-section wrapped HTML (fragment body). ──
    // We first render TOC bodies, then wrap each fragment. The wrapping
    // phase runs after asset resolution to keep the pipeline simple.

    const wrappedSections = await Promise.all(
      plans.map(async (plan) => {
        const { section, domId, kind } = plan;

        let fragmentHtml: string;

        if (kind === 'toc') {
          fragmentHtml = this.renderTocFragment(section.html, plans, documentMeta, warnings);
        } else {
          fragmentHtml = section.html;
        }

        // Asset resolution — once per fragment so data URIs only live
        // in-memory inside this composition.
        if (resolveAssets && assetService) {
          fragmentHtml = await resolveAssetRefs(fragmentHtml, assetService);
        }

        // v4.12: chart resolution. Section compile is soul-agnostic, so
        // it stores the placeholder figure with `data-pengui-chart-spec`.
        // Composer has the soul on hand — render real ECharts SVG here.
        // No-op when the fragment carries no chart figures.
        fragmentHtml = resolveChartRefs(fragmentHtml, soul.layers);

        return this.projectSectionAttributes(fragmentHtml, plan, warnings, domId);
      }),
    );

    // ── 3. Assemble document frame. ──

    const title = escapeHtml(deck.title || 'Document');
    const soulTokensBlock = this.buildSoulTokensBlock(soul);
    const printBaseBlock = this.buildPrintBaseBlock(geometry, documentMeta);
    const nodeStylesBlock = this.buildNodeStylesBlock();
    const blockStylesBlock = this.buildBlockStylesBlock(plans, documentMeta);
    const chromeBlock = this.buildChromeBlock(plans, deck, documentMeta);

    const mainBody = wrappedSections.join('\n');

    let html = `<!DOCTYPE html>
<html lang="en" data-pengui-medium="print" data-pengui-model="document">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  ${soulTokensBlock}
  ${printBaseBlock}
  ${nodeStylesBlock}
  ${blockStylesBlock}
  ${chromeBlock}
</head>
<body>
  <main class="pengui-document">
${mainBody}
  </main>
</body>
</html>`;

    // ── 4. Stage 0 defensive defaults (document-level). ──

    if (applyDefensive) {
      const result = applyDefensiveDefaults(html);
      html = result.html;
    }

    this.logger.info('DocumentComposer: compose complete', {
      deckId: deck.id,
      soulId: soul.id,
      sectionCount: sections.length,
      warningCount: warnings.length,
    });

    return { html, sectionDomIds, warnings };
  }

  // ── Section wrapping ────────────────────────────────────────────

  /**
   * Take an input fragment and re-emit its root <section> with the
   * canonical attributes. Preserves existing classes on the root; merges
   * in the required `pengui-section pengui-{kind}` pair. Emits a warning
   * when the fragment has no root <section> and falls back to wrapping
   * the entire body in one.
   */
  private projectSectionAttributes(
    fragmentHtml: string,
    plan: {
      section: Section;
      domId: string;
      kind: SectionKind;
      fullPage: boolean;
      chromeOff: boolean;
      runningTitlePageName: string | null;
      resetPageCounter: boolean;
      breakInline: string;
    },
    warnings: string[],
    domId: string,
  ): string {
    const { section, kind, fullPage, chromeOff, runningTitlePageName, resetPageCounter, breakInline } =
      plan;

    const $ = cheerio.load(fragmentHtml, { xml: false }, false);
    let $root = $('section').first();

    if ($root.length === 0) {
      warnings.push(
        `Section ${section.id}: fragment has no <section> root; wrapping body in a default pengui-section.`,
      );
      // Append a fresh root and repoint cheerio selection.
      $('body').append(`<section class="pengui-section pengui-${kind}"></section>`);
      $root = $('section').first();
      $root.html(fragmentHtml);
    }

    // Canonical class list: preserve whatever the author set, guarantee
    // pengui-section + pengui-{kind} are present.
    const existingClasses = ($root.attr('class') ?? '').trim();
    const hasWrapperClass = /\bpengui-section\b/.test(existingClasses);
    if (!hasWrapperClass) {
      warnings.push(
        `Section ${section.id}: root <section> missing "pengui-section" class; composer added it.`,
      );
    }
    $root.attr('class', mergeSectionClasses(existingClasses, ['pengui-section', `pengui-${kind}`]));

    // Attributes.
    $root.attr('id', domId);
    $root.attr('data-kind', kind);
    $root.attr('data-full-page', fullPage ? 'true' : 'false');
    $root.attr('data-chrome', chromeOff ? 'off' : 'on');
    if (runningTitlePageName) {
      $root.attr('data-running-title', runningTitlePageName);
    } else {
      $root.removeAttr('data-running-title');
    }
    if (resetPageCounter) {
      $root.attr('data-reset-page-counter', 'true');
    }
    if (breakInline.length > 0) {
      const existingStyle = ($root.attr('style') ?? '').trim().replace(/;+\s*$/, '');
      const merged = existingStyle ? `${existingStyle}; ${breakInline}` : breakInline;
      $root.attr('style', merged);
    }

    // Serialise only the outer HTML of the root element so we don't
    // leak cheerio's synthetic <html><head><body> scaffolding.
    return $.html($root);
  }

  // ── TOC auto-generation ─────────────────────────────────────────

  /**
   * If the TOC fragment body is effectively empty, build a
   * `<nav class="pengui-toc"><ol>…</ol></nav>` from the sibling plans,
   * filtered by documentMeta.toc.includeKinds (default: chapter_header).
   *
   * If the TOC fragment has a non-empty body, we respect the author's
   * choice and return it unchanged.
   */
  private renderTocFragment(
    originalHtml: string,
    allPlans: Array<{ section: Section; domId: string; kind: SectionKind }>,
    documentMeta: DocumentMeta,
    warnings: string[],
  ): string {
    const $ = cheerio.load(originalHtml, { xml: false }, false);
    const $root = $('section').first();
    if ($root.length === 0) {
      // Will be caught upstream in projectSectionAttributes — return as-is.
      return originalHtml;
    }

    // ── v4.8 IR `toc` node path ─────────────────────────────────────
    // The IR node renders to `<nav class="pengui-toc" data-pengui-toc="auto">`
    // with an empty `<ol>`. Fill the list in place rather than overwriting
    // the section body, so the author-supplied title and `include_kinds`
    // attribute survive.
    const $autoTocs = $root.find('[data-pengui-toc="auto"]');
    if ($autoTocs.length > 0) {
      $autoTocs.each((_, el) => {
        const $nav = $(el);
        const includeAttr = $nav.attr('data-pengui-toc-include');
        const includeKinds: string[] = includeAttr
          ? includeAttr.split(',').map((s) => s.trim()).filter(Boolean)
          : (documentMeta.toc?.includeKinds ?? ['chapter_header']);
        const includeSet = new Set(includeKinds);
        const entries = allPlans.filter((p) => includeSet.has(p.kind));
        if (entries.length === 0) {
          warnings.push(
            `IR toc node matches no sections (include_kinds=${JSON.stringify(includeKinds)}).`,
          );
        }
        const items = entries
          .map(
            (p) =>
              `<li><a href="#${p.domId}">${escapeHtml(p.section.metadata.title || p.section.id)}</a></li>`,
          )
          .join('');
        $nav.find('ol.pengui-toc-list').html(items);
      });
      return $.html($root);
    }

    // ── Legacy auto-fill path (empty kind='toc' fragment) ──────────
    // "Empty" means no element children and only whitespace text.
    const childElementCount = $root.children().length;
    const textOnly = $root.text().trim();
    const isEmpty = childElementCount === 0 && textOnly.length === 0;

    if (!isEmpty) return originalHtml;

    if (!documentMeta.toc) {
      warnings.push(
        'Section of kind=toc is empty but documentMeta.toc is not set; composer left it empty.',
      );
      return originalHtml;
    }

    const includeKinds: SectionKind[] = documentMeta.toc.includeKinds ?? ['chapter_header'];
    const includeSet = new Set(includeKinds);

    const entries = allPlans.filter((p) => includeSet.has(p.kind));

    if (entries.length === 0) {
      warnings.push(
        `Section of kind=toc would be empty (no sections match includeKinds=${JSON.stringify(includeKinds)}).`,
      );
      // Still emit an empty nav so the page doesn't show nothing.
    }

    const items = entries
      .map(
        (p) =>
          `<li><a href="#${p.domId}">${escapeHtml(p.section.metadata.title || p.section.id)}</a></li>`,
      )
      .join('');

    $root.html(`<nav class="pengui-toc"><h2>Contents</h2><ol>${items}</ol></nav>`);

    return $.html($root);
  }

  // ── <style> block builders ─────────────────────────────────────

  /** Soul tokens — one unambiguous :root block. */
  private buildSoulTokensBlock(soul: DesignSoul): string {
    const css = stripRedundantRootWrapper(soul.cssTokens ?? '');
    return `<style id="pengui-soul-tokens">${css}</style>`;
  }

  /**
   * Per-node pengui-* stylesheet — soul-neutral, var()-driven. Registered
   * once at the document level so section fragments stay <style>-tag-free
   * (section-structural rule). Mirrors what slide-mode embeds inline.
   */
  private buildNodeStylesBlock(): string {
    return `<style id="pengui-node-styles">${NODE_CSS}</style>`;
  }

  /** @page size + margins + universal break rules. */
  private buildPrintBaseBlock(geometry: FormatGeometry, documentMeta: DocumentMeta): string {
    const pageSizeDecl = this.buildPageSizeDecl(geometry);
    const margins = this.buildPageMargins(geometry, documentMeta);
    const marginDecl = `margin: ${margins.top} ${margins.right} ${margins.bottom} ${margins.left};`;

    const universalRules = `
    html, body { background: var(--color-canvas); color: var(--color-text-primary); }
    body {
      font-family: var(--font-body);
      font-size: var(--text-body);
      line-height: var(--leading-body);
    }

    .pengui-figure, .pengui-chart, .pengui-diagram,
    .pengui-callout, .pengui-quote, .pengui-image,
    /* v4.8: keep alignment grids together. Card grids, metric strips,
       country/comparison rows shear awkwardly across pages otherwise.
       Authors with overflowing-tall grids can override via the section
       break_hints. */
    .pengui-grid, .pengui-two-column {
      break-inside: avoid; page-break-inside: avoid;
    }

    h1, h2, h3 { break-after: avoid-page; page-break-after: avoid; }

    table { break-inside: auto; page-break-inside: auto; width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    /* v4.8: don't orphan the table caption on a previous page from its
       header row. Caption sticks to the first thead row. */
    caption { break-after: avoid; page-break-after: avoid; }

    p, li, dd { orphans: 3; widows: 3; }

    /*
     * Full-page sections ALWAYS pair with chrome-off (@page nochrome,
     * margin: 0). In that context 100vh equals the full page size AND
     * the full content area, so the section can simply fill 100vh.
     *
     * We use explicit height (not min/max-height) so a child with
     * height:100% resolves against a concrete parent height -- CSS
     * only resolves percentage heights against parents that have
     * height, not min-height/max-height. Without this, covers using
     * a flex-column inner div with height:100% collapse to
     * content-height and you see the canvas bleed through above/below.
     *
     * overflow:hidden clips authored inner content to the page.
     */
    .pengui-section[data-full-page="true"] {
      box-sizing: border-box;
      height: 100vh;
      /* Zero padding on the section wrapper: the full-page content band
         IS the section, and any padding applied at this level shrinks
         the space available for children using height:100%. Authors put
         layout padding on INNER wrappers. */
      padding: 0 !important;
      margin: 0 !important;
      overflow: hidden;
      break-after: page; page-break-after: always;
    }
    /* Last full-page section in a document shouldn't force a trailing
       blank page in some Chromium versions. */
    .pengui-section[data-full-page="true"]:last-of-type {
      break-after: auto; page-break-after: auto;
    }
    .pengui-section[data-reset-page-counter="true"] { counter-reset: page 1; }`;

    return `<style id="pengui-print-base">
    @page {
      ${pageSizeDecl}
      ${marginDecl}
    }
${universalRules}
  </style>`;
  }

  /** Block styles — one CSS file per recipe, concatenated. */
  private buildBlockStylesBlock(
    plans: Array<{ kind: SectionKind }>,
    documentMeta: DocumentMeta,
  ): string {
    // Collect unique kinds present in this compose. Always include TOC
    // when documentMeta.toc is set (even if no toc section exists yet)
    // so authors can preview consistent styling; but this is cheap so no
    // harm.
    const kinds = new Set<SectionKind>();
    for (const p of plans) kinds.add(p.kind);
    if (documentMeta.toc) kinds.add('toc');

    const blocks: string[] = [];
    for (const kind of kinds) {
      const css = this.loadRecipeCss(kind);
      if (css !== null) {
        blocks.push(`/* ── ${kind} ─────────────────────────── */\n${css}`);
      }
    }

    return `<style id="pengui-block-styles">
${blocks.join('\n\n')}
  </style>`;
  }

  /**
   * Running chrome via CSS `@page` margin boxes.
   *
   * Chromium supports the CSS Paged Media Level 3 margin boxes
   * (@top-left, @top-center, @top-right, @bottom-left, @bottom-center,
   * @bottom-right). `counter(page)` and `counter(pages)` only resolve
   * inside margin boxes — NOT in body-level pseudo-elements — so the
   * header/footer HTML approach cannot reliably show page numbers.
   *
   * Strategy:
   *   - Default @page emits the deck-level running title top-right and
   *     page counter bottom-right.
   *   - Per-chapter named @page rules override @top-right with the
   *     chapter title.
   *   - @page nochrome has empty margin boxes for cover / chrome-off
   *     sections. We also set its margin to 0 so the page is full-bleed
   *     for those hero layouts.
   */
  private buildChromeBlock(
    plans: Array<{
      section: Section;
      kind: SectionKind;
      chromeOff: boolean;
      runningTitlePageName: string | null;
    }>,
    deck: Deck,
    documentMeta: DocumentMeta,
  ): string {
    const deckRunningTitle =
      (documentMeta.chrome?.runningTitle ?? deck.title ?? '').toString();
    const deckRunningTitleCss = escapeCssString(deckRunningTitle);
    const showPageNumber = documentMeta.chrome?.pageNumber !== false;

    // Build map of unique page-name → running title. Per-chapter running
    // titles get their own named @page rule with overridden @top-right.
    const perPageNames = new Map<string, string>();
    for (const p of plans) {
      if (p.runningTitlePageName) {
        const override = p.section.metadata.chromeOverrides?.runningTitle;
        if (typeof override === 'string' && override.trim().length > 0) {
          perPageNames.set(p.runningTitlePageName, override);
        }
      }
    }

    const chromeStyles = `
      font-size: 9pt;
      font-family: var(--font-body);
      color: var(--color-text-secondary);
    `;

    const namedPageBlocks = [...perPageNames.entries()]
      .map(
        ([name, title]) => `
    @page ${name} {
      @top-right { content: "${escapeCssString(title)}"; ${chromeStyles.trim()} }
      ${showPageNumber ? `@bottom-right { content: counter(page) " / " counter(pages); ${chromeStyles.trim()} }` : ''}
    }
    .pengui-section[data-running-title="${name}"] { page: ${name}; }`,
      )
      .join('\n');

    // Chrome-off named page: empty margin boxes + zero margin so the
    // full-page hero sections render edge-to-edge.
    const chromeOffBlock = `
    @page nochrome {
      margin: 0;
      @top-left    { content: none; }
      @top-center  { content: none; }
      @top-right   { content: none; }
      @bottom-left { content: none; }
      @bottom-center { content: none; }
      @bottom-right { content: none; }
    }
    .pengui-section[data-chrome="off"] { page: nochrome; }`;

    return `<style id="pengui-chrome">
    @page {
      ${deckRunningTitle ? `@top-right { content: "${deckRunningTitleCss}"; ${chromeStyles.trim()} }` : ''}
      ${showPageNumber ? `@bottom-right { content: counter(page) " / " counter(pages); ${chromeStyles.trim()} }` : ''}
    }
${namedPageBlocks}
${chromeOffBlock}
  </style>`;
  }

  // ── @page size/margin resolution ───────────────────────────────

  private buildPageSizeDecl(geometry: FormatGeometry): string {
    if (geometry.physicalPage) {
      // A4 / Letter / future named sizes.
      return `size: ${geometry.physicalPage} ${geometry.orientation};`;
    }
    // Screen-sized fallback — express in explicit pixels. Kept for
    // completeness; document-model decks currently always have a
    // physicalPage, but slide formats are used in unit tests.
    return `size: ${geometry.widthPx}px ${geometry.heightPx}px;`;
  }

  /**
   * Resolve the four @page margins as CSS strings. Callers that need
   * arithmetic on top+bottom (e.g. to size a full-page section inside
   * the content area) read from here instead of re-parsing the decl.
   */
  private buildPageMargins(
    geometry: FormatGeometry,
    documentMeta: DocumentMeta,
  ): { top: string; right: string; bottom: string; left: string } {
    const override = documentMeta.pageMargin;
    if (override) {
      return override;
    }
    // Default: derive from safe-area-inset. 96px → 25.4mm (too wide for
    // print), so we clamp to typical print bands and give a taller
    // bottom margin for the page-number footer.
    const basePxMm = Math.max(10, pxToMm(geometry.safeAreaInsetPx));
    const top = 18;
    const sides = Math.min(20, Math.max(12, Math.round(basePxMm * 0.75)));
    const bottom = 22;
    return { top: `${top}mm`, right: `${sides}mm`, bottom: `${bottom}mm`, left: `${sides}mm` };
  }


  // ── Recipe CSS loading (cached) ────────────────────────────────

  private loadRecipeCss(kind: SectionKind): string | null {
    const path = resolvePath(TEMPLATES_DIR, `${kind}.css`);
    const cached = this.cssCache.get(path);
    if (cached !== undefined) return cached;

    try {
      const text = readFileSync(path, 'utf8');
      this.cssCache.set(path, text);
      return text;
    } catch (err) {
      // Log but do not throw — missing recipe CSS simply means the
      // composer has no block styles for that kind. Authors can still
      // compose the doc; it just won't carry the recipe styling.
      this.logger.warn('DocumentComposer: recipe CSS missing', {
        kind,
        path,
        error: err instanceof Error ? err.message : String(err),
      });
      this.cssCache.set(path, '');
      return null;
    }
  }
}
