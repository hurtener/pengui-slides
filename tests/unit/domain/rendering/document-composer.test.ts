import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentComposer } from '../../../../src/domain/rendering/document-composer.js';
import { Logger } from '../../../../src/infrastructure/logger.js';
import { AssetService } from '../../../../src/domain/assets/asset-service.js';
import { InMemoryAssetStore } from '../../../../src/storage/memory/asset-store.js';
import { FixedClock } from '../../../../src/infrastructure/clock.js';
import { FORMAT_REGISTRY } from '../../../../src/domain/formats/format-registry.js';
import type { Section, SectionKind, SectionBreakHints } from '../../../../src/types/section.js';
import type { Deck, DocumentMeta } from '../../../../src/types/deck.js';
import type { DesignSoul } from '../../../../src/types/design-soul.js';
import type { FormatGeometry } from '../../../../src/types/format.js';
import type {
  DeckId,
  SectionId,
  SoulId,
} from '../../../../src/types/common.js';

// Small fixture helpers -------------------------------------------------

const DEFAULT_SOUL_CSS = `:root {
  --color-canvas: #F7F2EA;
  --color-surface: #FFFFFF;
  --color-surface-alt: #EFE9E0;
  --color-border: #DDD6CC;
  --color-text-primary: #1F2328;
  --color-text-secondary: #555B63;
  --color-text-tertiary: #787F88;
  --color-accent-primary: #E8835E;
  --color-accent-secondary: #5CB8A4;
  --color-accent-warm: #E8835E;
  --color-success: #5CB8A4;
  --color-warning: #E8835E;
  --color-info: #6B7A8F;
  --color-category-a: #E8835E;
  --color-category-a-tint: #FBE2D4;
  --color-category-b: #5CB8A4;
  --color-category-b-tint: #D4EFE8;
  --color-category-c: #8B7EC8;
  --color-category-c-tint: #E5E0F5;
  --color-category-d: #D4A574;
  --color-category-d-tint: #F5E8D4;
  --font-display: "Georgia", serif;
  --font-body: "Helvetica", sans-serif;
  --font-mono: "Menlo", monospace;
  --text-hero: 72px;
  --text-h1: 48px;
  --text-h2: 32px;
  --text-h3: 22px;
  --text-body: 16px;
  --text-label: 14px;
  --text-caption: 12px;
  --weight-normal: 400;
  --weight-medium: 500;
  --weight-bold: 700;
  --line-height-heading: 1.15;
  --leading-body: 1.5;
  --letter-spacing-heading: 0.01em;
  --letter-spacing-body: 0;
  --space-xs: 8px;
  --space-sm: 12px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 40px;
  --space-xxl: 64px;
  --space-xxxl: 96px;
  --space-safe-area: 96px;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-card: 8px;
  --radius-full: 999px;
  --border-width: 1px;
}`;

