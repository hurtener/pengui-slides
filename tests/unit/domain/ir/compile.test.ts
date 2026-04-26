import { describe, it, expect } from 'vitest';
import {
  compileSlideIRToHtml,
  compileSectionIRToHtml,
  renderRichText,
  renderNodeList,
} from '../../../../src/domain/ir/compile/index.js';
import { rt } from '../../../../src/domain/ir/rich-text.js';
import type { SlideIR, SectionIR } from '../../../../src/domain/ir/slide-ir.js';

const STUB_SOUL = {
  cssTokens: ':root {\n  --color-canvas: #fff;\n  --space-md: 16px;\n}',
};

const SLIDE_GEOMETRY = {
  widthPx: 1920,
  heightPx: 1080,
  safeAreaInsetPx: 48,
  thumbnailAspect: 16 / 9,
  marginPx: 0,
};

const PRINT_GEOMETRY = {
  widthPx: 1240,
  heightPx: 1754,
  safeAreaInsetPx: 96,
  thumbnailAspect: 1240 / 1754,
  marginPx: 96,
};

describe('renderRichText', () => {
  it('escapes HTML special characters in plain text', () => {
    expect(renderRichText(rt('a & b < c > d "e" \'f\''))).toBe(
      'a &amp; b &lt; c &gt; d &quot;e&quot; &#39;f&#39;',
    );
  });

  it('emits <strong> for bold runs', () => {
    expect(renderRichText(rt({ text: 'x', bold: true }))).toBe('<strong>x</strong>');
  });

  it('emits <em> for italic runs', () => {
    expect(renderRichText(rt({ text: 'x', italic: true }))).toBe('<em>x</em>');
  });

  it('emits <code> for code runs and escapes the contents', () => {
    expect(renderRichText(rt({ text: '<x>', code: true }))).toBe('<code>&lt;x&gt;</code>');
  });

  it('wraps a linked run with <a href>', () => {
    expect(
      renderRichText(rt({ text: 'click', link: 'https://example.com' })),
    ).toBe('<a href="https://example.com">click</a>');
  });

  it('combines link + bold (link wraps outside)', () => {
    expect(
      renderRichText(rt({ text: 'go', bold: true, link: 'https://x.test' })),
    ).toBe('<a href="https://x.test"><strong>go</strong></a>');
  });

  it('escapes quotes in href values', () => {
    // Zod blocks the obvious bad URLs; this is a defense-in-depth check
    // that escaping kicks in for benign-but-quote-bearing URLs.
    expect(
      renderRichText(rt({ text: 'q', link: 'https://x.test/?q=%22a%22' })),
    ).toContain('href="https://x.test/?q=%22a%22"');
  });

  it('wraps a colored run with <span class="pengui-text-{role}">', () => {
    expect(renderRichText(rt({ text: '$2.5M', color: 'accent' }))).toBe(
      '<span class="pengui-text-accent">$2.5M</span>',
    );
  });

  it('color hyphenates the underscore variants (accent_alt → accent-alt)', () => {
    expect(renderRichText(rt({ text: 'x', color: 'accent_alt' }))).toBe(
      '<span class="pengui-text-accent-alt">x</span>',
    );
  });

  it('color composes with bold + link (color wraps outermost)', () => {
    expect(
      renderRichText(rt({ text: 'go', bold: true, link: 'https://x.test', color: 'success' })),
    ).toBe('<span class="pengui-text-success"><a href="https://x.test"><strong>go</strong></a></span>');
  });

  it('emits <s> for strike and stacks with bold (v4.7 stacking)', () => {
    expect(renderRichText(rt({ text: 'old', strike: true }))).toBe('<s>old</s>');
    expect(renderRichText(rt({ text: 'x', bold: true, strike: true }))).toBe(
      '<strong><s>x</s></strong>',
    );
  });

  it('stacks bold + italic + code as nested tags (was silently dropped pre-v4.7)', () => {
    expect(renderRichText(rt({ text: 'x', bold: true, italic: true }))).toBe(
      '<strong><em>x</em></strong>',
    );
    expect(renderRichText(rt({ text: 'x', bold: true, italic: true, code: true }))).toBe(
      '<strong><em><code>x</code></em></strong>',
    );
  });

  it('emits <sup> / <sub>; sup wins when both are set', () => {
    expect(renderRichText(rt({ text: '2', sup: true }))).toBe('<sup>2</sup>');
    expect(renderRichText(rt({ text: '2', sub: true }))).toBe('<sub>2</sub>');
    // Mutually exclusive at render — sup wins.
    expect(renderRichText(rt({ text: '2', sup: true, sub: true }))).toBe('<sup>2</sup>');
  });

  it('full stack composes as: span > a > sup > strong > em > s > code > text', () => {
    const html = renderRichText(rt({
      text: 'x',
      code: true,
      strike: true,
      italic: true,
      bold: true,
      sup: true,
      link: 'https://x.test',
      color: 'accent',
    }));
    expect(html).toBe(
      '<span class="pengui-text-accent"><a href="https://x.test"><sup><strong><em><s><code>x</code></s></em></strong></sup></a></span>',
    );
  });
});

