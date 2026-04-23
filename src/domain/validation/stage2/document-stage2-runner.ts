/**
 * Document Stage 2 Runner — render-truth validation for continuous docs.
 *
 * Composes the full document, runs Chromium against it, and executes
 * pagination-aware checks (split-keep-together, orphan-heading) plus
 * reusable render-truth checks that work on any rendered HTML
 * (contrast-checker, legibility-check, color-sampler).
 *
 * This is the document-mode counterpart of Stage2Runner (slide-shaped,
 * with overflow-detector scoped to a single .slide bounds).
 */

import type {
  Stage2Check,
  ValidationContext,
  ValidationIssue,
} from '../../../types/validation.js';
import { ContrastChecker } from './contrast-checker.js';
import { ColorSampler } from './color-sampler.js';
import { LegibilityCheck } from './legibility-check.js';
import { SplitKeepTogetherCheck } from './split-keep-together.js';
import { OrphanHeadingCheck } from './orphan-heading.js';

export interface DocumentStage2Result {
  issues: ValidationIssue[];
  elapsedMs: number;
}

export class DocumentStage2Runner {
  private readonly checks: Stage2Check[];

  constructor() {
    // Order: pagination-specific checks first (they're the whole point
    // of document mode), then reusable render-truth checks.
    this.checks = [
      new SplitKeepTogetherCheck(),
      new OrphanHeadingCheck(),
      new ContrastChecker(),
      new ColorSampler(),
      new LegibilityCheck(),
    ];
  }

  async run(
    page: unknown,
    soulTokenNames: string[],
    context?: ValidationContext,
  ): Promise<DocumentStage2Result> {
    const start = performance.now();
    const issues: ValidationIssue[] = [];

    for (const check of this.checks) {
      const checkIssues = await check.run(page, soulTokenNames, context);
      issues.push(...checkIssues);
    }

    const elapsedMs = Math.round(performance.now() - start);
    return { issues, elapsedMs };
  }
}
