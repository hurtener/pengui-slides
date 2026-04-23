/**
 * Section Wrapper-Class Check (Stage 1)
 *
 * Keep-together kinds rely on the composer's universal break rules which
 * target canonical wrapper classes (.pengui-figure, .pengui-chart,
 * .pengui-diagram, .pengui-callout, .pengui-quote, .pengui-image). This
 * check verifies the fragment actually carries those wrappers — without
 * them, Chromium will happily split a figure across two pages.
 *
 * Related kind-specific shape checks live in their own files:
 *   - `section-figure-shape.ts` (figure must have <figure><figcaption>)
 *   - `section-table-shape.ts`  (table must have <thead>)
 *   - `section-svg-viewbox.ts`  (chart/diagram SVGs need viewBox)
 */

import * as cheerio from 'cheerio';
import type { Stage1Check, ValidationIssue } from '../../../types/validation.js';
import type { SectionKind } from '../../../types/section.js';
import type { SectionStage1Context } from './section-structural.js';

/** Map of kind → required wrapper-class selector (cheerio-compatible). */
const REQUIRED_WRAPPER: Partial<Record<SectionKind, string>> = {
  figure: '.pengui-figure',
  chart: '.pengui-chart',
  diagram: '.pengui-diagram',
  callout: '.pengui-callout',
  quote: '.pengui-quote',
  image: '.pengui-image',
};

export class SectionWrapperClassCheck implements Stage1Check {
  readonly id = 'section-wrapper-class';
  readonly name = 'Section Keep-Together Wrapper Class';

  constructor(private readonly sectionCtx: SectionStage1Context) {}

  run(html: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const selector = REQUIRED_WRAPPER[this.sectionCtx.kind];
    if (!selector) return issues;

    const $ = cheerio.load(html);
    if ($(selector).length === 0) {
      issues.push({
        id: `${this.id}-missing-${this.sectionCtx.kind}-wrapper`,
        stage: 'stage1_lint',
        severity: 'error',
        rule: this.id,
        message:
          `Section of kind "${this.sectionCtx.kind}" is missing the canonical \`${selector}\` wrapper. ` +
          'The DocumentComposer applies `break-inside: avoid` to this class so the element never splits across pages — without the class, Chromium will paginate through the figure / chart / diagram.',
        expected: `an element (typically <figure> or <aside>) carrying class="${selector.slice(1)}"`,
        fixSuggestion:
          `Wrap the keep-together content in an element with class="${selector.slice(1)}". ` +
          'Example: `<figure class="pengui-figure">...<figcaption>...</figcaption></figure>`.',
      });
    }

    return issues;
  }
}
