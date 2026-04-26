/**
 * Section Structural Check (Stage 1)
 *
 * Enforces the Section fragment contract documented in SPEC-v3.md §3:
 *
 *   1. Root element is a single `<section class="pengui-section pengui-{kind}">`.
 *   2. No document-level wrappers: `<!DOCTYPE>`, `<html>`, `<head>`, `<body>`.
 *   3. No `<script>` tags (network / execution safety).
 *   4. No standalone `<style>` tags (recipe CSS goes through the composer).
 *   5. No `:root { ... }` custom property declarations (composed in once).
 *   6. No page-shaped fixed dimensions on the root wrapper
 *      (`width: 1240px`, `height: 1754px`, `height: 100vh`, `overflow: hidden`).
 *   7. An `@section-meta` HTML comment with valid JSON precedes the wrapper.
 *
 * Fragment lints run on every `add_section` / `update_section` so authors
 * learn the contract in one turn instead of discovering it during export.
 */

import * as cheerio from 'cheerio';
import type { Stage1Check, ValidationIssue } from '../../../types/validation.js';
import type { SectionKind } from '../../../types/section.js';
import { ALL_SECTION_KINDS } from '../../../types/section.js';

export interface SectionStage1Context {
  /** The section's declared kind. Enables kind-specific shape checks. */
  kind: SectionKind;
}

