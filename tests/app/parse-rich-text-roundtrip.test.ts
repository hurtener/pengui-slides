// @vitest-environment jsdom

/**
 * Round-trip: server-side `renderRichText` (TextRun[] → HTML) followed
 * by client-side `parseRichTextFromHtml` (HTML → TextRun[]). Pinning
 * this symmetry catches any future drift between the two halves of the
 * v4.9 rich-text editing loop. The renderer is the source of truth;
 * the parser must understand its full output.
 */

import { describe, it, expect } from 'vitest';
import { renderRichText } from '../../src/domain/ir/compile/rich-text-renderer.js';
import { parseRichTextFromHtml, type TextRun } from '../../app/src/lib/parseRichText';
import type { RichText } from '../../src/domain/ir/rich-text.js';

function roundtrip(runs: RichText): TextRun[] {
  const html = renderRichText(runs);
  return parseRichTextFromHtml(html);
}

describe('renderRichText → parseRichTextFromHtml round-trip', () => {
  it('plain text', () => {
    const input: RichText = [{ text: 'plain text' }];
    expect(roundtrip(input)).toEqual(input);
  });

  it('single mark — bold', () => {
    const input: RichText = [{ text: 'bold', bold: true }];
    expect(roundtrip(input)).toEqual(input);
  });

  it('single mark — italic', () => {
    const input: RichText = [{ text: 'em', italic: true }];
    expect(roundtrip(input)).toEqual(input);
  });

  it('single mark — code', () => {
    const input: RichText = [{ text: 'x', code: true }];
    expect(roundtrip(input)).toEqual(input);
  });

  it('single mark — strike', () => {
    const input: RichText = [{ text: 'old', strike: true }];
    expect(roundtrip(input)).toEqual(input);
  });

  it('stacked marks — bold + italic + code + strike', () => {
    const input: RichText = [{ text: 'all', bold: true, italic: true, code: true, strike: true }];
    expect(roundtrip(input)).toEqual(input);
  });

  it('link', () => {
    const input: RichText = [{ text: 'click', link: 'https://example.com' }];
    expect(roundtrip(input)).toEqual(input);
  });

  it('color (semantic role)', () => {
    const input: RichText = [{ text: 'red', color: 'accent_warm' }];
    expect(roundtrip(input)).toEqual(input);
  });

  it('full stack — color + link + sup + bold + italic + strike + code', () => {
    const input: RichText = [
      {
        text: 'kitchen sink',
        bold: true,
        italic: true,
        code: true,
        strike: true,
        sup: true,
        link: 'https://example.com/doc',
        color: 'accent',
      },
    ];
    expect(roundtrip(input)).toEqual(input);
  });

  it('multiple runs, mixed marks', () => {
    const input: RichText = [
      { text: 'plain ' },
      { text: 'bold', bold: true },
      { text: ' and ' },
      { text: 'italic', italic: true },
    ];
    expect(roundtrip(input)).toEqual(input);
  });

  it('escapes HTML special characters round-trip', () => {
    const input: RichText = [{ text: 'a < b & c > d "quote"' }];
    expect(roundtrip(input)).toEqual(input);
  });
});
