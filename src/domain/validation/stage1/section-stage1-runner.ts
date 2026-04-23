/**
 * Section Stage 1 Runner — continuous-document authoring model.
 *
 * Runs the fragment-level static lints on a section's HTML. This is the
 * document-mode counterpart of `Stage1Runner` (which is page-shaped and
 * assumes a full HTML doc with a `.slide` root).
 *
 * Checks included:
 *   - section-structural     (fragment contract: no DOCTYPE, single <section> root, no :root, ...)
 *   - section-wrapper-class  (keep-together kinds carry .pengui-figure/.pengui-chart/...)
 *   - section-figure-shape   (kind: figure → <figure><figcaption>)
 *   - section-table-shape    (kind: table → <table><thead><tbody>)
 *   - token-compliance       (all colors resolve via var(--*))
 *   - font-compliance        (font-family values match soul allowlist)
 *   - network-isolation      (no external urls / remote fonts)
 *
 * Explicitly EXCLUDED vs. Stage1Runner:
 *   - safe-area-check        (no .slide wrapper; page margins live on @page)
 *   - undefined-variables    (soul tokens are injected once by the composer,
 *                             not per section; this check needs the composed
 *                             document to be accurate)
 *   - structural-check       (slide-shaped; replaced by section-structural)
 *   - spacing-compliance     (padding-via-token rule is slide-scoped)
 *   - diagram-legibility     (render-truth; covered in Stage 2 for documents)
 */

import type {
  Stage1Check,
  ValidationContext,
  ValidationIssue,
} from '../../../types/validation.js';
import { TokenComplianceCheck } from './token-compliance.js';
import { FontComplianceCheck } from './font-compliance.js';
import { NetworkIsolationCheck } from './network-isolation.js';
import {
  SectionStructuralCheck,
  type SectionStage1Context,
} from './section-structural.js';
export type { SectionStage1Context } from './section-structural.js';
import { SectionWrapperClassCheck } from './section-wrapper-class.js';
import { SectionFigureShapeCheck } from './section-figure-shape.js';
import { SectionTableShapeCheck } from './section-table-shape.js';

export interface SectionStage1Result {
  issues: ValidationIssue[];
  elapsedMs: number;
}

export class SectionStage1Runner {
  run(
    html: string,
    soulTokenNames: string[],
    allowedFonts: string[],
    sectionCtx: SectionStage1Context,
    context?: ValidationContext,
  ): SectionStage1Result {
    const start = performance.now();
    const issues: ValidationIssue[] = [];

    const sharedChecks: Stage1Check[] = [
      new TokenComplianceCheck(),
      new FontComplianceCheck(),
      new NetworkIsolationCheck(),
    ];

    const sectionChecks: Stage1Check[] = [
      new SectionStructuralCheck(sectionCtx),
      new SectionWrapperClassCheck(sectionCtx),
      new SectionFigureShapeCheck(sectionCtx),
      new SectionTableShapeCheck(sectionCtx),
    ];

    for (const check of [...sectionChecks, ...sharedChecks]) {
      const checkIssues = check.run(html, soulTokenNames, allowedFonts, context);
      issues.push(...checkIssues);
    }

    const elapsedMs = Math.round(performance.now() - start);
    return { issues, elapsedMs };
  }
}
