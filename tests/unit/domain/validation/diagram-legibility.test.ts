/**
 * Unit tests for DiagramLegibilityCheck (Stage 1).
 *
 * One test per rule, plus skip-behavior test for non-diagram types.
 */

import { describe, it, expect } from 'vitest';
import { DiagramLegibilityCheck } from '../../../../src/domain/validation/stage1/diagram-legibility.js';

const check = new DiagramLegibilityCheck();
const tokenNames: string[] = [];
const allowedFonts: string[] = [];

// ── Helpers ──────────────────────────────────────────────────────

function makeHtml(type: string, svgBody: string): string {
  return `<!DOCTYPE html>
<html lang="en" data-pengui-medium="print">
<head><meta charset="UTF-8"><style>.slide { width: 1240px; height: 1754px; }</style></head>
<body>
  <!-- @slide-meta {"title":"Test Diagram","type":"${type}","narrative":"test","tags":["test"]} -->
  <div class="slide">
    ${svgBody}
  </div>
</body>
</html>`;
}

const VALID_SVG = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
  <style>
    .bar { fill: var(--color-category-a); }
    .label { font-family: var(--font-mono); font-size: var(--text-caption); fill: var(--color-text-primary); }
  </style>
  <rect class="bar" x="100" y="100" width="100" height="200" rx="4" />
  <text class="label" x="150" y="90" text-anchor="middle">Value</text>
  <g class="legend">
    <rect class="bar" x="0" y="0" width="14" height="14" rx="2" />
    <text class="label" x="20" y="12">Series A</text>
  </g>
