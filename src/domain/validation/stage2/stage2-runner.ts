/**
 * Stage 2 Runner
 *
 * Instantiates and runs all Stage 2 (render-truth) checks sequentially
 * against a Playwright Page. Returns aggregated issues and elapsed time.
 */

import type { Stage2Check, ValidationIssue } from '../../../types/validation.js';
import { ContrastChecker } from './contrast-checker.js';
import { OverflowDetector } from './overflow-detector.js';
import { ColorSampler } from './color-sampler.js';
import { LegibilityCheck } from './legibility-check.js';

export interface Stage2Result {
  issues: ValidationIssue[];
  elapsedMs: number;
}

export class Stage2Runner {
  private readonly checks: Stage2Check[];

  constructor() {
    this.checks = [
      new ContrastChecker(),
      new OverflowDetector(),
      new ColorSampler(),
      new LegibilityCheck(),
    ];
  }

  async run(page: unknown, soulTokenNames: string[]): Promise<Stage2Result> {
    const start = performance.now();
    const issues: ValidationIssue[] = [];

    // Run checks sequentially to avoid race conditions on the page
    for (const check of this.checks) {
      const checkIssues = await check.run(page, soulTokenNames);
      issues.push(...checkIssues);
    }

    const elapsedMs = Math.round(performance.now() - start);
    return { issues, elapsedMs };
  }
}
