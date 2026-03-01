/**
 * Stage 1 Runner
 *
 * Instantiates and runs all Stage 1 (static lint) checks against
 * the provided slide HTML. Returns aggregated issues and elapsed time.
 */

import type { Stage1Check, ValidationIssue } from '../../../types/validation.js';
import { TokenComplianceCheck } from './token-compliance.js';
import { FontComplianceCheck } from './font-compliance.js';
import { SpacingComplianceCheck } from './spacing-compliance.js';
import { StructuralCheck } from './structural-check.js';
import { NetworkIsolationCheck } from './network-isolation.js';
import { SafeAreaCheck } from './safe-area-check.js';

export interface Stage1Result {
  issues: ValidationIssue[];
  elapsedMs: number;
}

export class Stage1Runner {
  private readonly checks: Stage1Check[];

  constructor() {
    this.checks = [
      new TokenComplianceCheck(),
      new FontComplianceCheck(),
      new SpacingComplianceCheck(),
      new StructuralCheck(),
      new NetworkIsolationCheck(),
      new SafeAreaCheck(),
    ];
  }

  run(html: string, soulTokenNames: string[], allowedFonts: string[]): Stage1Result {
    const start = performance.now();
    const issues: ValidationIssue[] = [];

    for (const check of this.checks) {
      const checkIssues = check.run(html, soulTokenNames, allowedFonts);
      issues.push(...checkIssues);
    }

    const elapsedMs = Math.round(performance.now() - start);
    return { issues, elapsedMs };
  }
}
