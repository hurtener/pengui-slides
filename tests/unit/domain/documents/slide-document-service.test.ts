import { afterAll, describe, expect, it } from 'vitest';
import { createContainer } from '../../../../src/container.js';
import { loadConfig } from '../../../../src/config.js';
import { makeValidSlideHtml, sampleSoulInput } from '../../../helpers/fixtures.js';

describe('SlideDocumentService', () => {
  const containers: ReturnType<typeof createContainer>[] = [];

  afterAll(async () => {
    await Promise.all(containers.map((container) => container.renderService.shutdown()));
  });

  it('compiles a supported slide into a canonical document', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const result = await container.slideDocumentService.compileSlideHtml(
      makeValidSlideHtml('Canonical text'),
      'rev-1',
    );

    expect(result.document).not.toBeNull();
    expect(result.issues).toHaveLength(0);
    expect(result.document?.elements.some((element) => element.kind === 'text')).toBe(true);
  }, 20000);

  it('folds simple textual pseudo-element content into the exported document', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    .slide { width: 1920px; height: 1080px; position: relative; background: #fff; }
    .chip::before { content: "• "; }
  </style>
</head>
<body>
  <div class="slide">
    <div class="chip">Blocked</div>
  </div>
</body>
</html>`;

    const result = await container.slideDocumentService.compileSlideHtml(html, 'rev-2');

    expect(result.document).not.toBeNull();
    expect(result.issues.some((issue) => issue.code === 'unsupported-pseudo-before')).toBe(false);
    const textElement = result.document?.elements.find((element) => element.kind === 'text');
    expect(textElement && 'text' in textElement ? textElement.text : '').toContain('• Blocked');
  }, 10000);

  it('surfaces document-backed editor state after lazy compilation', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({ soulId: soul.id as string, title: 'Doc Deck' });

    const slide = await container.deckService.addSlide({
      deckId: deck.id as string,
      html: makeValidSlideHtml('Editor document'),
      metadata: {
        title: 'Doc Slide',
        type: 'content',
        narrative: 'Document-backed slide',
      },
    });

    const state = await container.editorService.getEditorState(deck.id as string, slide.id as string);

    expect(state.selectedSlide.sourceKind).toBe('document_v1');
    expect(state.selectedSlide.document).not.toBeNull();
    expect(state.selectedSlide.editableExportReady).toBe(true);
  }, 12000);

  it('marks flex-stretched badges so export can preserve full-width backgrounds', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    .slide { width: 1920px; height: 1080px; background: #111; padding: 48px; }
    .card { width: 592px; padding: 24px; display: flex; flex-direction: column; gap: 8px; background: #222; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; background: #f5f5f5; color: #a50034; font-size: 12px; }
  </style>
</head>
<body>
  <div class="slide">
    <div class="card">
      <span class="badge" data-edit-id="text-1">AGENTS</span>
    </div>
  </div>
</body>
</html>`;

    const result = await container.slideDocumentService.compileSlideHtml(html, 'rev-3');

    expect(result.document).not.toBeNull();
    expect(result.issues).toEqual([]);
    const badge = result.document?.elements.find((element) => element.kind === 'text');
    expect(badge?.kind).toBe('text');
    expect(badge?.style.stretchX).toBe(true);
  }, 10000);
});