const FORBIDDEN_TAGS = ['html', 'head', 'body', 'script'] as const;
const DOCTYPE_RE = /<!DOCTYPE[^>]*>/i;
const ROOT_BLOCK_RE = /:root\s*\{/i;
const STYLE_TAG_RE = /<style[^>]*>/i;
const FIXED_WIDTH_RE = /width\s*:\s*1240px/i;
const FIXED_HEIGHT_RE = /height\s*:\s*(?:1754px|1650px|100vh)/i;
const OVERFLOW_HIDDEN_RE = /overflow\s*:\s*hidden/i;

/** Pulls the JSON payload from `<!-- @section-meta {...} -->`. */
function extractSectionMetaComment(
  html: string,
): { raw: string; payload: string; parseError?: string } | null {
  const match = html.match(/<!--\s*@section-meta\s+([\s\S]*?)-->/);
  if (!match) return null;
  const raw = match[0];
  const payload = match[1].trim();
  try {
    JSON.parse(payload);
    return { raw, payload };
  } catch (err) {
    return { raw, payload, parseError: String(err) };
  }
}

export class SectionStructuralCheck implements Stage1Check {
  readonly id = 'section-structural';
  readonly name = 'Section Structural Lint';

  constructor(private readonly sectionCtx: SectionStage1Context) {}

  run(html: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const { kind } = this.sectionCtx;

    // ── 1. @section-meta presence + JSON validity ──
    const meta = extractSectionMetaComment(html);
    if (!meta) {
      issues.push({
        id: `${this.id}-missing-meta`,
        stage: 'stage1_lint',
        severity: 'error',
        rule: this.id,
        message:
          'Section fragment is missing the `<!-- @section-meta {...} -->` comment. `add_section` and `update_section` inject this comment automatically from the `metadata` input; if you see this error, either (a) you are calling `validate_section` with raw HTML that was never persisted, or (b) the fragment was mutated outside the normal MCP tool flow.',
        expected: '<!-- @section-meta {"title":"...","kind":"...","narrative":"..."} -->',
        actual: 'no @section-meta comment found',
        fixSuggestion:
          'Persist the section via add_section or update_section (the server auto-injects the comment). Do NOT hand-write the @section-meta comment — it is derived from the metadata struct.',
      });
    } else if (meta.parseError) {
      issues.push({
        id: `${this.id}-invalid-meta-json`,
        stage: 'stage1_lint',
        severity: 'error',
        rule: this.id,
        message: `Section metadata JSON failed to parse: ${meta.parseError}`,
        expected: 'Valid JSON payload inside the @section-meta comment.',
        actual: meta.payload,
      });
    }

    // ── 2. DOCTYPE + forbidden document-level tags ──
    if (DOCTYPE_RE.test(html)) {
      issues.push({
        id: `${this.id}-doctype`,
        stage: 'stage1_lint',
        severity: 'error',
        rule: this.id,
        message:
          'Section fragments must NOT declare `<!DOCTYPE>`. A section is a content block inside a composed document, not a standalone HTML file. The composer emits the DOCTYPE once for the whole document.',
        fixSuggestion:
          'Delete the DOCTYPE and any surrounding <html>/<head>/<body> tags — keep only the `<section class="pengui-section ...">` wrapper.',
      });
    }

    const $ = cheerio.load(html, { xmlMode: false });
    for (const tag of FORBIDDEN_TAGS) {
      // cheerio's `.load()` synthesises an <html><head><body> envelope when
      // parsing a fragment, so we can't just ask for them — they'll always
      // be there. Fall back to regex presence in the raw source.
      const re = new RegExp(`<${tag}[\\s/>]`, 'i');
      if (re.test(html)) {
        issues.push({
          id: `${this.id}-forbidden-tag-${tag}`,
          stage: 'stage1_lint',
          severity: 'error',
          rule: this.id,
          message:
            `Section fragments must NOT contain a <${tag}> tag. Sections are HTML FRAGMENTS — the composer wraps them in the shared document frame. ` +
            (tag === 'script'
              ? 'Scripts are also blocked at render time for safety.'
              : 'Document-level wrappers are provided exactly once by the composer.'),
          fixSuggestion: `Remove the <${tag}> tag. Keep only the <section class="pengui-section ..."> wrapper and its contents.`,
        });
      }
    }

    // ── 3. Standalone <style> blocks and :root declarations ──
    if (STYLE_TAG_RE.test(html)) {
      issues.push({
        id: `${this.id}-style-tag`,
        stage: 'stage1_lint',
        severity: 'error',
        rule: this.id,
        message:
          'Section fragments must NOT contain a standalone `<style>` tag. Recipe CSS is registered once on the composer side and shared across all sections. Inline one-off tweaks via `style="…"` on elements if you absolutely must, but prefer soul tokens.',
        fixSuggestion:
          'Move any CSS rules out of the fragment. Use existing soul tokens via var(--*) for colors, spacing, and typography.',
      });
    }

    if (ROOT_BLOCK_RE.test(html)) {
      issues.push({
        id: `${this.id}-root-block`,
        stage: 'stage1_lint',
        severity: 'error',
        rule: this.id,
        message:
          'Section fragments must NOT declare `:root { ... }` custom properties. Soul tokens are injected once by the DocumentComposer — re-declaring them per-section is a design-breaking override.',
        fixSuggestion:
          'Delete the `:root { ... }` block. Reference tokens with var(--color-canvas), var(--space-safe-area), etc.',
      });
    }

    // ── 4. No page-shaped wrapper dimensions ──
    if (FIXED_WIDTH_RE.test(html)) {
      issues.push({
        id: `${this.id}-fixed-width`,
        stage: 'stage1_lint',
        severity: 'error',
        rule: this.id,
        message:
          'Section fragments must NOT declare `width: 1240px` on the wrapper (or anywhere at the root level). Sections flow inside the composed document; the `@page` box and `<main>` container control width. Fixing the width fights pagination.',
        fixSuggestion:
          'Delete the fixed width. Let the section flex to the page content area, or use percentage-based widths on children.',
      });
    }

    if (FIXED_HEIGHT_RE.test(html)) {
      issues.push({
        id: `${this.id}-fixed-height`,
        stage: 'stage1_lint',
        severity: 'error',
        rule: this.id,
        message:
          'Section fragments must NOT declare `height: 1754px`, `height: 1650px`, or `height: 100vh` on the wrapper. The composer applies `min-height: calc(100vh - ...)` automatically for full-page kinds (cover, chapter_header). For other kinds, let content grow naturally.',
        fixSuggestion:
          'Delete the fixed height. If you need a full-page layout, set `breakHints.fullPage = true` when calling add_section — the composer handles the rest.',
      });
    }

    if (OVERFLOW_HIDDEN_RE.test(html)) {
      issues.push({
        id: `${this.id}-overflow-hidden`,
        stage: 'stage1_lint',
        severity: 'warning',
        rule: this.id,
        message:
          '`overflow: hidden` on a section wrapper clips content that would otherwise flow naturally across page boundaries. It is almost always wrong for continuous documents (and hides rendering bugs instead of fixing them).',
        fixSuggestion:
          'Remove `overflow: hidden` unless you have a narrow decorative reason (e.g., clipping a background shape on a cover). Let Chromium paginate.',
      });
    }

    // ── 5. Root element must be a <section class="pengui-section pengui-{kind}"> ──
    // Use cheerio (not regex) so comments, whitespace, and the meta comment
    // don't confuse detection.
    const bodyContent = $.root().find('body').contents();
    const elementNodes = bodyContent.filter((_i, el) => el.type === 'tag');
    const firstTag = elementNodes.first();

    if (firstTag.length === 0) {
      issues.push({
        id: `${this.id}-no-root-element`,
        stage: 'stage1_lint',
        severity: 'error',
        rule: this.id,
        message:
          'Section fragment has no root element. Expected a single `<section class="pengui-section pengui-{kind}">...</section>` wrapper.',
      });
    } else {
      const firstNode = firstTag[0] as { tagName?: string };
      const tagName = firstNode.tagName?.toLowerCase();
      if (tagName !== 'section' && elementNodes.length === 1) {
        issues.push({
          id: `${this.id}-root-not-section`,
          stage: 'stage1_lint',
          severity: 'error',
          rule: this.id,
          message: `Section fragment root is <${tagName}> but must be <section class="pengui-section pengui-${kind}">.`,
          fixSuggestion:
            `In v4.5 sections are compiled from SectionIR — call update_section with a corrected section_ir. The compiler always emits a <section class="pengui-section pengui-${kind}"> root; this lint firing means the stored fragment was authored before the IR-first migration.`,
        });
      } else if (tagName !== 'section') {
        // Multiple root elements: prefer the wrap hint (covered below). Still
        // note the wrong first-element tag for completeness.
        issues.push({
          id: `${this.id}-root-not-section`,
          stage: 'stage1_lint',
          severity: 'error',
          rule: this.id,
          message: `Section fragment root is <${tagName}> but must be <section class="pengui-section pengui-${kind}">.`,
          fixSuggestion:
            `In v4.5 sections are compiled from SectionIR — call update_section with a corrected section_ir. The compiler always emits a single <section class="pengui-section pengui-${kind}"> root.`,
        });
      } else {
        const classAttr = firstTag.attr('class') ?? '';
        const classList = classAttr.split(/\s+/).filter(Boolean);
        if (!classList.includes('pengui-section')) {
          issues.push({
            id: `${this.id}-missing-pengui-section-class`,
            stage: 'stage1_lint',
            severity: 'error',
            rule: this.id,
            message:
              'Section root element is missing the `pengui-section` class. The composer targets this class for universal break rules and running-chrome scoping.',
            fixSuggestion: `<section class="pengui-section pengui-${kind}">…</section>`,
          });
        }
        if (!classList.includes(`pengui-${kind}`)) {
          issues.push({
            id: `${this.id}-missing-kind-class`,
            stage: 'stage1_lint',
            severity: 'warning',
            rule: this.id,
            message: `Section root is missing the \`pengui-${kind}\` class. The kind-specific class carries recipe-level styling and, for keep-together kinds (figure, chart, diagram, callout, quote, image), the break-inside: avoid rule.`,
            fixSuggestion: `<section class="pengui-section pengui-${kind}">…</section>`,
          });
        }
      }

      // Only one top-level tag node allowed.
      if (elementNodes.length > 1) {
        const summary: string[] = [];
        elementNodes.each((i, el) => {
          const node = $(el);
          const t = (el as { tagName?: string }).tagName?.toLowerCase() ?? '?';
          const id = node.attr('id');
          const cls = (node.attr('class') ?? '').split(/\s+/).filter(Boolean);
          const label = `[${i}] <${t}${id ? `#${id}` : ''}${cls.length ? `.${cls.join('.')}` : ''}>`;
          summary.push(label);
        });
        issues.push({
          id: `${this.id}-multiple-root-elements`,
          stage: 'stage1_lint',
          severity: 'error',
          rule: this.id,
          message:
            `Section fragment has ${elementNodes.length} top-level elements. Expected exactly one <section class="pengui-section ...">. Top-level nodes found: ${summary.join(', ')}.`,
          fixSuggestion:
            `In v4.5 sections are compiled from SectionIR — call update_section with a corrected section_ir. The compiler emits exactly one <section class="pengui-section pengui-${kind}"> root.`,
          actual: summary.join(', '),
        });
      }
    }

    // ── 6. Sanity: declared kind is a known SectionKind ──
    if (!ALL_SECTION_KINDS.includes(kind)) {
      issues.push({
        id: `${this.id}-unknown-kind`,
        stage: 'stage1_lint',
        severity: 'error',
        rule: this.id,
        message: `Unknown section kind "${kind}". Known kinds: ${ALL_SECTION_KINDS.join(', ')}.`,
      });
    }

    return issues;
  }
}
