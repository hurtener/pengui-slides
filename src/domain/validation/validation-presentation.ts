import type {
  SlideHealth,
  ValidationDelta,
  ValidationIssue,
  ValidationIssueSummary,
  ValidationPresentation,
  ValidationPresentationStatus,
  ValidationResult,
} from '../../types/validation.js';

function issueKey(issue: ValidationIssue): string {
  return [
    issue.stage,
    issue.severity,
    issue.rule,
    issue.message,
    issue.element ?? '',
    issue.expected ?? '',
    issue.actual ?? '',
    issue.line ?? '',
  ].join('|');
}

function toSummary(issue: ValidationIssue): ValidationIssueSummary {
  return {
    id: issue.id,
    severity: issue.severity,
    rule: issue.rule,
    message: issue.message,
    stage: issue.stage,
  };
}

function uniqueIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  const unique: ValidationIssue[] = [];

  for (const issue of issues) {
    const key = issueKey(issue);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(issue);
  }

  return unique;
}

export function buildValidationDelta(
  current: ValidationResult | null,
  previous: ValidationResult | null = null,
): ValidationDelta {
  if (!current) {
    return {
      introducedIssues: [],
      resolvedIssues: [],
      preExistingIssues: [],
      blockingIssues: [],
      status: 'unvalidated',
      summary: 'This slide has not been validated yet.',
    };
  }

  const previousKeys = new Set((previous?.issues ?? []).map(issueKey));
  const currentKeys = new Set(current.issues.map(issueKey));

  const introducedIssues = uniqueIssues(
    current.issues.filter((issue) => !previousKeys.has(issueKey(issue))),
  );
  const preExistingIssues = uniqueIssues(
    current.issues.filter((issue) => previousKeys.has(issueKey(issue))),
  );
  const resolvedIssues = uniqueIssues(
    (previous?.issues ?? []).filter((issue) => !currentKeys.has(issueKey(issue))),
  );
  const blockingIssues = uniqueIssues(current.issues.filter((issue) => issue.severity === 'error'));

  let status: ValidationPresentationStatus;
  let summary: string;

  if (current.passed) {
    if (resolvedIssues.length > 0) {
      status = 'clean';
      summary = `This edit resolved ${resolvedIssues.length} issue${resolvedIssues.length === 1 ? '' : 's'}.`;
    } else {
      status = 'clean';
      summary = 'No issues introduced by this edit.';
    }
  } else {
    const introducedBlockingCount = introducedIssues.filter((issue) => issue.severity === 'error').length;

    if (introducedBlockingCount > 0) {
      status = 'blocking';
      summary = `Your last edit introduced ${introducedBlockingCount} blocking issue${introducedBlockingCount === 1 ? '' : 's'}.`;
    } else if (introducedIssues.length > 0) {
      status = 'regression';
      summary = `Your last edit introduced ${introducedIssues.length} new issue${introducedIssues.length === 1 ? '' : 's'}.`;
    } else if (preExistingIssues.length > 0) {
      status = 'edited_with_preexisting_issues';
      summary = `This slide still has ${preExistingIssues.length} older issue${preExistingIssues.length === 1 ? '' : 's'}.`;
    } else if (blockingIssues.length > 0) {
      status = 'blocking';
      summary = `This slide has ${blockingIssues.length} blocking issue${blockingIssues.length === 1 ? '' : 's'}.`;
    } else {
      status = 'edited_with_preexisting_issues';
      summary = `This slide still has ${current.issues.length} issue${current.issues.length === 1 ? '' : 's'}.`;
    }
  }

  return {
    introducedIssues,
    resolvedIssues,
    preExistingIssues,
    blockingIssues,
    status,
    summary,
  };
}

export function buildValidationPresentation(delta: ValidationDelta): ValidationPresentation {
  return {
    status: delta.status,
    headline: delta.summary,
    blockingCount: delta.blockingIssues.length,
    introducedCount: delta.introducedIssues.length,
    preExistingCount: delta.preExistingIssues.length,
    resolvedCount: delta.resolvedIssues.length,
    topBlockers: delta.blockingIssues.slice(0, 3).map(toSummary),
    topPreExisting: delta.preExistingIssues.slice(0, 3).map(toSummary),
    showTechnicalDetailsAvailable:
      delta.blockingIssues.length > 0 ||
      delta.preExistingIssues.length > 0 ||
      delta.introducedIssues.length > 0 ||
      delta.resolvedIssues.length > 0,
  };
}

export function buildSnapshotValidationPresentation(
  validation: ValidationResult | null,
): ValidationPresentation {
  if (!validation) {
    return buildValidationPresentation(buildValidationDelta(null, null));
  }

  let status: ValidationPresentationStatus;
  let headline: string;

  if (validation.passed) {
    status = 'clean';
    headline = 'This slide is ready.';
  } else if (validation.errorCount > 0) {
    status = 'blocking';
    headline = `This slide has ${validation.errorCount} blocking issue${validation.errorCount === 1 ? '' : 's'}.`;
  } else {
    status = 'edited_with_preexisting_issues';
    headline = `This slide still has ${validation.issues.length} issue${validation.issues.length === 1 ? '' : 's'}.`;
  }

  const blockingIssues = validation.issues.filter((issue) => issue.severity === 'error');
  return {
    status,
    headline,
    blockingCount: blockingIssues.length,
    introducedCount: 0,
    preExistingCount: validation.issues.length,
    resolvedCount: 0,
    topBlockers: blockingIssues.slice(0, 3).map(toSummary),
    topPreExisting: validation.issues.slice(0, 3).map(toSummary),
    showTechnicalDetailsAvailable: validation.issues.length > 0,
  };
}

export function healthFromPresentation(presentation: ValidationPresentation): SlideHealth {
  switch (presentation.status) {
    case 'clean':
      return 'clean';
    case 'blocking':
      return 'blocked';
    default:
      return 'needs_attention';
  }
}
