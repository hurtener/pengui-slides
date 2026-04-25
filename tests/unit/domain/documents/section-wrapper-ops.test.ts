import { describe, it, expect } from 'vitest';
import {
  promoteRootToSection,
  wrapRootsInSection,
  summarizeTopLevelElements,
} from '../../../../src/domain/documents/section-wrapper-ops.js';
import { embedSectionMeta } from '../../../../src/domain/documents/section-meta-embedder.js';
import type { SectionMetadata } from '../../../../src/types/section.js';
import { PenguiError, ErrorCode } from '../../../../src/types/errors.js';

const baseMeta: SectionMetadata = {
  title: 'Test',
  kind: 'prose',
  narrative: 'N',
  generatedAt: '2026-04-24T00:00:00Z',
  soulId: 'soul-x',
  deckId: 'deck-x',
  position: 0,
  metaVersion: '3.0',
  revisionHash: 'abc',
};

describe('promoteRootToSection', () => {
  it('rewrites a <div> root into <section> with required classes, preserving attrs and children', () => {
    const html = '<div id="cover" class="foo" style="background: red"><h1>Hi</h1></div>';
    const result = promoteRootToSection(html, 'cover');
    expect(result.changed).toBe(true);
    expect(result.html).toMatch(/^<section/);
    expect(result.html).toMatch(/class="pengui-section pengui-cover foo"/);
    expect(result.html).toContain('id="cover"');
    expect(result.html).toContain('style="background: red"');
    expect(result.html).toContain('<h1>Hi</h1>');
  });

  it('is a no-op when the root is already a conforming <section>', () => {
    const html = '<section class="pengui-section pengui-prose"><p>ok</p></section>';
    const result = promoteRootToSection(html, 'prose');
    expect(result.changed).toBe(false);
    expect(result.html).toBe(html);
  });

  it('adds missing kind class without duplicating pengui-section', () => {
    const html = '<section class="pengui-section"><p>ok</p></section>';
    const result = promoteRootToSection(html, 'prose');
    expect(result.changed).toBe(true);
    expect(result.html).toMatch(/class="pengui-section pengui-prose"/);
  });

  it('throws a typed SECTION_INVALID_FRAGMENT error on multiple top-level elements', () => {
    const html = '<div>a</div><div>b</div>';
    try {
      promoteRootToSection(html, 'prose');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PenguiError);
      expect((err as PenguiError).code).toBe(ErrorCode.SECTION_INVALID_FRAGMENT);
      expect((err as PenguiError).details).toMatchObject({
        topLevelElementCount: 2,
        suggestedTool: 'wrap_section_root',
      });
    }
  });

  it('throws a typed SECTION_INVALID_FRAGMENT error on empty fragment', () => {
    try {
      promoteRootToSection('   ', 'prose');
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PenguiError);
      expect((err as PenguiError).code).toBe(ErrorCode.SECTION_INVALID_FRAGMENT);
    }
  });

  it('strips stale pengui-{other-kind} classes when kind has changed', () => {
    // Simulates: agent added with kind='cover' then changed kind='figure'
    // via update_section, leaving pengui-cover on the wrapper.
    const html = '<section class="pengui-section pengui-cover foo"><p>x</p></section>';
    const result = promoteRootToSection(html, 'figure');
    expect(result.changed).toBe(true);
    expect(result.html).toMatch(/class="pengui-section pengui-figure foo"/);
    expect(result.html).not.toMatch(/pengui-cover/);
  });
});

