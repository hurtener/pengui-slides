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

export type ValidationSeverity = 'error' | 'warning' | 'info';
export type ValidationStage = 'stage1_lint' | 'stage2_render';
export type ValidationDepth = 'lint' | 'full';

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

// ── Check Interfaces (Strategy Pattern) ───────────────────────────

export interface Stage1Check {
  readonly id: string;
  readonly name: string;
  run(html: string, soulTokenNames: string[], allowedFonts: string[]): ValidationIssue[];
}

export interface Stage2Check {
  readonly id: string;
  readonly name: string;
  run(page: unknown, soulTokenNames: string[]): Promise<ValidationIssue[]>;
}
