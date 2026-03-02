import { describe, it, expect } from 'vitest';
import { SafeAreaCheck } from '../../../../src/domain/validation/stage1/safe-area-check.js';

describe('SafeAreaCheck', () => {
  const check = new SafeAreaCheck();
  const tokenNames: string[] = [];
  const allowedFonts: string[] = [];

  it('passes with correct 1920x1080 dimensions', () => {
    const html = `
      <style>
        .slide { width: 1920px; height: 1080px; }
      </style>
      <div class="slide">OK</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('passes with dimensions in div.slide selector', () => {
    const html = `
      <style>
        div.slide { width: 1920px; height: 1080px; }
      </style>
      <div class="slide">OK</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('flags missing width on .slide', () => {
    const html = `
      <style>
        .slide { height: 1080px; }
      </style>
      <div class="slide">Missing width</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    const widthIssue = issues.find((i) => i.id.includes('width'));
    expect(widthIssue).toBeDefined();
    expect(widthIssue!.severity).toBe('warning');
  });

  it('flags missing height on .slide', () => {
    const html = `
      <style>
        .slide { width: 1920px; }
      </style>
      <div class="slide">Missing height</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    const heightIssue = issues.find((i) => i.id.includes('height'));
    expect(heightIssue).toBeDefined();
    expect(heightIssue!.severity).toBe('warning');
  });

  it('flags incorrect width value', () => {
    const html = `
      <style>
        .slide { width: 1024px; height: 1080px; }
      </style>
      <div class="slide">Wrong width</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    const widthIssue = issues.find((i) => i.id.includes('width-mismatch'));
    expect(widthIssue).toBeDefined();
    expect(widthIssue!.actual).toBe('1024px');
  });

  it('flags incorrect height value', () => {
    const html = `
      <style>
        .slide { width: 1920px; height: 768px; }
      </style>
      <div class="slide">Wrong height</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    const heightIssue = issues.find((i) => i.id.includes('height-mismatch'));
    expect(heightIssue).toBeDefined();
    expect(heightIssue!.actual).toBe('768px');
  });

  it('recognizes inline style on .slide element', () => {
    const html = `<div class="slide" style="width: 1920px; height: 1080px;">OK</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues).toHaveLength(0);
  });

  it('flags missing both width and height', () => {
    const html = `
      <style>
        .slide { padding: 10px; }
      </style>
      <div class="slide">No dimensions</div>`;

    const issues = check.run(html, tokenNames, allowedFonts);
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });

  it('handles HTML with no style blocks and no slide element', () => {
    const html = '<p>No slide</p>';
    const issues = check.run(html, tokenNames, allowedFonts);
    // Missing width and height (no .slide element to have inline styles)
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });
});
