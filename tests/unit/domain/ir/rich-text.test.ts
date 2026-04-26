import { describe, it, expect } from 'vitest';
import {
  TextRunSchema,
  RichTextSchema,
  rt,
  richTextToPlain,
} from '../../../../src/domain/ir/rich-text.js';

describe('TextRunSchema', () => {
  it('accepts a plain text run', () => {
    expect(TextRunSchema.parse({ text: 'hello' })).toEqual({ text: 'hello' });
  });

  it('accepts each formatting flag independently', () => {
    expect(TextRunSchema.parse({ text: 'h', bold: true }).bold).toBe(true);
    expect(TextRunSchema.parse({ text: 'h', italic: true }).italic).toBe(true);
    expect(TextRunSchema.parse({ text: 'h', code: true }).code).toBe(true);
  });

  it('accepts a link run with a valid URL', () => {
    const r = TextRunSchema.parse({ text: 'click', link: 'https://example.com' });
    expect(r.link).toBe('https://example.com');
  });

  it('rejects a link with an invalid URL', () => {
    expect(() => TextRunSchema.parse({ text: 'x', link: 'not-a-url' })).toThrow();
  });

  it('rejects unknown fields (strict mode catches typos)', () => {
    expect(() => TextRunSchema.parse({ text: 'h', strong: true })).toThrow();
  });

  it('rejects missing text field', () => {
    expect(() => TextRunSchema.parse({ bold: true })).toThrow();
  });
});

describe('RichTextSchema', () => {
  it('accepts an empty array (renders as empty content)', () => {
    expect(RichTextSchema.parse([])).toEqual([]);
  });

  it('accepts a multi-run mix of plain + formatted', () => {
    const runs = [{ text: 'See ' }, { text: 'docs', link: 'https://x.com' }, { text: ' now.', bold: true }];
    expect(RichTextSchema.parse(runs)).toEqual(runs);
  });
});

describe('rt() helper', () => {
  it('lifts plain strings into runs', () => {
    expect(rt('hello, ', 'world')).toEqual([{ text: 'hello, ' }, { text: 'world' }]);
  });

  it('passes through full TextRun objects', () => {
    expect(rt('a ', { text: 'b', bold: true })).toEqual([{ text: 'a ' }, { text: 'b', bold: true }]);
  });

  it('produces a parseable RichText every time', () => {
    expect(() => RichTextSchema.parse(rt('a', { text: 'b', italic: true }))).not.toThrow();
  });
});

describe('richTextToPlain', () => {
  it('drops formatting and concatenates text', () => {
    expect(richTextToPlain([{ text: 'a ' }, { text: 'b', bold: true }, { text: ' c' }])).toBe('a b c');
  });

  it('returns empty string for empty array', () => {
    expect(richTextToPlain([])).toBe('');
  });
});
