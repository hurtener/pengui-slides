import { describe, it, expect } from 'vitest';
import { commentSafeStringify } from '../../../../src/domain/metadata/comment-safe-json.js';

describe('commentSafeStringify', () => {
  it('escapes "--" so payloads cannot close an HTML comment early', () => {
    const out = commentSafeStringify({ title: 'Step 1 --> Step 2', narrative: 'a -- b' });
    expect(out).not.toMatch(/--/);
    expect(out).toContain('-\\u002d');
  });

  it('round-trips through JSON.parse without manual unescape', () => {
    const value = { title: 'A --> B', narrative: 'x -- y', n: 3 };
    const out = commentSafeStringify(value);
    const wrapped = `<!-- @x ${out} -->`;
    const inner = wrapped.match(/<!--\s*@x\s+([\s\S]*?)\s*-->/)![1];
    expect(JSON.parse(inner)).toEqual(value);
  });

  it('pretty-prints by default (2-space indent)', () => {
    const out = commentSafeStringify({ a: 1, b: 2 });
    expect(out).toContain('\n  "a": 1');
  });

  it('respects an explicit space argument', () => {
    expect(commentSafeStringify({ a: 1 }, 0)).toBe('{"a":1}');
    expect(commentSafeStringify({ a: 1 }, 4)).toContain('\n    "a": 1');
  });
});
