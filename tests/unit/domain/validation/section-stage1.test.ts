import { describe, it, expect } from 'vitest';
import { SectionStructuralCheck } from '../../../../src/domain/validation/stage1/section-structural.js';
import { SectionWrapperClassCheck } from '../../../../src/domain/validation/stage1/section-wrapper-class.js';
import { SectionFigureShapeCheck } from '../../../../src/domain/validation/stage1/section-figure-shape.js';
import { SectionTableShapeCheck } from '../../../../src/domain/validation/stage1/section-table-shape.js';
import { SectionStage1Runner } from '../../../../src/domain/validation/stage1/section-stage1-runner.js';

const META = '<!-- @section-meta {"title":"T","kind":"prose","narrative":"N"} -->';

function prose(body: string): string {
  return `${META}\n<section class="pengui-section pengui-prose">${body}</section>`;
}

describe('SectionStructuralCheck', () => {
  it('passes a clean prose fragment', () => {
    const check = new SectionStructuralCheck({ kind: 'prose' });
    const issues = check.run(prose('<h2>Hi</h2><p>Hello.</p>'));
    expect(issues).toEqual([]);
  });

  it('flags missing @section-meta comment', () => {
    const check = new SectionStructuralCheck({ kind: 'prose' });
    const issues = check.run('<section class="pengui-section pengui-prose">hi</section>');
    expect(issues.some((i) => i.id.includes('missing-meta'))).toBe(true);
  });

  it('flags invalid JSON in @section-meta', () => {
    const check = new SectionStructuralCheck({ kind: 'prose' });
    const html = `<!-- @section-meta {not: "json"} -->\n<section class="pengui-section pengui-prose"></section>`;
    const issues = check.run(html);
    expect(issues.some((i) => i.id.includes('invalid-meta-json'))).toBe(true);
  });

  it('flags DOCTYPE', () => {
    const check = new SectionStructuralCheck({ kind: 'prose' });
    const html = `<!DOCTYPE html>${prose('<p>x</p>')}`;
    const issues = check.run(html);
    expect(issues.some((i) => i.id.includes('doctype'))).toBe(true);
  });

  it('flags <html>, <head>, <body>, <script>', () => {
    const check = new SectionStructuralCheck({ kind: 'prose' });
    const forbidden = ['<html>', '<head>', '<body>', '<script>'];
    for (const tag of forbidden) {
      const html = `${META}\n${tag}<section class="pengui-section pengui-prose"></section>`;
      const issues = check.run(html);
      expect(issues.some((i) => i.rule === 'section-structural'), tag).toBe(true);
    }
  });

  it('flags standalone <style> blocks', () => {
    const check = new SectionStructuralCheck({ kind: 'prose' });
    const html = prose('<style>p { color: red }</style><p>x</p>');
    const issues = check.run(html);
    expect(issues.some((i) => i.id.includes('style-tag'))).toBe(true);
  });

  it('flags :root { ... } blocks', () => {
    const check = new SectionStructuralCheck({ kind: 'prose' });
    const html = prose(':root { --foo: bar } works when it is content but the regex may still catch...');
    // Build a fragment where the :root pattern appears inside markup
    const bad = `${META}\n<section class="pengui-section pengui-prose">:root { --x: y }</section>`;
    const issues = check.run(bad);
    expect(issues.some((i) => i.id.includes('root-block'))).toBe(true);
  });

  it('flags fixed page-sized dimensions', () => {
    const check = new SectionStructuralCheck({ kind: 'prose' });
    const bad = `${META}\n<section class="pengui-section pengui-prose" style="width: 1240px; height: 1754px; overflow: hidden;"></section>`;
    const issues = check.run(bad);
    expect(issues.some((i) => i.id.includes('fixed-width'))).toBe(true);
    expect(issues.some((i) => i.id.includes('fixed-height'))).toBe(true);
    expect(issues.some((i) => i.id.includes('overflow-hidden'))).toBe(true);
  });

  it('flags wrong root element tag', () => {
    const check = new SectionStructuralCheck({ kind: 'prose' });
    const html = `${META}\n<div class="pengui-section pengui-prose"></div>`;
    const issues = check.run(html);
    expect(issues.some((i) => i.id.includes('root-not-section'))).toBe(true);
  });

  it('flags missing pengui-section class', () => {
    const check = new SectionStructuralCheck({ kind: 'prose' });
    const html = `${META}\n<section class="pengui-prose"></section>`;
    const issues = check.run(html);
    expect(issues.some((i) => i.id.includes('missing-pengui-section-class'))).toBe(true);
  });

  it('flags missing kind-specific class (warning)', () => {
    const check = new SectionStructuralCheck({ kind: 'figure' });
    const html = `<!-- @section-meta {"title":"F","kind":"figure","narrative":""} -->\n<section class="pengui-section"><figure><figcaption>c</figcaption></figure></section>`;
    const issues = check.run(html);
    expect(issues.some((i) => i.id.includes('missing-kind-class') && i.severity === 'warning')).toBe(true);
  });

  it('flags multiple top-level elements', () => {
    const check = new SectionStructuralCheck({ kind: 'prose' });
    const html = `${META}\n<section class="pengui-section pengui-prose"></section><p>stray</p>`;
    const issues = check.run(html);
    expect(issues.some((i) => i.id.includes('multiple-root-elements'))).toBe(true);
  });
});

