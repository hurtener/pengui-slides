import { describe, it, expect } from 'vitest';
import { NetworkIsolationCheck } from '../../../../src/domain/validation/stage1/network-isolation.js';

describe('NetworkIsolationCheck', () => {
  const check = new NetworkIsolationCheck();
  const tokenNames: string[] = [];
  const allowedFonts: string[] = [];

  it('passes HTML with no external URLs', () => {
    const html = `
      <style>.slide { color: var(--color-text); }</style>
      <div class="slide"><p>Inline content only</p></div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('passes HTML with data: URIs', () => {
    const html = `
      <div class="slide">
        <img src="data:image/png;base64,iVBOR..." />
      </div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('flags http:// URLs in src attributes', () => {
    const html = `
      <div class="slide">
        <img src="http://example.com/image.png" />
      </div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe('error');
    expect(issues[0].rule).toBe('network-isolation');
  });

  it('flags https:// URLs in href attributes', () => {
    const html = `
      <div class="slide">
        <a href="https://example.com">Link</a>
      </div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags external URLs in CSS url()', () => {
    const html = `
      <style>
        .bg { background: url(https://example.com/bg.jpg); }
      </style>
      <div class="slide">Bad</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('flags @import with external URL', () => {
    const html = `
      <style>
        @import url("https://fonts.googleapis.com/css?family=Roboto");
      </style>
      <div class="slide">Bad</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('handles HTML with no external references', () => {
    const html = `<!DOCTYPE html>
<html>
<head><style>
  .slide { color: var(--text); background: var(--bg); }
</style></head>
<body>
  <div class="slide"><p>All local</p></div>
</body>
</html>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('does not flag internal anchors', () => {
    const html = `
      <div class="slide">
        <a href="#section1">Jump to section</a>
      </div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });
});
