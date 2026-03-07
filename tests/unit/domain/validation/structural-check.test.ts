import { describe, it, expect } from 'vitest';
import { StructuralCheck } from '../../../../src/domain/validation/stage1/structural-check.js';

describe('StructuralCheck', () => {
  const check = new StructuralCheck();
  const tokenNames: string[] = [];
  const allowedFonts: string[] = [];

  it('passes with valid HTML that has all requirements', () => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head><style>.slide { width: 1920px; }</style></head>
<body>
  <!-- @slide-meta {"title":"Test","type":"content"} -->
  <div class="slide"><p>Content</p></div>
</body>
</html>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('flags missing DOCTYPE', () => {
    const html = `<html>
<body>
  <!-- @slide-meta {"title":"Test","type":"content"} -->
  <div class="slide"><p>Content</p></div>
</body>
</html>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    const doctypeIssue = issues.find((i) => i.id.includes('doctype'));
    expect(doctypeIssue).toBeDefined();
    expect(doctypeIssue!.severity).toBe('error');
  });

  it('flags missing @slide-meta comment', () => {
    const html = `<!DOCTYPE html>
<html>
<body>
  <div class="slide"><p>Content</p></div>
</body>
</html>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    const metaIssue = issues.find((i) => i.id.includes('meta-missing'));
    expect(metaIssue).toBeDefined();
    expect(metaIssue!.severity).toBe('error');
  });

  it('flags invalid JSON in @slide-meta', () => {
    const html = `<!DOCTYPE html>
<html>
<body>
  <!-- @slide-meta {this is not json} -->
  <div class="slide"><p>Content</p></div>
</body>
</html>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    const metaIssue = issues.find((i) => i.id.includes('meta-invalid'));
    expect(metaIssue).toBeDefined();
    expect(metaIssue!.severity).toBe('error');
  });

  it('flags missing .slide container', () => {
    const html = `<!DOCTYPE html>
<html>
<body>
  <!-- @slide-meta {"title":"Test","type":"content"} -->
  <div class="content"><p>No slide class</p></div>
</body>
</html>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    const containerIssue = issues.find((i) => i.id.includes('root-container'));
    expect(containerIssue).toBeDefined();
    expect(containerIssue!.severity).toBe('error');
  });

  it('reports multiple issues at once', () => {
    const html = '<div class="content"><p>Missing everything</p></div>';

    const issues = check.run(html, tokenNames, allowedFonts);
    // Should flag: missing DOCTYPE, missing @slide-meta, missing .slide
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });

  it('accepts DOCTYPE with case variations', () => {
    const html = `<!doctype html>
<html>
<body>
  <!-- @slide-meta {"title":"Test","type":"content"} -->
  <div class="slide"><p>Content</p></div>
</body>
</html>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    const doctypeIssue = issues.find((i) => i.id.includes('doctype'));
    expect(doctypeIssue).toBeUndefined();
  });

  it('flags missing required metadata fields', () => {
    const html = `<!DOCTYPE html>
<html>
<body>
  <!-- @slide-meta {"title":"Test"} -->
  <div class="slide"><p>Content</p></div>
</body>
</html>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.some((issue) => issue.id.includes('meta-required-fields'))).toBe(true);
  });

  it('flags metadata comment after the slide container', () => {
    const html = `<!DOCTYPE html>
<html>
<body>
  <div class="slide"><p>Content</p></div>
  <!-- @slide-meta {"title":"Test","type":"content"} -->
</body>
</html>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.some((issue) => issue.id.includes('meta-order'))).toBe(true);
  });
});
