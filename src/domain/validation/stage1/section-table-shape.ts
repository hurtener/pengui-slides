/**
 * Section Table-Shape Check (Stage 1)
 *
 * `kind: table` sections must use a real <table> (not a flex/grid surrogate)
 * with at least one <thead> row. The composer emits
 * `thead { display: table-header-group }` so the header row automatically
 * repeats on every page the table spans — but only if the author actually
 * used <thead>.
 */

import * as cheerio from 'cheerio';
import type { Stage1Check, ValidationIssue } from '../../../types/validation.js';
import type { SectionStage1Context } from './section-structural.js';

export class SectionTableShapeCheck implements Stage1Check {
  readonly id = 'section-table-shape';
  readonly name = 'Section Table Shape';

  constructor(private readonly sectionCtx: SectionStage1Context) {}

  run(html: string): ValidationIssue[] {
    if (this.sectionCtx.kind !== 'table') return [];
    const issues: ValidationIssue[] = [];
    const $ = cheerio.load(html);

    const tables = $('table');
    if (tables.length === 0) {
      issues.push({
        id: `${this.id}-missing-table`,
        stage: 'stage1_lint',
        severity: 'error',
        rule: this.id,
        message:
          'Section of kind "table" must contain a <table> element. Flexbox and CSS grid surrogates do not paginate correctly in print mode — the browser cannot repeat a pseudo-header row across pages.',
        fixSuggestion:
          '<table><thead><tr><th>…</th></tr></thead><tbody><tr><td>…</td></tr>…</tbody></table>',
      });
      return issues;
    }

    tables.each((_i, el) => {
      const $t = $(el);
      if ($t.find('thead').length === 0) {
        issues.push({
          id: `${this.id}-missing-thead`,
          stage: 'stage1_lint',
          severity: 'warning',
          rule: this.id,
          message:
            '<table> is missing a <thead>. The composer sets `thead { display: table-header-group }` so the header repeats on every page the table spans — missing <thead> means the header shows only on the first page.',
          fixSuggestion:
            'Move the first row (or add a new one) inside a <thead> element with <th> cells.',
        });
      }
      if ($t.find('tbody').length === 0) {
        issues.push({
          id: `${this.id}-missing-tbody`,
          stage: 'stage1_lint',
          severity: 'info',
          rule: this.id,
          message:
            '<table> has no explicit <tbody>. Browsers synthesize one implicitly, but explicit <tbody> is more robust across Chromium/Playwright versions.',
        });
      }
    });

    return issues;
  }
}