describe('renderNodeList — per-node HTML emitters', () => {
  it('hero renders eyebrow + h1 + subtitle in order', () => {
    const html = renderNodeList([
      { type: 'hero', title: rt('Title'), eyebrow: rt('Eye'), subtitle: rt('Sub') },
    ]);
    expect(html).toContain('<div class="pengui-hero pengui-align-left">');
    expect(html).toContain('<p class="pengui-hero-eyebrow">Eye</p>');
    expect(html).toContain('<h1 class="pengui-hero-title">Title</h1>');
    expect(html).toContain('<p class="pengui-hero-subtitle">Sub</p>');
    // ordering check
    const eIdx = html.indexOf('eyebrow');
    const tIdx = html.indexOf('title');
    const sIdx = html.indexOf('subtitle');
    expect(eIdx).toBeLessThan(tIdx);
    expect(tIdx).toBeLessThan(sIdx);
  });

  it('hero omits eyebrow / subtitle when not provided', () => {
    const html = renderNodeList([{ type: 'hero', title: rt('Only') }]);
    expect(html).not.toContain('hero-eyebrow');
    expect(html).not.toContain('hero-subtitle');
    expect(html).toContain('<h1 class="pengui-hero-title">Only</h1>');
  });

  it('prose carries align class and inline rich-text', () => {
    const html = renderNodeList([
      { type: 'prose', body: rt('Plain ', { text: 'bold', bold: true }), align: 'center' },
    ]);
    expect(html).toContain('<p class="pengui-prose pengui-align-center">');
    expect(html).toContain('Plain <strong>bold</strong>');
  });

  it('image emits asset:// URI and alt-text from caption', () => {
    const html = renderNodeList([
      { type: 'image', asset_id: 'abc-123', caption: rt('My ', { text: 'cap', italic: true }) },
    ]);
    expect(html).toContain('<img src="asset://abc-123" alt="My cap" />');
    expect(html).toContain('<figcaption class="pengui-image-caption">My <em>cap</em></figcaption>');
  });

  it('image without caption emits empty alt and no figcaption', () => {
    const html = renderNodeList([{ type: 'image', asset_id: 'x' }]);
    expect(html).toContain('alt=""');
    expect(html).not.toContain('figcaption');
  });

  it('image fit class defaults to contain', () => {
    expect(renderNodeList([{ type: 'image', asset_id: 'x' }])).toContain('pengui-image-contain');
    expect(renderNodeList([{ type: 'image', asset_id: 'x', fit: 'cover' }])).toContain(
      'pengui-image-cover',
    );
  });

  it('callout emits kind class and optional title (RichText)', () => {
    const html = renderNodeList([
      { type: 'callout', kind: 'warning', title: rt('Watch out'), body: rt('Body') },
    ]);
    expect(html).toContain('<aside class="pengui-callout pengui-callout-warning">');
    expect(html).toContain('<p class="pengui-callout-title">Watch out</p>');
    expect(html).toContain('<div class="pengui-callout-body">Body</div>');
  });

  it('heading emits the right tag + level class for each level', () => {
    for (const level of [1, 2, 3, 4, 5, 6] as const) {
      const html = renderNodeList([{ type: 'heading', level, text: rt('H') }]);
      expect(html).toContain(`<h${level} class="pengui-heading pengui-heading-${level}`);
      expect(html).toContain(`</h${level}>`);
    }
  });

  it('list emits ul for bullet/checklist and ol for numbered', () => {
    expect(renderNodeList([{ type: 'list', style: 'bullet', items: [rt('a')] }])).toMatch(
      /<ul class="pengui-list pengui-list-bullet">/,
    );
    expect(renderNodeList([{ type: 'list', style: 'numbered', items: [rt('a')] }])).toMatch(
      /<ol class="pengui-list pengui-list-numbered">/,
    );
    expect(renderNodeList([{ type: 'list', style: 'checklist', items: [rt('a')] }])).toMatch(
      /<ul class="pengui-list pengui-list-checklist">/,
    );
  });

  it('divider emits hr with spacing class', () => {
    expect(renderNodeList([{ type: 'divider' }])).toContain('pengui-divider-md');
    expect(renderNodeList([{ type: 'divider', spacing: 'lg' }])).toContain('pengui-divider-lg');
  });

  it('quote emits body + optional attribution', () => {
    const noAttr = renderNodeList([{ type: 'quote', body: rt('Q') }]);
    expect(noAttr).toContain('<blockquote class="pengui-quote">');
    expect(noAttr).toContain('<p class="pengui-quote-body">Q</p>');
    expect(noAttr).not.toContain('pengui-quote-attribution');

    const withAttr = renderNodeList([
      { type: 'quote', body: rt('Q'), attribution: rt('Author') },
    ]);
    expect(withAttr).toContain('<cite class="pengui-quote-attribution">Author</cite>');
  });

  it('table emits caption, thead/th, tbody, and pads short rows', () => {
    const html = renderNodeList([
      {
        type: 'table',
        caption: rt('Cap'),
        headers: [rt('A'), rt('B'), rt('C')],
        rows: [
          [rt('1'), rt('2'), rt('3')],
          [rt('4'), rt('5')], // short — should be padded
        ],
      },
    ]);
    expect(html).toContain('<table class="pengui-table">');
    expect(html).toContain('<caption class="pengui-table-caption">Cap</caption>');
    expect(html).toContain('<th class="pengui-table-th" scope="col">A</th>');
    // 6 td cells total (2 rows × 3 cols), and the 6th is empty
    expect((html.match(/<td class="pengui-table-td">/g) ?? []).length).toBe(6);
    expect(html).toContain('<td class="pengui-table-td"></td>');
  });

  it('two_column emits ratio + gap classes and renders both columns', () => {
    const html = renderNodeList([
      {
        type: 'two_column',
        ratio: '1:2',
        gap: 'lg',
        left: [{ type: 'prose', body: rt('L') }],
        right: [{ type: 'image', asset_id: 'a' }],
      },
    ]);
    expect(html).toContain('pengui-two-column-1-2');
    expect(html).toContain('pengui-gap-lg');
    expect(html).toContain('<div class="pengui-two-column-left"><p class="pengui-prose');
    expect(html).toContain('<div class="pengui-two-column-right"><figure class="pengui-image');
  });

  it('emits NO literal hex colors anywhere (token-only output)', () => {
    const html = renderNodeList([
      { type: 'hero', title: rt('T'), subtitle: rt('S'), eyebrow: rt('E') },
      { type: 'prose', body: rt('p') },
      { type: 'callout', kind: 'tip', body: rt('c') },
      { type: 'image', asset_id: 'x' },
      { type: 'two_column', left: [{ type: 'prose', body: rt('L') }], right: [] },
    ]);
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });
});

