import { describe, it, expect } from 'vitest';
import { insertMetaComment } from '../../../../src/domain/metadata/insert-meta-comment.js';

const META = '<!-- @x {"a":1} -->';
const EXISTING_RE = /<!--\s*@x\s+[\s\S]*?\s*-->\n?/;
const SLIDE_DIV = /(<div[^>]*class=["'][^"']*\bslide\b[^"']*["'][^>]*>)/i;
const SECTION = /(<section\b[^>]*>)/i;
const ANY_TAG = /(<[a-z][^>]*>)/i;

describe('insertMetaComment', () => {
  it('inserts before the first matching root candidate', () => {
    const html = '<body><div class="slide"><p>x</p></div></body>';
    const out = insertMetaComment(html, META, EXISTING_RE, [SLIDE_DIV]);
    const metaIdx = out.indexOf(META);
    const divIdx = out.indexOf('<div class="slide"');
    expect(metaIdx).toBeGreaterThanOrEqual(0);
    expect(metaIdx).toBeLessThan(divIdx);
  });

  it('replaces an existing meta comment in place', () => {
    const html = '<!-- @x {"old":1} -->\n<div class="slide">y</div>';
    const out = insertMetaComment(html, META, EXISTING_RE, [SLIDE_DIV]);
    expect(out).toContain('"a":1');
    expect(out).not.toContain('"old":1');
    // Only one meta comment after replacement.
    expect(out.match(/<!--\s*@x/g)?.length).toBe(1);
  });

  it('walks root candidates in order; first match wins', () => {
    const html = '<p>just text</p><section><h1>x</h1></section>';
    // Section root matches; ANY_TAG would also match <p>; section wins because it's first.
    const out = insertMetaComment(html, META, EXISTING_RE, [SECTION, ANY_TAG]);
    expect(out.indexOf(META)).toBeLessThan(out.indexOf('<section>'));
    expect(out.indexOf(META)).toBeGreaterThan(out.indexOf('<p>'));
  });

  it('falls back to the next candidate when the first does not match', () => {
    const html = '<p>just paragraph</p>';
    const out = insertMetaComment(html, META, EXISTING_RE, [SECTION, ANY_TAG]);
    // SECTION misses; ANY_TAG matches the <p>.
    expect(out.indexOf(META)).toBeLessThan(out.indexOf('<p>'));
  });

  it('prepends as last-resort when no candidate matches', () => {
    const html = 'plain text no tags';
    const out = insertMetaComment(html, META, EXISTING_RE, [SECTION]);
    expect(out.startsWith(META)).toBe(true);
  });

  it('is idempotent: running twice yields the same output', () => {
    const html = '<div class="slide">y</div>';
    const once = insertMetaComment(html, META, EXISTING_RE, [SLIDE_DIV]);
    const twice = insertMetaComment(once, META, EXISTING_RE, [SLIDE_DIV]);
    expect(twice).toBe(once);
  });

  it('strips a stale comment before inserting at the new root', () => {
    // Stale comment is upstream of where the root now sits.
    const html = '<!-- @x {"old":1} -->\nprefix junk<section>fresh</section>';
    const out = insertMetaComment(html, META, EXISTING_RE, [SECTION]);
    expect(out).not.toContain('"old":1');
    expect(out.indexOf(META)).toBeLessThan(out.indexOf('<section>'));
  });
});
