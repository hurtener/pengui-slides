/**
 * Validation Service
 *
 * Orchestrates the two-stage validation pipeline for slide HTML:
 * 1. Stage 1 (lint): Fast static analysis with cheerio + postcss
 * 2. Stage 2 (full): Playwright-based rendered truth analysis
 *
 * Computes a StyleScore from accumulated issues and returns a
 * comprehensive ValidationResult.
 */

import type { SoulId } from '../../types/common.js';
import type { FormatGeometry, FormatKind } from '../../types/format.js';
import type {
  ValidationResult,
  ValidationIssue,
  ValidationDepth,
  ValidationContext,
  StyleScore,
} from '../../types/validation.js';
import type { ISoulStore } from '../../storage/interfaces.js';
import type { PenguiConfig } from '../../config.js';
import type { Logger } from '../../infrastructure/logger.js';
import { SoulNotFoundError } from '../../types/errors.js';
import { getFormat } from '../formats/format-registry.js';
import { applyDefensiveDefaults, type Injection } from './stage0/defensive-injector.js';
import { Stage1Runner } from './stage1/stage1-runner.js';
import { Stage2Runner } from './stage2/stage2-runner.js';
import {
  SectionStage1Runner,
  type SectionStage1Context,
} from './stage1/section-stage1-runner.js';
import { DocumentStage2Runner } from './stage2/document-stage2-runner.js';
import { DocumentComposer } from '../rendering/document-composer.js';
import type { Section } from '../../types/section.js';
import type { Deck, DocumentMeta } from '../../types/deck.js';
import type { AssetService } from '../assets/asset-service.js';
import { buildColorTokenLookup } from '../souls/color-token-lookup.js';

// ── Score Weights ──────────────────────────────────────────────────

const SCORE_WEIGHTS = {
  token: 0.3,
  typo: 0.15,
  spacing: 0.15,
  contrast: 0.25,
  structural: 0.15,
} as const;

// ── Rule-to-subscore mapping ───────────────────────────────────────

const RULE_CATEGORY: Record<string, keyof typeof SCORE_WEIGHTS> = {
  'token-compliance': 'token',
  'font-compliance': 'typo',
  'spacing-compliance': 'spacing',
  'structural-check': 'structural',
  'network-isolation': 'structural',
  'safe-area-check': 'structural',
  'contrast-checker': 'contrast',
  'overflow-detector': 'structural',
  'color-sampler': 'token',
  'legibility-check': 'contrast',
  // Section / document-mode rules
  'section-structural': 'structural',
  'section-wrapper-class': 'structural',
  'section-figure-shape': 'structural',
  'section-table-shape': 'structural',
  'split-keep-together': 'structural',
  'orphan-heading': 'structural',
};

/** Deduction per error issue. */
const ERROR_DEDUCTION = 0.2;
/** Deduction per warning issue. */
const WARNING_DEDUCTION = 0.05;

/** Clamp a value to [0, 1]. */
function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Compute the StyleScore from a list of validation issues.
 */
function computeStyleScore(issues: ValidationIssue[]): StyleScore {
  const subscores: Record<keyof typeof SCORE_WEIGHTS, number> = {
    token: 1.0,
    typo: 1.0,
    spacing: 1.0,
    contrast: 1.0,
    structural: 1.0,
  };

  for (const issue of issues) {
    const category = RULE_CATEGORY[issue.rule];
    if (!category) continue;

    const deduction = issue.severity === 'error' ? ERROR_DEDUCTION : issue.severity === 'warning' ? WARNING_DEDUCTION : 0;
    subscores[category] -= deduction;
  }

  // Clamp all subscores
  for (const key of Object.keys(subscores) as Array<keyof typeof subscores>) {
    subscores[key] = clamp01(subscores[key]);
  }

  // Weighted average for overall score
  const overall = clamp01(
    subscores.token * SCORE_WEIGHTS.token +
    subscores.typo * SCORE_WEIGHTS.typo +
    subscores.spacing * SCORE_WEIGHTS.spacing +
    subscores.contrast * SCORE_WEIGHTS.contrast +
    subscores.structural * SCORE_WEIGHTS.structural
  );

  return {
    overall,
    tokenCompliance: subscores.token,
    typographyConsistency: subscores.typo,
    spacingConsistency: subscores.spacing,
    contrastAccessibility: subscores.contrast,
    structuralIntegrity: subscores.structural,
  };
}

