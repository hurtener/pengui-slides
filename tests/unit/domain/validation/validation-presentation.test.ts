import { describe, expect, it } from 'vitest';
import {
  buildSnapshotValidationPresentation,
  buildValidationDelta,
  buildValidationPresentation,
  healthFromPresentation,
} from '../../../../src/domain/validation/validation-presentation.js';
import type { ValidationResult } from '../../../../src/types/validation.js';

function makeValidation(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return {
    passed: true,
    issues: [],
    styleScore: {
      overall: 1,
      tokenCompliance: 1,
      typographyConsistency: 1,
      spacingConsistency: 1,
      contrastAccessibility: 1,
      structuralIntegrity: 1,
    },
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    stage1ElapsedMs: 10,
    stage2Skipped: true,
    validatedAt: '2026-03-06T00:00:00.000Z',
    ...overrides,
  };
}

describe('validation-presentation', () => {
  it('treats unchanged pre-existing issues as edited_with_preexisting_issues', () => {
    const issue = {
      id: 'issue-1',
      stage: 'stage1_lint' as const,
      severity: 'error' as const,
      rule: 'structural-check',
      message: 'Older issue still present.',
    };
    const previous = makeValidation({
      passed: false,
      issues: [issue],
      errorCount: 1,
    });
    const current = makeValidation({
      passed: false,
      issues: [issue],
      errorCount: 1,
    });

    const delta = buildValidationDelta(current, previous);
    const presentation = buildValidationPresentation(delta);

    expect(delta.status).toBe('edited_with_preexisting_issues');
    expect(delta.introducedIssues).toHaveLength(0);
    expect(delta.preExistingIssues).toHaveLength(1);
    expect(presentation.headline).toContain('older issue');
    expect(healthFromPresentation(presentation)).toBe('needs_attention');
  });

  it('classifies newly introduced errors as blocking', () => {
    const current = makeValidation({
      passed: false,
      issues: [{
        id: 'issue-2',
        stage: 'stage1_lint',
        severity: 'error',
        rule: 'structural-check',
        message: 'New blocking issue.',
      }],
      errorCount: 1,
    });

    const delta = buildValidationDelta(current, makeValidation());
    expect(delta.status).toBe('blocking');
    expect(delta.introducedIssues).toHaveLength(1);
    expect(delta.blockingIssues).toHaveLength(1);
  });

  it('reports resolved issues when the latest validation is clean', () => {
    const previous = makeValidation({
      passed: false,
      issues: [{
        id: 'issue-3',
        stage: 'stage1_lint',
        severity: 'warning',
        rule: 'spacing-compliance',
        message: 'Old warning.',
      }],
      warningCount: 1,
    });

    const delta = buildValidationDelta(makeValidation(), previous);
    const presentation = buildValidationPresentation(delta);

    expect(delta.resolvedIssues).toHaveLength(1);
    expect(presentation.headline).toContain('resolved');
  });

  it('builds snapshot presentations for existing invalid slides', () => {
    const presentation = buildSnapshotValidationPresentation(makeValidation({
      passed: false,
      issues: [{
        id: 'issue-4',
        stage: 'stage1_lint',
        severity: 'error',
        rule: 'structural-check',
        message: 'Blocking issue.',
      }],
      errorCount: 1,
    }));

    expect(presentation.status).toBe('blocking');
    expect(presentation.blockingCount).toBe(1);
  });
});
