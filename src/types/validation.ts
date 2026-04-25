/**
 * Validation types for Pengui Slides.
 *
 * The validation engine uses a two-stage architecture:
 * - Stage 1 (Static Lint): Fast CSS/HTML parsing (~50ms)
 * - Stage 2 (Render-Truth): Playwright-based computed style analysis (~800ms)
 *
 * Three-tier severity:
 * - error: Hard errors that block export
 * - warning: Soft issues that reduce style score
 * - info: Suggestions for improvement
 */

import type { FormatGeometry, FormatKind } from './format.js';

export type ValidationSeverity = 'error' | 'warning' | 'info';
export type ValidationStage = 'stage1_lint' | 'stage2_render';
export type ValidationDepth = 'lint' | 'full';
export type ValidationPresentationStatus =
  | 'clean'
  | 'edited_with_preexisting_issues'
  | 'regression'
  | 'blocking'
  | 'unvalidated';
export type SlideHealth = 'clean' | 'needs_attention' | 'blocked';

// ── Validation Issue ──────────────────────────────────────────────

export interface ValidationIssue {
  id: string;
  stage: ValidationStage;
  severity: ValidationSeverity;
  rule: string;
  message: string;
  element?: string;
  expected?: string;
  actual?: string;
  line?: number;
  fixSuggestion?: string;
}

export interface ValidationIssueSummary {
  id: string;
  severity: ValidationSeverity;
  rule: string;
  message: string;
  stage: ValidationStage;
}

// ── Style Score ───────────────────────────────────────────────────

export interface StyleScore {
  overall: number;
  tokenCompliance: number;
  typographyConsistency: number;
  spacingConsistency: number;
  contrastAccessibility: number;
  structuralIntegrity: number;
}

// ── Validation Result ─────────────────────────────────────────────

export interface ValidationResult {
  passed: boolean;
  issues: ValidationIssue[];
  styleScore: StyleScore;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  stage1ElapsedMs: number;
  stage2ElapsedMs?: number;
  stage2Skipped: boolean;
  validatedAt: string;
}

export interface ValidationDelta {
  introducedIssues: ValidationIssue[];
  resolvedIssues: ValidationIssue[];
  preExistingIssues: ValidationIssue[];
  blockingIssues: ValidationIssue[];
  status: ValidationPresentationStatus;
  summary: string;
}

export interface ValidationPresentation {
  status: ValidationPresentationStatus;
  headline: string;
  blockingCount: number;
  introducedCount: number;
  preExistingCount: number;
  resolvedCount: number;
  topBlockers: ValidationIssueSummary[];
  topPreExisting: ValidationIssueSummary[];
  showTechnicalDetailsAvailable: boolean;
}

// ── Check Interfaces (Strategy Pattern) ───────────────────────────

/**
 * Optional third argument to check.run() that carries the deck's format
 * geometry. Checks that care about dimensions (safe-area, overflow) read
 * from here; checks that don't may ignore it. When callers omit the
 * geometry, checks fall back to the SLIDES_16_9 defaults to preserve
 * pre-v2.0 behavior for existing slide decks.
 */
export interface ValidationContext {
  geometry: FormatGeometry;
  /**
   * The deck's format kind (e.g. `print_a4_portrait`). Included so error
   * messages can name the format explicitly — "Expected 1240×1754 because
   * the deck's format is print_a4_portrait" — rather than leaving the
   * author to guess why the expected dimensions are what they are.
   */
  formatKind?: FormatKind;
  /**
   * Reverse-lookup map from a normalized color literal (lowercase 6-digit
   * hex, e.g. "#cce0f0") to the soul token name that declares that exact
   * value (e.g. "--color-cat-d"). Used by the token-compliance check to
   * upgrade its fix suggestion from generic ("use a token") to specific
   * ("use var(--color-cat-d)"). Built once per soul in the validation
   * service and reused across every section/slide validated in the call.
   */
  colorTokenLookup?: ReadonlyMap<string, string>;
}

export interface Stage1Check {
  readonly id: string;
  readonly name: string;
  run(
    html: string,
    soulTokenNames: string[],
    allowedFonts: string[],
    context?: ValidationContext,
  ): ValidationIssue[];
}

export interface Stage2Check {
  readonly id: string;
  readonly name: string;
  run(
    page: unknown,
    soulTokenNames: string[],
    context?: ValidationContext,
  ): Promise<ValidationIssue[]>;
}
