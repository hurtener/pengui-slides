/**
 * Structural Check (Stage 1)
 *
 * Verifies the slide HTML contains the required structural elements:
 * - @slide-meta comment with valid JSON
 * - Root .slide container div
 * - DOCTYPE declaration
 */

import * as cheerio from 'cheerio';
import type { Stage1Check, ValidationIssue } from '../../../types/validation.js';

/** Regex to extract @slide-meta JSON from HTML comments. */
const SLIDE_META_REGEX = /<!--\s*@slide-meta\s+([\s\S]*?)-->/;

export class StructuralCheck implements Stage1Check {
  readonly id = 'structural-check';
  readonly name = 'Structural Integrity';

  run(html: string, _soulTokenNames: string[], _allowedFonts: string[]): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // ── Check DOCTYPE ───────────────────────────────────────────────
    if (!html.trimStart().toLowerCase().startsWith('<!doctype')) {
      issues.push({
        id: `${this.id}-doctype`,
        stage: 'stage1_lint',
        severity: 'error',
        rule: this.id,
        message: 'Missing DOCTYPE declaration. Slide HTML must begin with <!DOCTYPE html>.',
        expected: '<!DOCTYPE html>',
        fixSuggestion: 'Add <!DOCTYPE html> at the very beginning of the HTML document.',
      });
    }

    // ── Check @slide-meta comment ───────────────────────────────────
    const metaMatch = SLIDE_META_REGEX.exec(html);
    if (!metaMatch) {
      issues.push({
        id: `${this.id}-meta-missing`,
        stage: 'stage1_lint',
        severity: 'error',
        rule: this.id,
        message: 'Missing @slide-meta comment block. Each slide must include a <!-- @slide-meta {...} --> comment.',
        expected: '<!-- @slide-meta {"layout":"...", ...} -->',
        fixSuggestion: 'Add a <!-- @slide-meta {"layout":"...", "title":"..."} --> comment to the HTML.',
      });
    } else {
      // Validate the JSON inside the meta comment
      const jsonStr = metaMatch[1].trim();
      try {
        JSON.parse(jsonStr);
      } catch {
        issues.push({
          id: `${this.id}-meta-invalid`,
          stage: 'stage1_lint',
          severity: 'error',
          rule: this.id,
          message: 'The @slide-meta comment contains invalid JSON.',
          actual: jsonStr.slice(0, 100),
          fixSuggestion: 'Ensure the @slide-meta comment contains valid JSON (e.g. <!-- @slide-meta {"layout":"title"} -->).',
        });
      }
    }

    // ── Check root .slide container ─────────────────────────────────
    const $ = cheerio.load(html);
    const slideContainer = $('div.slide');
    if (slideContainer.length === 0) {
      issues.push({
        id: `${this.id}-root-container`,
        stage: 'stage1_lint',
        severity: 'error',
        rule: this.id,
        message: 'Missing root container: a <div class="slide"> element is required.',
        expected: '<div class="slide">',
        fixSuggestion: 'Wrap slide content in a <div class="slide">...</div> container.',
      });
    }

    return issues;
  }
}
