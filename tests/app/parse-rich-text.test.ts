// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import {
  parseRichTextFromElement,
  parseRichTextFromHtml,
} from '../../app/src/lib/parseRichText';

describe('parseRichTextFromHtml', () => {
  it('parses plain text into a single bare run', () => {
    expect(parseRichTextFromHtml('Hello world')).toEqual([{ text: 'Hello world' }]);
  });

  it('extracts <strong> as bold', () => {
    expect(parseRichTextFromHtml('Hi <strong>there</strong>')).toEqual([
      { text: 'Hi ' },
      { text: 'there', bold: true },
    ]);
  });

  it('treats <b> as bold (legacy alias)', () => {
    expect(parseRichTextFromHtml('A<b>B</b>')).toEqual([
      { text: 'A' },
      { text: 'B', bold: true },
    ]);
  });

  it('extracts <em> as italic', () => {
    expect(parseRichTextFromHtml('<em>x</em>')).toEqual([{ text: 'x', italic: true }]);
  });

  it('stacks bold + italic when nested', () => {
    expect(parseRichTextFromHtml('<strong><em>both</em></strong>')).toEqual([
      { text: 'both', bold: true, italic: true },
    ]);
  });

  it('round-trips the renderer composition order (color > link > sup > strong > em > strike > code)', () => {
    // Mirrors the innermost-to-outermost order in renderRichText so that
    // parser + renderer agree on a {bold,italic,code,strike,link,color}
    // run.
    const html =
      '<span class="pengui-text-accent">' +
        '<a href="https://example.com">' +
          '<sup>' +
            '<strong>' +
              '<em>' +
                '<s>' +
                  '<code>x</code>' +
                '</s>' +
              '</em>' +
            '</strong>' +
          '</sup>' +
        '</a>' +
      '</span>';
    expect(parseRichTextFromHtml(html)).toEqual([
      {
        text: 'x',
        bold: true,
        italic: true,
        code: true,
        strike: true,
        sup: true,
        link: 'https://example.com',
        color: 'accent',
      },
    ]);
  });

  it('extracts color from `pengui-text-` span class with underscore conversion', () => {
    expect(parseRichTextFromHtml('<span class="pengui-text-accent-warm">w</span>')).toEqual([
      { text: 'w', color: 'accent_warm' },
    ]);
  });

  it('treats <s>, <strike>, <del> all as strike', () => {
    expect(parseRichTextFromHtml('<s>a</s><strike>b</strike><del>c</del>')).toEqual([
      { text: 'abc', strike: true },
    ]);
  });

  it('merges adjacent runs with identical marks', () => {
    // Two siblings sharing identical mark sets should collapse into one
    // run so the agent payload stays compact.
    expect(parseRichTextFromHtml('<strong>A</strong><strong>B</strong>')).toEqual([
      { text: 'AB', bold: true },
    ]);
  });

  it('does not merge runs that differ in any single mark', () => {
    expect(parseRichTextFromHtml('<strong>A</strong><em>B</em>')).toEqual([
      { text: 'A', bold: true },
      { text: 'B', italic: true },
    ]);
  });

  it('ignores empty input', () => {
    expect(parseRichTextFromHtml('')).toEqual([]);
    expect(parseRichTextFromHtml('   ')).toEqual([{ text: '   ' }]);
  });

  it('translates <br> to a literal newline run', () => {
    expect(parseRichTextFromHtml('A<br>B')).toEqual([{ text: 'A\nB' }]);
  });

  it('drops `[data-pengui-overlay]` injected nodes (toolbar, decorations)', () => {
    expect(
      parseRichTextFromHtml(
        'visible<span data-pengui-overlay="1">should not appear</span>after',
      ),
    ).toEqual([{ text: 'visibleafter' }]);
  });

  it('parseRichTextFromElement walks a contentEditable host', () => {
    const host = document.createElement('div');
    host.innerHTML = 'plain <strong>bold</strong>';
    expect(parseRichTextFromElement(host)).toEqual([
      { text: 'plain ' },
      { text: 'bold', bold: true },
    ]);
  });

  it('flattens block elements inside an inline-text container', () => {
    // Browsers sometimes wrap pasted content in <p>; the runs should
    // still be inline-only with newline separators. Adjacent bare runs
    // merge so the final shape is a single run with embedded newlines.
    expect(parseRichTextFromHtml('<p>first</p><p>second</p>')).toEqual([
      { text: 'first\nsecond' },
    ]);
  });

  it('sup wins over sub when both are present (mirrors renderRichText)', () => {
    expect(parseRichTextFromHtml('<sub><sup>x</sup></sub>')).toEqual([
      { text: 'x', sup: true },
    ]);
  });
});