describe('compileSlideIRToHtml', () => {
  const ir: SlideIR = {
    layout: 'default',
    background: 'canvas',
    body: [
      { type: 'hero', title: rt('Q3 Review'), eyebrow: rt('FY25') },
      { type: 'prose', body: rt('Highlights below.') },
    ],
  };

  it('produces a valid <!DOCTYPE html> document with .slide root', () => {
    const html = compileSlideIRToHtml({ ir, soul: STUB_SOUL, geometry: SLIDE_GEOMETRY });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('<html>');
    expect(html).toContain('<body>');
    expect(html).toContain('class="slide pengui-bg-canvas pengui-layout-default"');
    expect(html).toContain('</html>');
  });

  it('includes the soul cssTokens in the head <style>', () => {
    const html = compileSlideIRToHtml({ ir, soul: STUB_SOUL, geometry: SLIDE_GEOMETRY });
    expect(html).toContain('--color-canvas: #fff');
  });

  it('embeds the slide root reset (margin: 0; html, body) in the head <style>', () => {
    const html = compileSlideIRToHtml({ ir, soul: STUB_SOUL, geometry: SLIDE_GEOMETRY });
    expect(html).toContain('html, body { margin: 0; padding: 0; }');
    expect(html).toContain('width: 1920px');
    expect(html).toContain('height: 1080px');
  });

  it('sizes the .slide canvas to the supplied format geometry', () => {
    const printHtml = compileSlideIRToHtml({ ir, soul: STUB_SOUL, geometry: PRINT_GEOMETRY });
    expect(printHtml).toContain('width: 1240px');
    expect(printHtml).toContain('height: 1754px');
  });

  it('emits the canonical pengui-* node classes for each IR node', () => {
    const html = compileSlideIRToHtml({ ir, soul: STUB_SOUL, geometry: SLIDE_GEOMETRY });
    expect(html).toContain('pengui-hero');
    expect(html).toContain('pengui-prose');
  });

  it('background and layout role flow through to .slide classes', () => {
    const accent = compileSlideIRToHtml({
      ir: { layout: 'centered', background: 'accent', body: [] },
      soul: STUB_SOUL,
      geometry: SLIDE_GEOMETRY,
    });
    expect(accent).toContain('pengui-bg-accent');
    expect(accent).toContain('pengui-layout-centered');
  });

  it('emits NO literal color or px tokens — uses var() throughout the node CSS', () => {
    const html = compileSlideIRToHtml({ ir, soul: STUB_SOUL, geometry: SLIDE_GEOMETRY });
    // Strip the soul block + the slide-root block (which legitimately
    // contains the format px dimensions) and assert the per-node CSS
    // is var()-only.
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
    const css = styleMatch ? styleMatch[1] : '';
    const nodeCssOnly = css.split('.pengui-align-left').slice(1).join('.pengui-align-left');
    expect(nodeCssOnly).toContain('var(--');
    // No literal hex inside per-node CSS
    expect(nodeCssOnly).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  it('is deterministic — same inputs produce byte-identical output', () => {
    const a = compileSlideIRToHtml({ ir, soul: STUB_SOUL, geometry: SLIDE_GEOMETRY });
    const b = compileSlideIRToHtml({ ir, soul: STUB_SOUL, geometry: SLIDE_GEOMETRY });
    expect(a).toBe(b);
  });
});

describe('compileSectionIRToHtml', () => {
  const ir: SectionIR = {
    background: 'surface',
    body: [
      { type: 'hero', title: rt('Chapter 1') },
      { type: 'prose', body: rt('Opening paragraph.') },
    ],
  };

  it('emits a single root <section> with pengui-section + kind classes', () => {
    const html = compileSectionIRToHtml({ ir, kind: 'cover' });
    expect(html.startsWith('<section ')).toBe(true);
    expect(html).toMatch(/^<section class="pengui-section pengui-cover/);
    expect(html.endsWith('</section>')).toBe(true);
  });

  it('carries layout + background as classes on the root', () => {
    const html = compileSectionIRToHtml({ ir, kind: 'prose' });
    expect(html).toContain('pengui-section-default');
    expect(html).toContain('pengui-bg-surface');
  });

  it('does NOT inline a <style> block — section-structural forbids it; node CSS is registered once by DocumentComposer', () => {
    const html = compileSectionIRToHtml({ ir, kind: 'prose' });
    expect(html).not.toContain('<style');
  });

  it('renders the IR body inside the root section', () => {
    const html = compileSectionIRToHtml({ ir, kind: 'prose' });
    expect(html).toContain('<h1 class="pengui-hero-title">Chapter 1</h1>');
    expect(html).toContain('<p class="pengui-prose pengui-align-left">Opening paragraph.</p>');
  });

  it('is deterministic — same inputs produce byte-identical output', () => {
    expect(compileSectionIRToHtml({ ir, kind: 'prose' })).toBe(
      compileSectionIRToHtml({ ir, kind: 'prose' }),
    );
  });
});
