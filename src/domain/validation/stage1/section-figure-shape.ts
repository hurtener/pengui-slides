/**
 * Section Figure-Shape Check (Stage 1)
 *
 * `kind: figure` sections must contain exactly one `<figure>` element with
 * a nested `<figcaption>`. This is a semantic/accessibility contract and
 * also matches the composer's block CSS expectations.
 */

import * as cheerio from 'cheerio';
import type { Stage1Check, ValidationIssue } from '../../../types/validation.js';
import type { SectionStage1Context } from './section-structural.js';

export class SectionFigureShapeCheck implements Stage1Check {
  readonly id = 'section-figure-shape';
  readonly name = 'Section Figure Shape';

  constructor(private readonly sectionCtx: SectionStage1Context) {}

  run(html: string): ValidationIssue[] {
    if (this.sectionCtx.kind !== 'figure' && this.sectionCtx.kind !== 'image') {
      return [];
    }
    const issues: ValidationIssue[] = [];
    const $ = cheerio.load(html);

    const figures = $('figure');
    if (figures.length === 0) {
      issues.push({
        id: `${this.id}-missing-figure`,
        stage: 'stage1_lint',
        severity: 'error',
        rule: this.id,
        message: `Section of kind "${this.sectionCtx.kind}" must contain a <figure> element.`,
        fixSuggestion:
          '<figure class="pengui-figure"><svg|img>...</svg|img><figcaption>…</figcaption></figure>',
      });
      return issues;
    }

    if (figures.length > 1) {
      issues.push({
        id: `${this.id}-multiple-figures`,
        stage: 'stage1_lint',
        severity: 'warning',
        rule: this.id,
        message:
          `Section of kind "${this.sectionCtx.kind}" contains ${figures.length} <figure> elements. ` +
          'A single-figure section is easier to paginate (the section-level break-inside: avoid applies to the full block). Multiple figures risk splitting.',
        fixSuggestion:
          'Split the fragment into one section per figure, or accept the split risk.',
      });
    }

    figures.each((_i, el) => {
      const $fig = $(el);
      if ($fig.find('figcaption').length === 0) {
        issues.push({
          id: `${this.id}-missing-figcaption`,
          stage: 'stage1_lint',
          severity: 'warning',
          rule: this.id,
          message:
            '<figure> is missing a <figcaption>. Captions provide context for readers and assistive tech; they are almost never optional in print documents.',
          fixSuggestion: 'Add `<figcaption>Short caption with figure number.</figcaption>` inside the figure.',
        });
      }
    });

    return issues;
  }
}
