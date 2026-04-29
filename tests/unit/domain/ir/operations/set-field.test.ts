import { describe, it, expect } from 'vitest';
import {
  setNodeFieldAtPath,
  parseFieldName,
} from '../../../../../src/domain/ir/operations/set-field.js';
import type { SlideIR } from '../../../../../src/domain/ir/index.js';
import { rt } from '../../../../../src/domain/ir/rich-text.js';

describe('parseFieldName', () => {
  it('parses a plain identifier', () => {
    expect(parseFieldName('title')).toEqual({ name: 'title' });
    expect(parseFieldName('body')).toEqual({ name: 'body' });
  });

  it('parses an indexed array reference', () => {
    expect(parseFieldName('items[0]')).toEqual({ name: 'items', index: 0 });
    expect(parseFieldName('rows[12]')).toEqual({ name: 'rows', index: 12 });
  });

  it('throws on malformed input', () => {
    expect(() => parseFieldName('items[]')).toThrow();
    expect(() => parseFieldName('items.foo')).toThrow();
    expect(() => parseFieldName('items[-1]')).toThrow();
    expect(() => parseFieldName('')).toThrow();
  });
});

describe('setNodeFieldAtPath', () => {
  function ir(): SlideIR {
    return {
      body: [
        { type: 'hero', title: rt('Old title'), subtitle: rt('Old sub') },
        { type: 'list', style: 'bullet', items: [rt('a'), rt('b'), rt('c')] },
      ],
    };
  }

  it('sets a top-level field on the addressed node', () => {
    const next = setNodeFieldAtPath(ir(), ['body', 0], 'title', rt('New title'));
    const hero = next.body[0] as { title: ReturnType<typeof rt> };
    expect(hero.title).toEqual(rt('New title'));
  });

  it('does not mutate the original IR', () => {
    const root = ir();
    setNodeFieldAtPath(root, ['body', 0], 'title', rt('New'));
    const hero = root.body[0] as { title: ReturnType<typeof rt> };
    expect(hero.title).toEqual(rt('Old title'));
  });

  it('replaces a single array element via "items[N]"', () => {
    const next = setNodeFieldAtPath(ir(), ['body', 1], 'items[1]', rt('B-prime'));
    const list = next.body[1] as { items: ReturnType<typeof rt>[] };
    expect(list.items.map((r) => r[0].text)).toEqual(['a', 'B-prime', 'c']);
  });

  it('throws when the named field is not an array but an index was given', () => {
    // `type` is the discriminator string ('hero') — definitely not an array.
    expect(() =>
      setNodeFieldAtPath(ir(), ['body', 0], 'type[0]', 'x'),
    ).toThrow(/not an array/);
  });

  it('throws when the array index is out of range', () => {
    expect(() =>
      setNodeFieldAtPath(ir(), ['body', 1], 'items[99]', rt('x')),
    ).toThrow(/out of range/);
  });

  it('throws when the path does not address a node', () => {
    expect(() => setNodeFieldAtPath(ir(), ['body'], 'title', rt('x'))).toThrow();
  });
});