describe('wrapRootsInSection', () => {
  it('wraps multiple top-level elements in a single <section>', () => {
    const html = '<div class="a">A</div><div class="b">B</div><div class="c">C</div>';
    const result = wrapRootsInSection(html, 'cover');
    expect(result.changed).toBe(true);
    expect(result.html).toMatch(/^<section class="pengui-section pengui-cover">/);
    expect(result.html).toContain('<div class="a">A</div>');
    expect(result.html).toContain('<div class="b">B</div>');
    expect(result.html).toContain('<div class="c">C</div>');
    // Exactly one <section> wrapper.
    expect(result.html.match(/<section/g)?.length).toBe(1);
  });

  it('honors child_order to reshuffle top-level elements', () => {
    const html = '<div>A</div><div>B</div><div>C</div>';
    const result = wrapRootsInSection(html, 'prose', [2, 0, 1]);
    const inner = result.html
      .replace(/^<section[^>]*>/, '')
      .replace(/<\/section>$/, '');
    expect(inner).toBe('<div>C</div><div>A</div><div>B</div>');
  });

  it('rejects child_order with wrong length using INVALID_INPUT', () => {
    const html = '<div>A</div><div>B</div>';
    try {
      wrapRootsInSection(html, 'prose', [0]);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PenguiError);
      expect((err as PenguiError).code).toBe(ErrorCode.INVALID_INPUT);
    }
  });

  it('rejects child_order with out-of-range index using INVALID_INPUT', () => {
    const html = '<div>A</div><div>B</div>';
    try {
      wrapRootsInSection(html, 'prose', [0, 5]);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PenguiError);
      expect((err as PenguiError).code).toBe(ErrorCode.INVALID_INPUT);
    }
  });

  it('rejects child_order with duplicate index', () => {
    const html = '<div>A</div><div>B</div>';
    try {
      wrapRootsInSection(html, 'prose', [0, 0]);
      expect.fail('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PenguiError);
      expect((err as PenguiError).code).toBe(ErrorCode.INVALID_INPUT);
    }
  });

  it('no-ops when the fragment is already a single conforming section', () => {
    const html = '<section class="pengui-section pengui-prose"><p>x</p></section>';
    const result = wrapRootsInSection(html, 'prose');
    expect(result.changed).toBe(false);
  });

  it('still validates child_order even when the fragment is conforming (no silent ignore)', () => {
    // Regression: e2e driver caught this — the no-op short-circuit ran
    // before child_order validation, so bad input was silently swallowed.
    const html = '<section class="pengui-section pengui-prose"><p>x</p></section>';
    try {
      wrapRootsInSection(html, 'prose', [99, 99]);
      expect.fail('should have rejected bad child_order even on conforming input');
    } catch (err) {
      expect(err).toBeInstanceOf(PenguiError);
      expect((err as PenguiError).code).toBe(ErrorCode.INVALID_INPUT);
    }
  });
});

describe('summarizeTopLevelElements', () => {
  it('returns an ordered list with tag, id, and classes', () => {
    const html =
      '<div id="a" class="x y">one</div>\n<p>two</p>\n<section class="pengui-section">three</section>';
    const summary = summarizeTopLevelElements(html);
    expect(summary).toEqual([
      { index: 0, tag: 'div', id: 'a', classes: ['x', 'y'] },
      { index: 1, tag: 'p', classes: [] },
      { index: 2, tag: 'section', classes: ['pengui-section'] },
    ]);
  });
});

describe('embedSectionMeta', () => {
  it('injects the comment above an existing <section> root', () => {
    const html = '<section class="pengui-section pengui-prose"><p>x</p></section>';
    const out = embedSectionMeta(html, baseMeta);
    expect(out.indexOf('<!-- @section-meta')).toBeLessThan(out.indexOf('<section'));
    expect(out).toContain('"title": "Test"');
  });

  it('replaces an existing @section-meta comment rather than duplicating', () => {
    const first = embedSectionMeta(
      '<section class="pengui-section pengui-prose"></section>',
      baseMeta,
    );
    const updated = embedSectionMeta(first, { ...baseMeta, title: 'Second' });
    expect(updated.match(/@section-meta/g)?.length).toBe(1);
    expect(updated).toContain('"title": "Second"');
  });

  it('still inserts a comment when the root is not a <section> (validator will flag the root separately)', () => {
    const out = embedSectionMeta('<div>hi</div>', baseMeta);
    expect(out.startsWith('<!-- @section-meta')).toBe(true);
    expect(out).toContain('<div>hi</div>');
  });
});
