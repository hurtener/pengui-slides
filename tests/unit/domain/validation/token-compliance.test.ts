import { describe, it, expect } from 'vitest';
import { TokenComplianceCheck } from '../../../../src/domain/validation/stage1/token-compliance.js';

describe('TokenComplianceCheck', () => {
  const check = new TokenComplianceCheck();
  const tokenNames = ['--color-canvas', '--color-text-primary'];
  const allowedFonts = ['Inter'];

  it('passes HTML with token-based color values', () => {
    const html = `
      <style>
        .slide { color: var(--color-text-primary); background: var(--color-canvas); }
      </style>
      <div class="slide">OK</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('flags literal hex color values', () => {
    const html = `
      <style>
        .slide { color: #ff0000; }
      </style>
      <div class="slide">Bad</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].rule).toBe('token-compliance');
    expect(issues[0].message).toContain('#ff0000');
  });

  it('flags rgb() color values', () => {
    const html = `
      <style>
        .slide { background-color: rgb(255, 0, 0); }
      </style>
      <div class="slide">Bad</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags rgba() color values', () => {
    const html = `
      <style>
        .card { border-color: rgba(0,0,0,0.5); }
      </style>
      <div class="slide">Bad</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags hsl() color values', () => {
    const html = `
      <style>
        .slide { color: hsl(0, 100%, 50%); }
      </style>
      <div class="slide">Bad</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('allows transparent, inherit, none, currentcolor', () => {
    const html = `
      <style>
        .a { background: transparent; }
        .b { color: inherit; }
        .c { background: none; }
        .d { border-color: currentcolor; }
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

  it('handles empty style blocks', () => {
    const html = '<style></style><div class="slide">Empty</div>';
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('only checks color-related properties', () => {
    const html = `
      <style>
        .slide { font-size: 16px; width: 100px; display: flex; }
      </style>
      <div class="slide">OK</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('flags unknown token references', () => {
    const html = `
      <style>
        .slide { color: var(--color-missing); }
      </style>
      <div class="slide">Bad</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.some((issue) => issue.actual === '--color-missing')).toBe(true);
  });

  it('checks inline styles for literal colors', () => {
    const html = '<div class="slide" style="color: #ff0000;">Bad</div>';
    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('upgrades the fix suggestion when colorTokenLookup names the literal', () => {
    // Reverse map: hex -> token. The agent sees "use var(--color-cat-d)"
    // instead of the generic "use a token from the soul".
    const lookup = new Map<string, string>([
      ['#cce0f0', '--color-cat-d'],
    ]);
    const html = '<div class="slide" style="background: #cce0f0;">x</div>';
    const issues = check.run(
      html,
      tokenNames,
      allowedFonts,
      { geometry: { widthPx: 1240, heightPx: 1754 }, colorTokenLookup: lookup } as never,
    );
    const literalIssue = issues.find((i) => i.actual === '#cce0f0');
    expect(literalIssue).toBeDefined();
    expect(literalIssue?.fixSuggestion).toContain('var(--color-cat-d)');
    expect(literalIssue?.fixSuggestion).toContain('declares this exact color');
  });

  it('expands 3-digit hex via the lookup so #fcc still finds #ffcccc', () => {
    const lookup = new Map<string, string>([
      ['#ffcccc', '--color-blush'],
    ]);
    const html = '<div style="color: #FCC;">x</div>';
    const issues = check.run(
      html,
      tokenNames,
      allowedFonts,
      { geometry: { widthPx: 1240, heightPx: 1754 }, colorTokenLookup: lookup } as never,
    );
    const literalIssue = issues.find((i) => i.actual === '#FCC');
    expect(literalIssue?.fixSuggestion).toContain('var(--color-blush)');
  });

  it('falls back to the generic suggestion when the literal is not in the soul', () => {
    const lookup = new Map<string, string>([
      ['#ffffff', '--color-canvas'],
    ]);
    const html = '<div style="background: #c0ffee;">x</div>';
    const issues = check.run(
      html,
      tokenNames,
      allowedFonts,
      { geometry: { widthPx: 1240, heightPx: 1754 }, colorTokenLookup: lookup } as never,
    );
    const literalIssue = issues.find((i) => i.actual === '#c0ffee');
    expect(literalIssue?.fixSuggestion).toContain('get_design_soul');
    expect(literalIssue?.fixSuggestion).not.toContain('declares this exact color');
  });
});
