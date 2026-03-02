import { describe, it, expect } from 'vitest';
import { SpacingComplianceCheck } from '../../../../src/domain/validation/stage1/spacing-compliance.js';

describe('SpacingComplianceCheck', () => {
  const check = new SpacingComplianceCheck();
  const tokenNames: string[] = [];
  const allowedFonts: string[] = [];

  it('passes when using var() token references for spacing', () => {
    const html = `
      <style>
        .slide { padding: var(--space-md); margin: var(--space-lg); gap: var(--space-sm); }
      </style>
      <div class="slide">OK</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('flags literal px values in padding', () => {
    const html = `
      <style>
        .slide { padding: 16px; }
      </style>
      <div class="slide">Bad</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].rule).toBe('spacing-compliance');
  });

  it('flags literal rem values in margin', () => {
    const html = `
      <style>
        .slide { margin: 1.5rem; }
      </style>
      <div class="slide">Bad</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags literal em values in gap', () => {
    const html = `
      <style>
        .grid { gap: 2em; }
      </style>
      <div class="slide">Bad</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('allows 0, 0px, auto, inherit, initial, unset', () => {
    const html = `
      <style>
        .a { padding: 0; }
        .b { margin: 0px; }
        .c { margin: auto; }
        .d { padding: inherit; }
        .e { gap: initial; }
      </style>
      <div class="slide">OK</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('allows calc() that uses only var() references', () => {
    const html = `
      <style>
        .slide { padding: calc(var(--space-md) + var(--space-sm)); }
      </style>
      <div class="slide">OK</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('does not flag non-spacing properties', () => {
    const html = `
      <style>
        .slide { font-size: 18px; width: 100px; height: 50px; border-radius: 8px; }
      </style>
      <div class="slide">OK</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('checks padding-top, padding-right, etc.', () => {
    const html = `
      <style>
        .slide { padding-top: 20px; padding-left: 30px; }
      </style>
      <div class="slide">Bad</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(2);
  });

  it('checks margin-top, margin-bottom, etc.', () => {
    const html = `
      <style>
        .slide { margin-bottom: 10px; }
      </style>
      <div class="slide">Bad</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(1);
  });

  it('handles empty style blocks', () => {
    const html = '<style></style><div class="slide">Empty</div>';
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });
});
