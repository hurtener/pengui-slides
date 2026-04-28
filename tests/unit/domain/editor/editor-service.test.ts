import { describe, it, expect, afterAll } from 'vitest';
import { createContainer } from '../../../../src/container.js';
import { loadConfig } from '../../../../src/config.js';
import { sampleSoulInput, makeSlideIR } from '../../../helpers/fixtures.js';
import { DeckEmptyError, SlideNotFoundError } from '../../../../src/types/errors.js';

describe('EditorService', () => {
  const containers: ReturnType<typeof createContainer>[] = [];

  afterAll(async () => {
    await Promise.all(containers.map((container) => container.renderService.shutdown()));
  });

  it('returns editor state for an IR-authored slide', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({ soulId: soul.id as string, title: 'Editor Deck' });

    const slide = await container.deckService.addSlide({
      deckId: deck.id as string,
      ir: makeSlideIR('Editable paragraph'),
      metadata: {
        title: 'Editable Slide',
        type: 'content',
        narrative: 'Editable slide narrative',
        keyPoints: ['Point one'],
        tags: ['alpha'],
      },
    });

    const state = await container.editorService.getEditorState(deck.id as string, slide.id as string);

    expect(state.deck.id).toBe(deck.id);
    expect(state.selectedSlide.slideId).toBe(slide.id);
    expect(state.selectedPreview.slideId).toBe(slide.id);
    expect(state.thumbnails).toHaveLength(1);

    const stored = await container.deckService.getSlide(slide.id as string);
    expect(stored.ir).toBeDefined();
    // sourceKind may be authored_ir (no editor pass yet) or document_v1
    // (editor lazily compiled into a SlideDocument for the App preview).
    expect(['authored_ir', 'document_v1']).toContain(stored.sourceKind);
  }, 20000);

  it('applyTextEdit is disabled in v4.5 (IR-first; HTML mutation lands in v4.6)', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({ soulId: soul.id as string, title: 'Editor Deck' });

    const slide = await container.deckService.addSlide({
      deckId: deck.id as string,
      ir: makeSlideIR('Original copy'),
      metadata: {
        title: 'Editable Slide',
        type: 'content',
        narrative: 'Editable slide narrative',
      },
    });

    await expect(
      container.editorService.applyTextEdit({
        deckId: deck.id as string,
        slideId: slide.id as string,
        editId: 'any',
        text: 'Updated copy',
        expectedRevisionHash: slide.metadata.revisionHash,
      }),
    ).rejects.toThrow(/EDITOR_HTML_MUTATION_DISABLED/);
  }, 12000);

  it('rejects slide selections that do not belong to the requested deck', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);

    const deckOne = await container.deckService.createDeck({
      soulId: soul.id as string,
      title: 'Deck One',
    });
    const deckTwo = await container.deckService.createDeck({
      soulId: soul.id as string,
      title: 'Deck Two',
    });

    await container.deckService.addSlide({
      deckId: deckOne.id as string,
      ir: makeSlideIR('Deck one baseline'),
      metadata: {
        title: 'Deck One Slide',
        type: 'content',
        narrative: 'Deck one narrative',
      },
    });

    const slide = await container.deckService.addSlide({
      deckId: deckTwo.id as string,
      ir: makeSlideIR('Cross-deck copy'),
      metadata: {
        title: 'Cross Deck Slide',
        type: 'content',
        narrative: 'Cross deck narrative',
      },
    });

    await expect(
      container.editorService.getEditorState(deckOne.id as string, slide.id as string),
    ).rejects.toBeInstanceOf(SlideNotFoundError);
  });

  it('throws DECK_EMPTY (not DECK_NOT_FOUND) when opening an empty slides deck', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({
      soulId: soul.id as string,
      title: 'Empty Deck',
    });

    await expect(
      container.editorService.getEditorState(deck.id as string),
    ).rejects.toBeInstanceOf(DeckEmptyError);
  });

  // ── v4.8.5 pin migration ────────────────────────────────────────

  it('refreshes pre-v4.8.5 slide html in-memory when stored html lacks data-ir-path', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({
      soulId: soul.id as string,
      title: 'Pre-v4.8.5 Deck',
    });

    const slide = await container.deckService.addSlide({
      deckId: deck.id as string,
      ir: makeSlideIR('Hi from before'),
      metadata: {
        title: 'Stale Slide',
        type: 'content',
        narrative: 'Authored when data-ir-path did not exist',
      },
    });

    // Simulate a pre-v4.8.5 stored html: strip data-ir-path attributes
    // from the persisted record so the editor's lazy-refresh path fires.
    const stripped = slide.html.replace(/\s*data-ir-path="[^"]*"/g, '');
    expect(stripped).not.toContain('data-ir-path=');
    await container.deckService.updateSlide({
      deckId: deck.id as string,
      slideId: slide.id as string,
      // We can't set html directly through updateSlide; manipulate via the
      // store to install the stale snapshot, then read back through the
      // editor service to confirm the in-memory refresh.
    });
    const stored = await container.deckService.getSlide(slide.id as string);
    // Bypass the IR-recompile branch by writing directly to the store —
    // we want to assert that getEditorState heals the cached html on read.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (container as any).slideStore.save({ ...stored, html: stripped });

    const state = await container.editorService.getEditorState(
      deck.id as string,
      slide.id as string,
    );

    expect(state.selectedSlide.html).toContain('data-ir-path="body,0"');

    // The on-disk record should still hold the stale html — the refresh
    // is in-memory only so we don't pollute revision history.
    const reread = await container.deckService.getSlide(slide.id as string);
    expect(reread.html).not.toContain('data-ir-path=');
  }, 20000);
});
