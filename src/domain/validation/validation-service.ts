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
import type {
  ValidationResult,
  ValidationIssue,
  ValidationDepth,
  StyleScore,
} from '../../types/validation.js';
import type { ISoulStore } from '../../storage/interfaces.js';
import type { PenguiConfig } from '../../config.js';
import type { Logger } from '../../infrastructure/logger.js';
import { SoulNotFoundError } from '../../types/errors.js';
import { Stage1Runner } from './stage1/stage1-runner.js';
import { Stage2Runner } from './stage2/stage2-runner.js';

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
    depth: ValidationDepth = 'lint'
  ): Promise<ValidationResult> {
    this.logger.info('Starting slide validation', { soulId, depth });

    // ── Resolve the Design Soul ─────────────────────────────────────
    const soul = await this.soulStore.get(soulId);
    if (!soul) {
      throw new SoulNotFoundError(soulId);
    }

    const soulTokenNames = soul.tokenNames;
    const allowedFonts = soul.allowedFonts;

    // ── Stage 1: Static Lint ────────────────────────────────────────
    const stage1Runner = new Stage1Runner();
    const stage1Result = stage1Runner.run(html, soulTokenNames, allowedFonts);

    this.logger.debug('Stage 1 complete', {
      issueCount: stage1Result.issues.length,
      elapsedMs: stage1Result.elapsedMs,
    });

    let allIssues: ValidationIssue[] = [...stage1Result.issues];
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
          viewport: { width: this.config.slideWidth, height: this.config.slideHeight },
        });
        const page = await context.newPage();

        // Load the slide HTML into the page
        await page.setContent(html, { waitUntil: 'networkidle' });

        const stage2Runner = new Stage2Runner();
        const stage2Result = await stage2Runner.run(page, soulTokenNames);
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
}