function makeSoul(overrides: Partial<DesignSoul> = {}): DesignSoul {
  return {
    id: 'soul-1' as SoulId,
    name: 'Test Soul',
    description: 'for tests',
    status: 'approved',
    layers: {} as DesignSoul['layers'],
    cssTokens: DEFAULT_SOUL_CSS,
    tokenNames: [],
    allowedFonts: ['Georgia', 'Helvetica', 'Menlo'],
    utilityCss: '',
    styleGuide: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeDeck(overrides: Partial<Deck> = {}): Deck {
  return {
    id: 'deck-1' as DeckId,
    soulId: 'soul-1' as SoulId,
    title: 'Sample Document',
    author: 'Test',
    slideIds: [],
    sectionIds: [],
    format: 'print_a4_portrait',
    authoringModel: 'document',
    documentMeta: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSection(
  kind: SectionKind,
  html: string,
  overrides: Partial<Section> = {},
  breakHints: SectionBreakHints = {},
  chromeOverrides?: Section['metadata']['chromeOverrides'],
  title = 'Section',
): Section {
  const id = (overrides.id ?? `section-${Math.random().toString(36).slice(2, 8)}`) as SectionId;
  return {
    id,
    deckId: 'deck-1' as DeckId,
    position: 0,
    html,
    kind,
    breakHints,
    metadata: {
      title,
      kind,
      narrative: 'test narrative',
      generatedAt: '2026-01-01T00:00:00.000Z',
      soulId: 'soul-1',
      deckId: 'deck-1',
      position: 0,
      metaVersion: '3.0',
      revisionHash: 'abc',
      ...(chromeOverrides ? { chromeOverrides } : {}),
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function wrapMeta(kind: SectionKind, inner: string, title = 'Test'): string {
  return (
    `<!-- @section-meta {"title":"${title}","kind":"${kind}","narrative":"n"} -->\n` +
    `<section class="pengui-section pengui-${kind}">${inner}</section>`
  );
}

function geometryFor(format: 'print_a4_portrait' | 'slides_16_9' = 'print_a4_portrait'): FormatGeometry {
  return FORMAT_REGISTRY[format].geometry;
}

// ----------------------------------------------------------------------

describe('DocumentComposer', () => {
  let composer: DocumentComposer;

  beforeEach(() => {
    composer = new DocumentComposer(new Logger('test', 'error'));
  });

  // ── Base anatomy ────────────────────────────────────────────────

  it('emits the expected head style blocks and <main class="pengui-document">', async () => {
    const sections = [
      makeSection('prose', wrapMeta('prose', '<p>Hello.</p>')),
    ];

    const result = await composer.compose({
      sections,
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: {},
    });

    expect(result.html).toContain('<!DOCTYPE html>');
    expect(result.html).toContain('<style id="pengui-soul-tokens">');
    expect(result.html).toContain('<style id="pengui-print-base">');
    expect(result.html).toContain('<style id="pengui-block-styles">');
    expect(result.html).toContain('<style id="pengui-chrome">');
    expect(result.html).toContain('<main class="pengui-document">');
    // Running chrome is rendered via @page margin boxes (CSS Paged Media
    // Level 3), NOT via body-level fixed <header>/<footer>. The default
    // @page gets a @bottom-right counter and @top-right running title.
    expect(result.html).toContain('@bottom-right');
  });

  it('sets data-pengui-medium="print" and data-pengui-model="document" on <html>', async () => {
    const result = await composer.compose({
      sections: [makeSection('prose', wrapMeta('prose', '<p>x</p>'))],
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: {},
    });

    expect(result.html).toMatch(/<html[^>]*data-pengui-medium="print"/);
    expect(result.html).toMatch(/<html[^>]*data-pengui-model="document"/);
  });

  it('wraps each section with the canonical id and data-kind attributes', async () => {
    const s1 = makeSection('prose', wrapMeta('prose', '<p>one</p>'), {
      id: 'section-a' as SectionId,
    });
    const s2 = makeSection('figure', wrapMeta('figure', '<figure class="pengui-figure"><figcaption>c</figcaption></figure>'), {
      id: 'section-b' as SectionId,
    });

    const result = await composer.compose({
      sections: [s1, s2],
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: {},
    });

    expect(result.sectionDomIds).toEqual({
      'section-a': 'sec-1',
      'section-b': 'sec-2',
    });
    expect(result.html).toMatch(/<section[^>]*id="sec-1"[^>]*data-kind="prose"/);
    expect(result.html).toMatch(/<section[^>]*id="sec-2"[^>]*data-kind="figure"/);
  });

  it('cover sections default to data-full-page="true" and data-chrome="off"', async () => {
    const cover = makeSection('cover', wrapMeta('cover', '<h1>Title</h1>'));
    const prose = makeSection('prose', wrapMeta('prose', '<p>body</p>'));

    const result = await composer.compose({
      sections: [cover, prose],
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: {},
    });

    expect(result.html).toMatch(
      /<section[^>]*id="sec-1"[^>]*data-kind="cover"[^>]*data-full-page="true"[^>]*data-chrome="off"/,
    );
    expect(result.html).toMatch(/<section[^>]*id="sec-2"[^>]*data-full-page="false"/);
    expect(result.html).toMatch(/<section[^>]*id="sec-2"[^>]*data-chrome="on"/);
  });

  it('chapter_header sections default to data-full-page="true" with inline break-before: page', async () => {
    const chapter = makeSection(
      'chapter_header',
      wrapMeta('chapter_header', '<h1>Ch 1</h1>'),
    );

    const result = await composer.compose({
      sections: [chapter],
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: {},
    });

    expect(result.html).toMatch(
      /<section[^>]*data-kind="chapter_header"[^>]*data-full-page="true"/,
    );
    expect(result.html).toMatch(/style="[^"]*break-before: page/);
  });

  it('preserves existing wrapper classes like pengui-figure declared in the fragment body', async () => {
    const figureHtml =
      '<!-- @section-meta {"title":"F","kind":"figure","narrative":"n"} -->' +
      '<section class="pengui-section pengui-figure custom-class">' +
      '<figure class="pengui-figure"><figcaption>c</figcaption></figure>' +
      '</section>';
    const section = makeSection('figure', figureHtml);

    const result = await composer.compose({
      sections: [section],
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: {},
    });

    // Root wrapper class list merged, not replaced
    expect(result.html).toMatch(
      /<section[^>]*class="[^"]*pengui-section[^"]*pengui-figure[^"]*custom-class/,
    );
    // Inner figure class must survive untouched
    expect(result.html).toContain('<figure class="pengui-figure">');
  });

  // ── Soul tokens ──────────────────────────────────────────────────

  it('injects soul tokens exactly once inside <style id="pengui-soul-tokens">', async () => {
    const result = await composer.compose({
      sections: [makeSection('prose', wrapMeta('prose', '<p>x</p>'))],
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: {},
    });

    // The soul block is the only place :root appears in composer output.
    const rootOccurrences = result.html.match(/:root\s*\{/g) ?? [];
    expect(rootOccurrences.length).toBe(1);

    // Tokens block wraps exactly one soul :root.
    const soulBlockMatch = result.html.match(
      /<style id="pengui-soul-tokens">([\s\S]*?)<\/style>/,
    );
    expect(soulBlockMatch).not.toBeNull();
    expect(soulBlockMatch![1]).toContain(':root');
    expect(soulBlockMatch![1]).toContain('--color-canvas');
  });

  // ── @page / margins ───────────────────────────────────────────────

  it('@page size follows geometry.physicalPage + orientation (A4 portrait)', async () => {
    const result = await composer.compose({
      sections: [makeSection('prose', wrapMeta('prose', '<p>x</p>'))],
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor('print_a4_portrait'),
      documentMeta: {},
    });

    const baseMatch = result.html.match(
      /<style id="pengui-print-base">([\s\S]*?)<\/style>/,
    );
    expect(baseMatch).not.toBeNull();
    expect(baseMatch![1]).toContain('size: A4 portrait;');
  });

  it('documentMeta.pageMargin overrides the default margin declaration', async () => {
    const result = await composer.compose({
      sections: [makeSection('prose', wrapMeta('prose', '<p>x</p>'))],
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: {
        pageMargin: { top: '10mm', right: '12mm', bottom: '30mm', left: '12mm' },
      },
    });

    const baseMatch = result.html.match(
      /<style id="pengui-print-base">([\s\S]*?)<\/style>/,
    );
    expect(baseMatch).not.toBeNull();
    expect(baseMatch![1]).toMatch(/margin:\s*10mm\s+12mm\s+30mm\s+12mm/);
  });

  // ── Chrome ───────────────────────────────────────────────────────

  it('emits @page margin-box chrome with the deck running title + page counter', async () => {
    const result = await composer.compose({
      sections: [makeSection('prose', wrapMeta('prose', '<p>x</p>'))],
      deck: makeDeck({ title: 'My Report' }),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: { chrome: { runningTitle: 'My Report' } },
    });

    const chromeMatch = result.html.match(
      /<style id="pengui-chrome">([\s\S]*?)<\/style>/,
    );
    expect(chromeMatch).not.toBeNull();
    const chrome = chromeMatch![1];
    // Running title lives in @top-right of the default @page, page
    // counter in @bottom-right. Both use counter() which only resolves
    // inside @page margin boxes in Chromium.
    expect(chrome).toContain('@top-right');
    expect(chrome).toContain('"My Report"');
    expect(chrome).toContain('counter(page)');
    expect(chrome).toContain('counter(pages)');
    // Chrome-off is suppressed via a named @page with empty margin boxes.
    expect(chrome).toContain('@page nochrome');
    expect(chrome).toContain('[data-chrome="off"] { page: nochrome;');
  });

  it('emits a named @page block per unique chromeOverrides.runningTitle', async () => {
    const s1 = makeSection(
      'chapter_header',
      wrapMeta('chapter_header', '<h1>Ch 1</h1>'),
      {},
      {},
      { runningTitle: 'Chapter 1 — Foundations' },
    );
    const s2 = makeSection(
      'chapter_header',
      wrapMeta('chapter_header', '<h1>Ch 2</h1>'),
      {},
      {},
      { runningTitle: 'Chapter 2 — Techniques' },
    );

    const result = await composer.compose({
      sections: [s1, s2],
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: {},
    });

    // Per-chapter @page blocks override @top-right with the chapter title.
    expect(result.html).toMatch(/@page chromechapter1foundations\s*\{[\s\S]*?@top-right[\s\S]*?"Chapter 1/);
    expect(result.html).toMatch(/@page chromechapter2techniques\s*\{[\s\S]*?@top-right[\s\S]*?"Chapter 2/);
    // And data attributes on the wrapper sections pointing to them.
    expect(result.html).toMatch(
      /<section[^>]*data-running-title="chromechapter1foundations"/,
    );
    expect(result.html).toMatch(
      /<section[^>]*data-running-title="chromechapter2techniques"/,
    );
  });

  // ── TOC auto-generation ────────────────────────────────────────────

  it('auto-fills an empty toc section with <ol> of chapter_header entries', async () => {
    const toc = makeSection('toc', wrapMeta('toc', ''));
    const ch1 = makeSection(
      'chapter_header',
      wrapMeta('chapter_header', '<h1>One</h1>'),
      { id: 'chap-1' as SectionId },
      {},
      undefined,
      'Foundations',
    );
    const prose = makeSection('prose', wrapMeta('prose', '<p>body</p>'));
    const ch2 = makeSection(
      'chapter_header',
      wrapMeta('chapter_header', '<h1>Two</h1>'),
      { id: 'chap-2' as SectionId },
      {},
      undefined,
      'Techniques',
    );

    const result = await composer.compose({
      sections: [toc, ch1, prose, ch2],
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: { toc: {} },
    });

    // TOC is section 1.
    const tocMatch = result.html.match(
      /<section[^>]*id="sec-1"[^>]*data-kind="toc"[^>]*>([\s\S]*?)<\/section>/,
    );
    expect(tocMatch).not.toBeNull();
    const tocBody = tocMatch![1];
    expect(tocBody).toContain('<nav class="pengui-toc">');
    expect(tocBody).toContain('<ol>');
    // Chapter headers target sec-2 and sec-4 (toc at 1, prose at 3).
    expect(tocBody).toContain('href="#sec-2"');
    expect(tocBody).toContain('Foundations');
    expect(tocBody).toContain('href="#sec-4"');
    expect(tocBody).toContain('Techniques');
    // Prose section should NOT be in the TOC by default.
    expect(tocBody).not.toContain('href="#sec-3"');
  });

  it('respects documentMeta.toc.includeKinds for TOC entries', async () => {
    const toc = makeSection('toc', wrapMeta('toc', ''));
    const ch1 = makeSection(
      'chapter_header',
      wrapMeta('chapter_header', '<h1>A</h1>'),
      {},
      {},
      undefined,
      'Alpha',
    );
    const prose = makeSection(
      'prose',
      wrapMeta('prose', '<p>body</p>'),
      {},
      {},
      undefined,
      'Prose block',
    );

    const result = await composer.compose({
      sections: [toc, ch1, prose],
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: { toc: { includeKinds: ['chapter_header', 'prose'] } },
    });

    const tocMatch = result.html.match(
      /<section[^>]*id="sec-1"[^>]*data-kind="toc"[^>]*>([\s\S]*?)<\/section>/,
    );
    expect(tocMatch).not.toBeNull();
    const tocBody = tocMatch![1];
    expect(tocBody).toContain('Alpha');
    expect(tocBody).toContain('Prose block');
  });

  // ── Asset resolution ───────────────────────────────────────────────

  it('resolves asset://UUID refs inside a section fragment when assetService is given', async () => {
    const assetStore = new InMemoryAssetStore();
    const clock = new FixedClock('2026-01-15T12:00:00.000Z');
    const assetService = new AssetService(assetStore, clock, new Logger('t', 'error'));

    const asset = await assetService.upload({
      name: 'Hero',
      filename: 'hero.png',
      mimeType: 'image/png',
      scope: { type: 'global' },
      role: 'content',
      dataBase64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    });

    const imageHtml =
      '<!-- @section-meta {"title":"I","kind":"image","narrative":"n"} -->' +
      `<section class="pengui-section pengui-image">` +
      `<figure class="pengui-image"><img src="asset://${asset.id}" alt="hero"><figcaption>c</figcaption></figure>` +
      '</section>';

    const section = makeSection('image', imageHtml);

    const result = await composer.compose({
      sections: [section],
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: {},
      assetService,
    });

    expect(result.html).not.toContain('asset://');
    expect(result.html).toContain('data:image/png;base64,');
  });

  it('leaves asset:// refs untouched when resolveAssets = false', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000001';
    const imageHtml =
      '<!-- @section-meta {"title":"I","kind":"image","narrative":"n"} -->' +
      `<section class="pengui-section pengui-image">` +
      `<figure class="pengui-image"><img src="asset://${fakeId}"><figcaption>c</figcaption></figure>` +
      '</section>';
    const section = makeSection('image', imageHtml);

    const result = await composer.compose({
      sections: [section],
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: {},
      resolveAssets: false,
    });

    expect(result.html).toContain(`asset://${fakeId}`);
  });

  // ── Warnings ───────────────────────────────────────────────────────

  it('collects a warning when a fragment has no root <section>', async () => {
    const badFragment =
      '<!-- @section-meta {"title":"P","kind":"prose","narrative":"n"} --><p>orphan</p>';
    const section = makeSection('prose', badFragment);

    const result = await composer.compose({
      sections: [section],
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: {},
    });

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('fragment has no <section> root'))).toBe(true);
  });

  it('collects a warning for an unknown section kind and treats it as prose', async () => {
    const section = makeSection(
      'totally-fake-kind' as SectionKind,
      `<!-- @section-meta {"title":"Oops","kind":"totally-fake-kind","narrative":"n"} --><section class="pengui-section pengui-totally-fake-kind"><p>x</p></section>`,
    );

    const result = await composer.compose({
      sections: [section],
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: {},
    });

    expect(result.warnings.some((w) => w.includes('unknown kind'))).toBe(true);
    expect(result.html).toMatch(/data-kind="prose"/);
  });

  it('warns when chromeOverrides.runningTitle is not a string', async () => {
    const bogus: unknown = { foo: 'bar' };
    const section = makeSection(
      'chapter_header',
      wrapMeta('chapter_header', '<h1>h</h1>'),
      {},
      {},
      { runningTitle: bogus as string },
    );

    const result = await composer.compose({
      sections: [section],
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: {},
    });

    expect(
      result.warnings.some((w) =>
        w.includes('chromeOverrides.runningTitle must be a string'),
      ),
    ).toBe(true);
  });

  // ── Defensive defaults integration ────────────────────────────────

  it('includes the pengui-defensive-defaults style block when applyDefensive is true', async () => {
    const result = await composer.compose({
      sections: [makeSection('prose', wrapMeta('prose', '<p>x</p>'))],
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: {},
    });

    expect(result.html).toContain('id="pengui-defensive-defaults"');
  });

  it('skips defensive defaults when applyDefensive is false', async () => {
    const result = await composer.compose({
      sections: [makeSection('prose', wrapMeta('prose', '<p>x</p>'))],
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: {},
      applyDefensive: false,
    });

    expect(result.html).not.toContain('id="pengui-defensive-defaults"');
  });

  // ── Block styles ──────────────────────────────────────────────────

  it('concatenates per-recipe CSS from templates/document/<kind>.css into pengui-block-styles', async () => {
    const sections = [
      makeSection('prose', wrapMeta('prose', '<p>x</p>')),
      makeSection('figure', wrapMeta('figure', '<figure class="pengui-figure"><figcaption>c</figcaption></figure>')),
    ];

    const result = await composer.compose({
      sections,
      deck: makeDeck(),
      soul: makeSoul(),
      geometry: geometryFor(),
      documentMeta: {},
    });

    const blockMatch = result.html.match(
      /<style id="pengui-block-styles">([\s\S]*?)<\/style>/,
    );
    expect(blockMatch).not.toBeNull();
    const blockCss = blockMatch![1];
    expect(blockCss).toContain('.pengui-prose');
    expect(blockCss).toContain('.pengui-figure');
  });

  // ── v4.18 parity: bimodal node CSS reaches document mode ─────────
  //
  // The slides/sections audit caught that pengui-bg-* / pengui-layout-*
  // selectors only targeted .slide; .pengui-section carried the same
  // classes but had no matching CSS. v4.18 added .pengui-section
  // selectors into NODE_CSS. These tests verify the CSS is present in
  // the composer's node-styles block so cards / flows / decorations /
  // framed images render with the same affordances in A4 PDF as they do
  // on a slide canvas.

  it('node-styles block carries .pengui-section parity selectors (v4.18 fix)', async () => {
    const sections = [makeSection('prose', wrapMeta('prose', '<p>x</p>'))];
    const result = await composer.compose({
      sections, deck: makeDeck(), soul: makeSoul(),
      geometry: geometryFor(), documentMeta: {},
    });
    const nodeMatch = result.html.match(
      /<style id="pengui-node-styles">([\s\S]*?)<\/style>/,
    );
    expect(nodeMatch).not.toBeNull();
    const nodeCss = nodeMatch![1];
    // .pengui-section root rules
    expect(nodeCss).toContain('.pengui-section {');
    expect(nodeCss).toContain('.pengui-section.pengui-bg-canvas');
    expect(nodeCss).toContain('.pengui-section.pengui-bg-accent');
    expect(nodeCss).toContain('.pengui-section.pengui-section-centered');
    expect(nodeCss).toContain('.pengui-section:has(.pengui-decoration-bleed)');
    // Bimodal node classes from v4.13–v4.17 all live in NODE_CSS so
    // the composer picks them up automatically.
    expect(nodeCss).toContain('.pengui-card');
    expect(nodeCss).toContain('.pengui-flow');
    expect(nodeCss).toContain('.pengui-decoration');
    expect(nodeCss).toContain('.pengui-frame-browser');
  });

  it('composer renders a card-bearing section without losing the pengui-card class', async () => {
    const cardHtml =
      '<article class="pengui-card pengui-card-accent-info" data-ir-path="body,0">' +
      '<p class="pengui-card-eyebrow">EYEBROW</p>' +
      '<h4 class="pengui-heading pengui-heading-4">Title</h4>' +
      '</article>';
    const sections = [makeSection('prose', wrapMeta('prose', cardHtml))];
    const result = await composer.compose({
      sections, deck: makeDeck(), soul: makeSoul(),
      geometry: geometryFor(), documentMeta: {},
    });
    expect(result.html).toContain('class="pengui-card pengui-card-accent-info"');
    expect(result.html).toContain('class="pengui-card-eyebrow"');
  });

  it('composer renders a flow-bearing section with step pills and connectors', async () => {
    const flowHtml =
      '<ol class="pengui-flow pengui-flow-horizontal pengui-flow-connector-arrow" data-ir-path="body,0">' +
      '<li class="pengui-flow-step pengui-flow-step-accent-info" data-ir-flow-step="0">' +
      '<p class="pengui-flow-step-label">Plan</p></li>' +
      '<li class="pengui-flow-connector pengui-flow-connector-glyph-arrow" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24"></svg></li>' +
      '<li class="pengui-flow-step pengui-flow-step-accent-success" data-ir-flow-step="1">' +
      '<p class="pengui-flow-step-label">Build</p></li>' +
      '</ol>';
    const sections = [makeSection('prose', wrapMeta('prose', flowHtml))];
    const result = await composer.compose({
      sections, deck: makeDeck(), soul: makeSoul(),
      geometry: geometryFor(), documentMeta: {},
    });
    expect(result.html).toContain('pengui-flow-horizontal');
    expect(result.html).toContain('pengui-flow-step-accent-info');
    expect(result.html).toContain('pengui-flow-connector-glyph-arrow');
  });

  it('composer renders a decoration in a section (bleed anchor + foreground layer)', async () => {
    const decorationHtml =
      '<aside class="pengui-decoration pengui-decoration-foreground ' +
      'pengui-decoration-anchor-bleed-top-right pengui-decoration-bleed ' +
      'pengui-decoration-source-preset pengui-text-accent" ' +
      'style="width:480px;height:480px" aria-hidden="true">' +
      '<svg viewBox="0 0 480 480"></svg></aside>';
    const sections = [makeSection('prose', wrapMeta('prose', decorationHtml + '<p>body</p>'))];
    const result = await composer.compose({
      sections, deck: makeDeck(), soul: makeSoul(),
      geometry: geometryFor(), documentMeta: {},
    });
    expect(result.html).toContain('pengui-decoration-foreground');
    expect(result.html).toContain('pengui-decoration-bleed');
    expect(result.html).toContain('pengui-decoration-anchor-bleed-top-right');
  });

  it('composer renders a framed-browser image with all chrome parts present', async () => {
    const framedHtml =
      '<figure class="pengui-image pengui-image-contain pengui-image-framed pengui-image-frame-browser">' +
      '<div class="pengui-frame pengui-frame-browser" aria-hidden="true">' +
      '<div class="pengui-frame-titlebar">' +
      '<span class="pengui-frame-dot pengui-frame-dot-close"></span>' +
      '<span class="pengui-frame-dot pengui-frame-dot-min"></span>' +
      '<span class="pengui-frame-dot pengui-frame-dot-max"></span>' +
      '<div class="pengui-frame-urlbar"></div>' +
      '</div>' +
      '<div class="pengui-frame-content"><img src="data:image/png;base64,iVBORw0KGgo=" alt="" /></div>' +
      '</div></figure>';
    const sections = [makeSection('figure', wrapMeta('figure', framedHtml))];
    const result = await composer.compose({
      sections, deck: makeDeck(), soul: makeSoul(),
      geometry: geometryFor(), documentMeta: {},
    });
    expect(result.html).toContain('pengui-frame pengui-frame-browser');
    expect(result.html).toContain('pengui-frame-titlebar');
    expect(result.html).toContain('pengui-frame-urlbar');
    expect(result.html).toContain('pengui-frame-dot-close');
  });
});