describe('SectionWrapperClassCheck', () => {
  it('does nothing for non-keep-together kinds', () => {
    const check = new SectionWrapperClassCheck({ kind: 'prose' });
    expect(check.run(prose('<p>x</p>'))).toEqual([]);
  });

  it('flags a figure fragment with no .pengui-figure class anywhere', () => {
    const check = new SectionWrapperClassCheck({ kind: 'figure' });
    // Note: root lacks `pengui-figure` class too — this would be caught by
    // section-structural as well, but wrapper-class still flags missing
    // break-inside: avoid coverage since the composer's rule is scoped by
    // the canonical class, not the kind.
    const html = `<!-- @section-meta {"title":"F","kind":"figure","narrative":""} -->\n<section class="pengui-section"><div><svg></svg></div></section>`;
    const issues = check.run(html);
    expect(issues.some((i) => i.rule === 'section-wrapper-class')).toBe(true);
  });

  it('passes when .pengui-figure is present on a <figure>', () => {
    const check = new SectionWrapperClassCheck({ kind: 'figure' });
    const html = `<!-- @section-meta {"title":"F","kind":"figure","narrative":""} -->\n<section class="pengui-section pengui-figure"><figure class="pengui-figure"><svg></svg><figcaption>c</figcaption></figure></section>`;
    expect(check.run(html)).toEqual([]);
  });
});

describe('SectionFigureShapeCheck', () => {
  it('flags a figure section missing <figure>', () => {
    const check = new SectionFigureShapeCheck({ kind: 'figure' });
    const html = `<!-- @section-meta {"title":"F","kind":"figure","narrative":""} -->\n<section class="pengui-section pengui-figure"><div class="pengui-figure"></div></section>`;
    const issues = check.run(html);
    expect(issues.some((i) => i.id.includes('missing-figure'))).toBe(true);
  });

  it('warns on missing figcaption', () => {
    const check = new SectionFigureShapeCheck({ kind: 'figure' });
    const html = `<!-- @section-meta {"title":"F","kind":"figure","narrative":""} -->\n<section class="pengui-section pengui-figure"><figure class="pengui-figure"><svg></svg></figure></section>`;
    const issues = check.run(html);
    expect(issues.some((i) => i.id.includes('missing-figcaption'))).toBe(true);
  });

  it('passes a clean figure with caption', () => {
    const check = new SectionFigureShapeCheck({ kind: 'figure' });
    const html = `<!-- @section-meta {"title":"F","kind":"figure","narrative":""} -->\n<section class="pengui-section pengui-figure"><figure class="pengui-figure"><svg></svg><figcaption>c</figcaption></figure></section>`;
    expect(check.run(html)).toEqual([]);
  });
});

describe('SectionTableShapeCheck', () => {
  it('flags a table section missing <table>', () => {
    const check = new SectionTableShapeCheck({ kind: 'table' });
    const html = `<!-- @section-meta {"title":"T","kind":"table","narrative":""} -->\n<section class="pengui-section pengui-table"><div>not a table</div></section>`;
    const issues = check.run(html);
    expect(issues.some((i) => i.id.includes('missing-table'))).toBe(true);
  });

  it('warns on missing <thead>', () => {
    const check = new SectionTableShapeCheck({ kind: 'table' });
    const html = `<!-- @section-meta {"title":"T","kind":"table","narrative":""} -->\n<section class="pengui-section pengui-table"><table><tbody><tr><td>x</td></tr></tbody></table></section>`;
    const issues = check.run(html);
    expect(issues.some((i) => i.id.includes('missing-thead'))).toBe(true);
  });
});

describe('SectionStage1Runner', () => {
  it('aggregates issues from all section-scoped checks plus shared lints', () => {
    const runner = new SectionStage1Runner();
    // Bad fragment: prose with a DOCTYPE and a hex color literal, should
    // trip structural + token-compliance at minimum.
    const html = `<!DOCTYPE html>${META}\n<section class="pengui-section pengui-prose" style="color: #ff0000;"><p>x</p></section>`;
    const result = runner.run(html, [], ['Inter', 'sans-serif'], { kind: 'prose' });
    const ids = new Set(result.issues.map((i) => i.rule));
    expect(ids.has('section-structural')).toBe(true);
    // token-compliance fires on inline style color literal
    expect(ids.has('token-compliance')).toBe(true);
  });

  it('returns no issues on a clean prose fragment', () => {
    const runner = new SectionStage1Runner();
    const html = `<!-- @section-meta {"title":"Intro","kind":"prose","narrative":"Intro."} -->\n<section class="pengui-section pengui-prose"><h2>Hello</h2><p>world.</p></section>`;
    const result = runner.run(html, [], ['Inter', 'sans-serif'], { kind: 'prose' });
    expect(result.issues).toEqual([]);
  });
});