export class ValidationService {
  private readonly soulStore: ISoulStore;
  private readonly config: PenguiConfig;
  private readonly logger: Logger;

  constructor(soulStore: ISoulStore, config: PenguiConfig, logger: Logger) {
    this.soulStore = soulStore;
    this.config = config;
    this.logger = logger;
  }

  async validateSlide(
    html: string,
    soulId: SoulId,
    depth: ValidationDepth = 'lint',
    format?: FormatKind,
  ): Promise<ValidationResult> {
    this.logger.info('Starting slide validation', { soulId, depth, format });

    // ── Resolve the Design Soul ─────────────────────────────────────
    const soul = await this.soulStore.get(soulId);
    if (!soul) {
      throw new SoulNotFoundError(soulId);
    }

    const soulTokenNames = soul.tokenNames;
    const allowedFonts = soul.allowedFonts;
    const resolvedFormat = format ?? 'slides_16_9';
    const geometry: FormatGeometry = getFormat(resolvedFormat).geometry;
    const colorTokenLookup = buildColorTokenLookup(soul.layers);
    const validationContext: ValidationContext = {
      geometry,
      formatKind: resolvedFormat,
      colorTokenLookup,
    };

    // ── Stage 0: Defensive defaults (sensible-defaults injection) ───
    // Fills in hygiene defaults (html/body margin reset, * box-sizing,
    // .slide position:relative + overflow:hidden) if the author's HTML
    // is missing them. Author rules later in the cascade always win,
    // so design intent is preserved. Emits info-level notes per
    // default filled in so the author learns the pattern.
    const stage0 = applyDefensiveDefaults(html);
    const stage0Issues: ValidationIssue[] = stage0.injections.map((injection) =>
      this.buildStage0InfoIssue(injection),
    );
    const validationHtml = stage0.html;

    // ── Stage 1: Static Lint ────────────────────────────────────────
    const stage1Runner = new Stage1Runner();
    const stage1Result = stage1Runner.run(validationHtml, soulTokenNames, allowedFonts, validationContext);

    this.logger.debug('Stage 1 complete', {
      issueCount: stage1Result.issues.length,
      elapsedMs: stage1Result.elapsedMs,
    });

    let allIssues: ValidationIssue[] = [...stage0Issues, ...stage1Result.issues];
    let stage2ElapsedMs: number | undefined;
    let stage2Skipped = true;

    // ── Stage 2: Render Truth (optional) ────────────────────────────
    if (depth === 'full') {
      stage2Skipped = false;
      let browser: import('playwright').Browser | undefined;

      try {
        // Dynamic import to avoid loading Playwright for lint-only runs
        const pw = await import('playwright');
        browser = await pw.chromium.launch({ headless: this.config.headless });
        const context = await browser.newContext({
          viewport: { width: geometry.widthPx, height: geometry.heightPx },
        });
        const page = await context.newPage();

        // Load the Stage-0-augmented HTML so the rendered truth matches
        // what the exporter will produce (both apply defensive defaults).
        await page.setContent(validationHtml, { waitUntil: 'networkidle' });

        const stage2Runner = new Stage2Runner();
        const stage2Result = await stage2Runner.run(page, soulTokenNames, validationContext);
        stage2ElapsedMs = stage2Result.elapsedMs;

        allIssues = [...allIssues, ...stage2Result.issues];

        this.logger.debug('Stage 2 complete', {
          issueCount: stage2Result.issues.length,
          elapsedMs: stage2Result.elapsedMs,
        });

        await context.close();
      } catch (err) {
        this.logger.error('Stage 2 validation failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        // Stage 2 failure is not fatal; report it as an issue
        allIssues.push({
          id: 'stage2-runtime-error',
          stage: 'stage2_render',
          severity: 'warning',
          rule: 'stage2-runner',
          message: `Stage 2 validation failed: ${err instanceof Error ? err.message : String(err)}`,
          fixSuggestion: 'Ensure Playwright is installed and the HTML is valid.',
        });
      } finally {
        if (browser) {
          await browser.close();
        }
      }
    }

    // ── Compute scores ──────────────────────────────────────────────
    const styleScore = computeStyleScore(allIssues);

    const errorCount = allIssues.filter((i) => i.severity === 'error').length;
    const warningCount = allIssues.filter((i) => i.severity === 'warning').length;
    const infoCount = allIssues.filter((i) => i.severity === 'info').length;

    const result: ValidationResult = {
      passed: errorCount === 0,
      issues: allIssues,
      styleScore,
      errorCount,
      warningCount,
      infoCount,
      stage1ElapsedMs: stage1Result.elapsedMs,
      stage2ElapsedMs,
      stage2Skipped,
      validatedAt: new Date().toISOString(),
    };

    this.logger.info('Validation complete', {
      passed: result.passed,
      errorCount,
      warningCount,
      infoCount,
      overallScore: styleScore.overall.toFixed(3),
    });

    return result;
  }

  /**
   * Validate a single Section FRAGMENT against its deck's soul.
   *
   * Fast path: runs only the section Stage 1 checks (no Playwright).
   * Meant to be called from add_section / update_section so authors see
   * fragment-contract errors in one turn. Stage 2 (render-truth) runs
   * later via validateDocument at export time or on explicit request.
   */
  async validateSection(
    section: Pick<Section, 'id' | 'kind' | 'html'>,
    soulId: SoulId,
    format?: FormatKind,
  ): Promise<ValidationResult> {
    this.logger.info('Starting section validation', {
      soulId,
      sectionId: section.id,
      kind: section.kind,
      format,
    });

    const soul = await this.soulStore.get(soulId);
    if (!soul) {
      throw new SoulNotFoundError(soulId);
    }

    const soulTokenNames = soul.tokenNames;
    const allowedFonts = soul.allowedFonts;
    const resolvedFormat = format ?? 'print_a4_portrait';
    const geometry: FormatGeometry = getFormat(resolvedFormat).geometry;
    const colorTokenLookup = buildColorTokenLookup(soul.layers);
    const validationContext: ValidationContext = {
      geometry,
      formatKind: resolvedFormat,
      colorTokenLookup,
    };
    const sectionCtx: SectionStage1Context = { kind: section.kind };

    const runner = new SectionStage1Runner();
    const stage1Result = runner.run(
      section.html,
      soulTokenNames,
      allowedFonts,
      sectionCtx,
      validationContext,
    );

    const allIssues = stage1Result.issues;
    const styleScore = computeStyleScore(allIssues);
    const errorCount = allIssues.filter((i) => i.severity === 'error').length;
    const warningCount = allIssues.filter((i) => i.severity === 'warning').length;
    const infoCount = allIssues.filter((i) => i.severity === 'info').length;

    return {
      passed: errorCount === 0,
      issues: allIssues,
      styleScore,
      errorCount,
      warningCount,
      infoCount,
      stage1ElapsedMs: stage1Result.elapsedMs,
      stage2Skipped: true,
      validatedAt: new Date().toISOString(),
    };
  }

  /**
   * Validate a composed document (all sections of a deck) end-to-end.
   *
   * Stage 1: runs section-level lints on every fragment (aggregates).
   * Stage 2 (depth === 'full'): composes the full document, renders in
   * Playwright, runs pagination-aware checks (split-keep-together,
   * orphan-heading, figure-exceeds-page).
   *
   * Called by export_pdf for document-mode decks. Stage 2 cost scales
   * with document size but runs in a single browser context.
   */
  async validateDocument(
    deck: Deck,
    sections: Section[],
    soulId: SoulId,
    depth: ValidationDepth = 'lint',
    assetService?: AssetService,
  ): Promise<ValidationResult> {
    this.logger.info('Starting document validation', {
      soulId,
      deckId: deck.id,
      sectionCount: sections.length,
      depth,
    });

    const soul = await this.soulStore.get(soulId);
    if (!soul) {
      throw new SoulNotFoundError(soulId);
    }

    const soulTokenNames = soul.tokenNames;
    const allowedFonts = soul.allowedFonts;
    const resolvedFormat: FormatKind = deck.format ?? 'print_a4_portrait';
    const geometry: FormatGeometry = getFormat(resolvedFormat).geometry;
    const colorTokenLookup = buildColorTokenLookup(soul.layers);
    const validationContext: ValidationContext = {
      geometry,
      formatKind: resolvedFormat,
      colorTokenLookup,
    };

    // Stage 1 — section lints on every fragment.
    const sectionRunner = new SectionStage1Runner();
    const stage1Issues: ValidationIssue[] = [];
    let stage1ElapsedMs = 0;
    for (const section of sections) {
      const result = sectionRunner.run(
        section.html,
        soulTokenNames,
        allowedFonts,
        { kind: section.kind },
        validationContext,
      );
      stage1ElapsedMs += result.elapsedMs;
      // Prefix issue ids with the section's dom id so they can be routed
      // back to a specific section in the UI.
      for (const issue of result.issues) {
        stage1Issues.push({
          ...issue,
          id: `sec-${section.position + 1}:${issue.id}`,
        });
      }
    }

    let stage2Issues: ValidationIssue[] = [];
    let stage2ElapsedMs: number | undefined;
    let stage2Skipped = true;

    if (depth === 'full') {
      stage2Skipped = false;
      let browser: import('playwright').Browser | undefined;

      try {
        // Compose the full document.
        const composer = new DocumentComposer(this.logger.child('document-composer'));
        const composed = await composer.compose({
          sections,
          deck,
          soul,
          geometry,
          documentMeta: deck.documentMeta ?? ({} as DocumentMeta),
          assetService,
        });

        // Launch Playwright, emulate print media, measure.
        const pw = await import('playwright');
        browser = await pw.chromium.launch({ headless: this.config.headless });
        const context = await browser.newContext({
          viewport: { width: geometry.widthPx, height: geometry.heightPx },
        });
        const page = await context.newPage();
        await page.emulateMedia({ media: 'print' });
        await page.setContent(composed.html, { waitUntil: 'networkidle' });

        const runner = new DocumentStage2Runner();
        const result = await runner.run(page, soulTokenNames, validationContext);
        stage2Issues = result.issues;
        stage2ElapsedMs = result.elapsedMs;

        await context.close();
      } catch (err) {
        this.logger.error('Document Stage 2 validation failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        stage2Issues.push({
          id: 'document-stage2-runtime-error',
          stage: 'stage2_render',
          severity: 'warning',
          rule: 'stage2-runner',
          message: `Document Stage 2 validation failed: ${err instanceof Error ? err.message : String(err)}`,
          fixSuggestion: 'Ensure Playwright is installed and the composed document is valid.',
        });
      } finally {
        if (browser) await browser.close();
      }
    }

    const allIssues = [...stage1Issues, ...stage2Issues];
    const styleScore = computeStyleScore(allIssues);
    const errorCount = allIssues.filter((i) => i.severity === 'error').length;
    const warningCount = allIssues.filter((i) => i.severity === 'warning').length;
    const infoCount = allIssues.filter((i) => i.severity === 'info').length;

    return {
      passed: errorCount === 0,
      issues: allIssues,
      styleScore,
      errorCount,
      warningCount,
      infoCount,
      stage1ElapsedMs,
      stage2ElapsedMs,
      stage2Skipped,
      validatedAt: new Date().toISOString(),
    };
  }

  /**
   * Convert a Stage 0 injection into an info-level ValidationIssue so
   * the author sees which defaults the server filled in. Info-severity
   * so it doesn't block export and has zero style-score impact.
   */
  private buildStage0InfoIssue(injection: Injection): ValidationIssue {
    return {
      id: `stage0-defensive-${injection.id}`,
      stage: 'stage1_lint',
      severity: 'info',
      rule: 'stage0-defensive-defaults',
      message:
        `Pengui auto-injected a defensive default for this slide: ${injection.rule}. ` +
        `Reason: ${injection.reason} ` +
        'The injection is low-priority — any explicit rule you author later in the ' +
        'cascade overrides it. Including the rule explicitly in your slide\'s <style> ' +
        'block makes the slide portable outside the Pengui render context.',
      expected: injection.rule,
      actual: 'rule not declared by author; filled in by stage0 defensive injector',
      fixSuggestion: `Add "${injection.rule}" to your slide's <style> block to make the slide self-contained.`,
    };
  }
}