</svg>`;

// ── Test: skip non-diagram types ─────────────────────────────────

describe('DiagramLegibilityCheck — type gating', () => {
  it('returns no issues for a non-diagram slide type (content)', () => {
    const html = makeHtml('content', '<p>No SVG here</p>');
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('returns no issues for a non-diagram slide type (cover)', () => {
    const html = makeHtml('cover', VALID_SVG);
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('runs checks for content_diagram type', () => {
    // content_diagram with a valid SVG should produce no warnings
    const html = makeHtml('content_diagram', VALID_SVG);
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('runs checks for content_chart type', () => {
    const html = makeHtml('content_chart', VALID_SVG);
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('returns no issues when @slide-meta is absent', () => {
    // No meta → type is null → check skips entirely
    const html = `<!DOCTYPE html><html><body><svg viewBox="0 0 100 100"><rect fill="#ff0000" x="0" y="0" width="10" height="10" /></svg></body></html>`;
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });
});

// ── Rule 1: viewBox ───────────────────────────────────────────────

describe('DiagramLegibilityCheck — Rule 1: viewBox required', () => {
  it('warns when SVG is missing viewBox', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg">
      <rect fill="var(--color-category-a)" x="0" y="0" width="100" height="100" rx="4" />
    </svg>`;
    const html = makeHtml('content_diagram', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const issue = issues.find((i) => i.id === 'diagram-legibility-no-viewbox');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
  });

  it('does not warn when SVG has viewBox', () => {
    const svg = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
      <rect fill="var(--color-category-a)" x="0" y="0" width="100" height="100" rx="4" />
    </svg>`;
    const html = makeHtml('content_diagram', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const viewboxIssues = issues.filter((i) => i.id === 'diagram-legibility-no-viewbox');
    expect(viewboxIssues).toHaveLength(0);
  });
});

// ── Rule 2: text font-size must use var(--text-*) ────────────────

describe('DiagramLegibilityCheck — Rule 2: text font-size token', () => {
  it('warns when <text> has a literal px font-size attribute', () => {
    const svg = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
      <text font-size="14px" x="100" y="50" fill="var(--color-text-primary)">Label</text>
    </svg>`;
    const html = makeHtml('content_chart', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const issue = issues.find((i) => i.id === 'diagram-legibility-literal-font-size-attr');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
  });

  it('warns when <text> has a literal px font-size in inline style', () => {
    const svg = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
      <text style="font-size: 12px; fill: var(--color-text-primary);" x="100" y="50">Label</text>
    </svg>`;
    const html = makeHtml('content_chart', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const issue = issues.find((i) => i.id === 'diagram-legibility-literal-font-size-style');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
  });

  it('does not warn when <text> uses var(--text-caption) as font-size attribute', () => {
    const svg = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
      <text font-size="var(--text-caption)" x="100" y="50" fill="var(--color-text-primary)">Label</text>
    </svg>`;
    const html = makeHtml('content_chart', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const fontIssues = issues.filter((i) => i.id.startsWith('diagram-legibility-literal-font-size'));
    expect(fontIssues).toHaveLength(0);
  });

  it('does not warn when font-size is set via CSS class with var(--text-*)', () => {
    const svg = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
      <style>
        .lbl { font-size: var(--text-caption); fill: var(--color-text-primary); }
      </style>
      <text class="lbl" x="100" y="50">Label</text>
    </svg>`;
    const html = makeHtml('content_chart', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const fontIssues = issues.filter((i) => i.id.startsWith('diagram-legibility-literal-font-size'));
    expect(fontIssues).toHaveLength(0);
  });
});

// ── Rule 3: shape fills must be tokens or allowed values ──────────

describe('DiagramLegibilityCheck — Rule 3: fill must be token or allowed value', () => {
  it('warns when <rect> has a literal hex fill', () => {
    const svg = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
      <rect fill="#ff6b6b" x="0" y="0" width="100" height="100" rx="4" />
    </svg>`;
    const html = makeHtml('content_diagram', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const issue = issues.find((i) => i.id === 'diagram-legibility-literal-fill-rect');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
  });

  it('warns when <circle> has a literal hex fill', () => {
    const svg = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
      <circle fill="#abc123" cx="50" cy="50" r="40" />
    </svg>`;
    const html = makeHtml('content_diagram', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const issue = issues.find((i) => i.id === 'diagram-legibility-literal-fill-circle');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
  });

  it('warns when <path> has a literal hex fill', () => {
    const svg = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
      <path fill="#336699" d="M10,10 H90 V90 H10 Z" />
    </svg>`;
    const html = makeHtml('content_diagram', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const issue = issues.find((i) => i.id === 'diagram-legibility-literal-fill-path');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
  });

  it('warns when <polygon> has a literal hex fill', () => {
    const svg = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
      <polygon fill="#aabbcc" points="0,0 10,0 5,10" />
    </svg>`;
    const html = makeHtml('content_diagram', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const issue = issues.find((i) => i.id === 'diagram-legibility-literal-fill-polygon');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
  });

  it('does not warn when fill is var(--color-category-a)', () => {
    const svg = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
      <rect fill="var(--color-category-a)" x="0" y="0" width="100" height="100" rx="4" />
    </svg>`;
    const html = makeHtml('content_diagram', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const fillIssues = issues.filter((i) => i.id.startsWith('diagram-legibility-literal-fill'));
    expect(fillIssues).toHaveLength(0);
  });

  it('does not warn when fill is "none"', () => {
    const svg = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
      <rect fill="none" stroke="var(--color-border)" x="0" y="0" width="100" height="100" rx="4" />
    </svg>`;
    const html = makeHtml('content_diagram', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const fillIssues = issues.filter((i) => i.id.startsWith('diagram-legibility-literal-fill'));
    expect(fillIssues).toHaveLength(0);
  });

  it('does not warn when fill is "transparent"', () => {
    const svg = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
      <rect fill="transparent" x="0" y="0" width="100" height="100" rx="4" />
    </svg>`;
    const html = makeHtml('content_diagram', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const fillIssues = issues.filter((i) => i.id.startsWith('diagram-legibility-literal-fill'));
    expect(fillIssues).toHaveLength(0);
  });

  it('does not warn when fill is "currentColor"', () => {
    const svg = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
      <path fill="currentColor" d="M10,10 H90 V90 H10 Z" />
    </svg>`;
    const html = makeHtml('content_diagram', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const fillIssues = issues.filter((i) => i.id.startsWith('diagram-legibility-literal-fill'));
    expect(fillIssues).toHaveLength(0);
  });
});

// ── Rule 4: legend required for multi-series ─────────────────────

describe('DiagramLegibilityCheck — Rule 4: legend required for multi-series', () => {
  it('warns when SVG has 3+ rects outside legend and no legend element', () => {
    const svg = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
      <rect fill="var(--color-category-a)" x="100" y="200" width="100" height="200" rx="4" />
      <rect fill="var(--color-category-b)" x="250" y="150" width="100" height="250" rx="4" />
      <rect fill="var(--color-category-c)" x="400" y="100" width="100" height="300" rx="4" />
    </svg>`;
    const html = makeHtml('content_chart', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const issue = issues.find((i) => i.id === 'diagram-legibility-missing-legend');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
  });

  it('does not warn for 2 rects without a legend', () => {
    const svg = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
      <rect fill="var(--color-category-a)" x="100" y="200" width="100" height="200" rx="4" />
      <rect fill="var(--color-category-b)" x="250" y="150" width="100" height="250" rx="4" />
    </svg>`;
    const html = makeHtml('content_chart', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const issue = issues.find((i) => i.id === 'diagram-legibility-missing-legend');
    expect(issue).toBeUndefined();
  });

  it('does not warn for 3+ rects when a legend element is present', () => {
    const svg = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
      <rect fill="var(--color-category-a)" x="100" y="200" width="100" height="200" rx="4" />
      <rect fill="var(--color-category-b)" x="250" y="150" width="100" height="250" rx="4" />
      <rect fill="var(--color-category-c)" x="400" y="100" width="100" height="300" rx="4" />
      <g class="legend">
        <rect fill="var(--color-category-a)" x="0" y="0" width="14" height="14" rx="2" />
        <rect fill="var(--color-category-b)" x="50" y="0" width="14" height="14" rx="2" />
        <rect fill="var(--color-category-c)" x="100" y="0" width="14" height="14" rx="2" />
      </g>
    </svg>`;
    const html = makeHtml('content_chart', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const issue = issues.find((i) => i.id === 'diagram-legibility-missing-legend');
    expect(issue).toBeUndefined();
  });

  it('detects legend by id="legend" as well as class="legend"', () => {
    const svg = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
      <rect fill="var(--color-category-a)" x="100" y="200" width="100" height="200" rx="4" />
      <rect fill="var(--color-category-b)" x="250" y="150" width="100" height="250" rx="4" />
      <rect fill="var(--color-category-c)" x="400" y="100" width="100" height="300" rx="4" />
      <g id="legend">
        <rect fill="var(--color-category-a)" x="0" y="0" width="14" height="14" rx="2" />
      </g>
    </svg>`;
    const html = makeHtml('content_chart', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const issue = issues.find((i) => i.id === 'diagram-legibility-missing-legend');
    expect(issue).toBeUndefined();
  });
});

// ── Rule 5: legend swatches must use token fills ──────────────────

describe('DiagramLegibilityCheck — Rule 5: legend swatch fills', () => {
  it('warns when a legend swatch has a literal hex fill', () => {
    const svg = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
      <rect fill="var(--color-category-a)" x="100" y="200" width="100" height="200" rx="4" />
      <g class="legend">
        <rect fill="#ff0000" x="0" y="0" width="14" height="14" rx="2" />
        <text font-size="var(--text-caption)" x="20" y="12" fill="var(--color-text-secondary)">Series A</text>
      </g>
    </svg>`;
    const html = makeHtml('content_chart', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const issue = issues.find((i) => i.id === 'diagram-legibility-legend-literal-fill');
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe('warning');
  });

  it('does not warn when legend swatches use var(--color-*) tokens', () => {
    const svg = `<svg viewBox="0 0 900 400" xmlns="http://www.w3.org/2000/svg">
      <rect fill="var(--color-category-a)" x="100" y="200" width="100" height="200" rx="4" />
      <g class="legend">
        <rect fill="var(--color-category-a)" x="0" y="0" width="14" height="14" rx="2" />
        <text font-size="var(--text-caption)" x="20" y="12" fill="var(--color-text-secondary)">Series A</text>
      </g>
    </svg>`;
    const html = makeHtml('content_chart', svg);
    const issues = check.run(html, tokenNames, allowedFonts);
    const legendIssues = issues.filter((i) => i.id === 'diagram-legibility-legend-literal-fill');
    expect(legendIssues).toHaveLength(0);
  });
});

// ── Integration: valid diagram produces zero warnings ────────────

describe('DiagramLegibilityCheck — integration', () => {
  it('produces zero warnings for a fully compliant content_diagram SVG', () => {
    const html = makeHtml('content_diagram', VALID_SVG);
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('produces zero warnings for a fully compliant content_chart SVG', () => {
    const html = makeHtml('content_chart', VALID_SVG);
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('check.id and check.name are defined strings', () => {
    expect(typeof check.id).toBe('string');
    expect(check.id.length).toBeGreaterThan(0);
    expect(typeof check.name).toBe('string');
    expect(check.name.length).toBeGreaterThan(0);
  });
});
