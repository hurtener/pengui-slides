import { describe, it, expect } from 'vitest';
import { FontComplianceCheck } from '../../../../src/domain/validation/stage1/font-compliance.js';

describe('FontComplianceCheck', () => {
  const check = new FontComplianceCheck();
  const tokenNames = ['--font-body', '--font-display'];
  const allowedFonts = ['Inter', 'JetBrains Mono'];

  it('passes when using allowed fonts', () => {
    const html = `
      <style>
        .slide { font-family: 'Inter', sans-serif; }
        .code { font-family: 'JetBrains Mono', monospace; }
      </style>
      <div class="slide">OK</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('passes when using var() token references', () => {
    const html = `
      <style>
        .slide { font-family: var(--font-body); }
      </style>
      <div class="slide">OK</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('passes when using generic CSS font families', () => {
    const html = `
      <style>
        .a { font-family: serif; }
        .b { font-family: sans-serif; }
        .c { font-family: monospace; }
        .d { font-family: system-ui; }
      </style>
      <div class="slide">OK</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('flags non-allowed font families', () => {
    const html = `
      <style>
        .slide { font-family: 'Comic Sans MS', cursive; }
      </style>
      <div class="slide">Bad</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].rule).toBe('font-compliance');
    expect(issues[0].message).toContain('Comic Sans MS');
  });

  it('allows inherit, initial, unset values', () => {
    const html = `
      <style>
        .a { font-family: inherit; }
        .b { font-family: initial; }
      </style>
      <div class="slide">OK</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('is case-insensitive for font matching', () => {
    const html = `
      <style>
        .slide { font-family: 'inter', sans-serif; }
      </style>
      <div class="slide">OK</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('handles HTML with no style blocks', () => {
    const html = '<div class="slide">No styles</div>';
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });
});
