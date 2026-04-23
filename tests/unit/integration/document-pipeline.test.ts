/**
 * Integration test: v3 continuous-document pipeline.
 *
 * Exercises the full authoring flow: create print deck → add sections →
 * compose → export PDF. Stage 2 Playwright validation is skipped (would
 * launch a browser per test; too expensive for unit suite) — that's
 * covered by the live coffee-demo/print-demo scripts at deploy time.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createContainer } from '../../../src/container.js';
import { loadConfig } from '../../../src/config.js';
import { sampleSoulInput } from '../../helpers/fixtures.js';
import { DocumentComposer } from '../../../src/domain/rendering/document-composer.js';
import { Logger } from '../../../src/infrastructure/logger.js';
import { FORMAT_REGISTRY } from '../../../src/domain/formats/format-registry.js';
import { soulId as toSoulId } from '../../../src/types/common.js';

describe('v3 continuous-document pipeline', () => {
  const figureHtml = `<!-- @section-meta {"title":"Fig 1","kind":"figure","narrative":"A placeholder figure."} -->
<section class="pengui-section pengui-figure">
  <figure class="pengui-figure">
    <svg viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="600" height="400" fill="var(--color-surface)" />
    </svg>
    <figcaption>Figure 1. Short placeholder caption.</figcaption>
  </figure>
</section>`;

  const proseHtml = `<!-- @section-meta {"title":"Intro","kind":"prose","narrative":"A welcoming introduction."} -->
<section class="pengui-section pengui-prose">
  <h2>Introduction</h2>
  <p>This is the first paragraph of the document.</p>
  <p>And a second one explaining the structure.</p>
</section>`;

  const coverHtml = `<!-- @section-meta {"title":"Cover","kind":"cover","narrative":"Document cover."} -->
<section class="pengui-section pengui-cover">
  <h1>A Short Handbook</h1>
  <p>Subtitle goes here</p>
</section>`;

  let container: ReturnType<typeof createContainer>;
  let soulIdStr: string;
  let deckIdStr: string;

  beforeEach(async () => {
    container = createContainer(loadConfig({ logLevel: 'error' }));

    const soul = await container.soulService.register(sampleSoulInput);
    const approved = await container.soulService.approve(soul.id);
    soulIdStr = approved.soul.id as string;

    const deck = await container.deckService.createDeck({
      soulId: soulIdStr,
      title: 'Test Handbook',
      format: 'print_a4_portrait',
      // authoring_model defaults to 'document' for print formats
    });
    deckIdStr = deck.id as string;
  });

  it('creates a print deck with authoringModel = "document" by default', async () => {
    const summary = await container.deckService.getDeckSummary(deckIdStr);
    expect(summary.authoringModel).toBe('document');
    expect(summary.format).toBe('print_a4_portrait');
    expect(summary.sectionCount).toBe(0);
    expect(summary.slideCount).toBe(0);
  });

  it('rejects add_slide on a document-mode deck with WRONG_AUTHORING_MODEL', async () => {
    await expect(
      container.deckService.addSlide({
        deckId: deckIdStr,
        html: '<div class="slide"></div>',
        metadata: { title: 't', type: 'content', narrative: '' },
      }),
    ).rejects.toMatchObject({ code: 'WRONG_AUTHORING_MODEL' });
  });

  it('appends sections via DocumentService.addSection', async () => {
    const cover = await container.documentService.addSection({
      deckId: deckIdStr,
      kind: 'cover',
      html: coverHtml,
      metadata: { title: 'Cover', narrative: '' },
    });
    expect(cover.kind).toBe('cover');
    expect(cover.position).toBe(0);

    const prose = await container.documentService.addSection({
      deckId: deckIdStr,
      kind: 'prose',
      html: proseHtml,
      metadata: { title: 'Intro', narrative: '' },
    });
    expect(prose.position).toBe(1);

    const summary = await container.deckService.getDeckSummary(deckIdStr);
    expect(summary.sectionCount).toBe(2);
    expect(summary.sections.map((s) => s.kind)).toEqual(['cover', 'prose']);
  });

  it('composes a valid HTML document with sections, soul tokens, and chrome', async () => {
    await container.documentService.addSection({
      deckId: deckIdStr,
      kind: 'cover',
      html: coverHtml,
      metadata: { title: 'Cover', narrative: '' },
    });
    await container.documentService.addSection({
      deckId: deckIdStr,
      kind: 'prose',
      html: proseHtml,
      metadata: { title: 'Intro', narrative: '' },
    });
    await container.documentService.addSection({
      deckId: deckIdStr,
      kind: 'figure',
      html: figureHtml,
      metadata: { title: 'Fig 1', narrative: '' },
      breakHints: { keepTogether: true },
    });

    const deck = await container.deckStore.get(
      (await container.deckService.getDeckSummary(deckIdStr)).id,
    );
    expect(deck).toBeDefined();
    const sections = await container.sectionStore.getByDeck(deck!.id);
    sections.sort((a, b) => a.position - b.position);

    const soul = await container.soulStore.get(toSoulId(soulIdStr));
    expect(soul).toBeDefined();

    const composer = new DocumentComposer(new Logger('test', 'error'));
    const composed = await composer.compose({
      sections,
      deck: deck!,
      soul: soul!,
      geometry: FORMAT_REGISTRY.print_a4_portrait.geometry,
      documentMeta: deck!.documentMeta ?? {},
    });

    expect(composed.html).toContain('<!DOCTYPE html>');
    expect(composed.html).toContain('data-pengui-medium="print"');
    expect(composed.html).toContain('data-pengui-model="document"');
    expect(composed.html).toContain('pengui-soul-tokens');
    expect(composed.html).toContain('pengui-defensive-defaults');

    // Cover should be full-page + chrome off.
    const cover = composed.html.match(/<section[^>]*id="sec-1"[^>]*>/)?.[0] ?? '';
    expect(cover).toContain('data-full-page="true"');
    expect(cover).toContain('data-chrome="off"');

    // Prose and figure in the body.
    expect(composed.html).toContain('Introduction');
    expect(composed.html).toContain('Figure 1');

    // Section dom ids surface back in the result.
    expect(Object.values(composed.sectionDomIds)).toContain('sec-1');
    expect(Object.values(composed.sectionDomIds)).toContain('sec-3');
  });

  it('updates documentMeta with chrome + toc config', async () => {
    await container.documentService.updateDocumentMeta(deckIdStr, {
      chrome: { runningTitle: 'Handbook Running Title', pageNumber: true, footerAlign: 'right' },
      toc: { includeKinds: ['chapter_header'] },
    });
    const deck = await container.deckStore.get(
      (await container.deckService.getDeckSummary(deckIdStr)).id,
    );
    expect(deck?.documentMeta?.chrome?.runningTitle).toBe('Handbook Running Title');
    expect(deck?.documentMeta?.toc?.includeKinds).toContain('chapter_header');
  });

  it('deep-merges chrome and toc sub-fields on updateDocumentMeta', async () => {
    // First write: seed chrome + toc.
    await container.documentService.updateDocumentMeta(deckIdStr, {
      chrome: { runningTitle: 'Original Title', pageNumber: true, footerAlign: 'right' },
      toc: { maxDepth: 3, includeKinds: ['chapter_header'] },
    });

    // Second write: touch ONLY one sub-field of each. Sibling sub-fields
    // must survive — this is the contract the update_document_meta tool
    // advertises and the fix for the pre-Wave-3 replace-behavior.
    await container.documentService.updateDocumentMeta(deckIdStr, {
      chrome: { pageNumber: false },
      toc: { maxDepth: 2 },
    });

    const deck = await container.deckStore.get(
      (await container.deckService.getDeckSummary(deckIdStr)).id,
    );
    expect(deck?.documentMeta?.chrome?.runningTitle).toBe('Original Title');
    expect(deck?.documentMeta?.chrome?.pageNumber).toBe(false);
    expect(deck?.documentMeta?.chrome?.footerAlign).toBe('right');
    expect(deck?.documentMeta?.toc?.maxDepth).toBe(2);
    expect(deck?.documentMeta?.toc?.includeKinds).toEqual(['chapter_header']);
  });
});
