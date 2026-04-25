import { describe, it, expect, afterAll } from 'vitest';
import { createContainer } from '../../../../src/container.js';
import { loadConfig } from '../../../../src/config.js';
import { sampleSoulInput, makeValidSlideHtml } from '../../../helpers/fixtures.js';
import { DeckEmptyError, SlideNotFoundError, SlideRevisionConflictError } from '../../../../src/types/errors.js';

describe('EditorService', () => {
  const containers: ReturnType<typeof createContainer>[] = [];

  afterAll(async () => {
    await Promise.all(containers.map((container) => container.renderService.shutdown()));
  });

  it('normalizes selected slide HTML for text editing and returns editor state', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({ soulId: soul.id as string, title: 'Editor Deck' });

    const slide = await container.deckService.addSlide({
      deckId: deck.id as string,
      html: makeValidSlideHtml('Editable paragraph'),
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
    expect(state.selectedSlide.html).toContain('data-edit-id=');
    expect(state.selectedPreview.slideId).toBe(slide.id);
    expect(state.thumbnails).toHaveLength(1);
    expect(state.selectedSlide.validationPresentation.status).toBe('clean');
    expect(state.selectedPreview.health).toBe('clean');

    const stored = await container.deckService.getSlide(slide.id as string);
    expect(stored.html).toContain('data-edit-id=');
    expect(stored.lastValidation?.passed).toBe(true);
  }, 20000);

  it('applies a text edit and refreshes revision hash and preview state', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({ soulId: soul.id as string, title: 'Editor Deck' });

    const slide = await container.deckService.addSlide({
      deckId: deck.id as string,
      html: makeValidSlideHtml('Original copy'),
      metadata: {
        title: 'Editable Slide',
        type: 'content',
        narrative: 'Editable slide narrative',
      },
    });

    const initial = await container.editorService.getEditorState(deck.id as string, slide.id as string);
    const match = initial.selectedSlide.html.match(/data-edit-id="([^"]+)"/);
    expect(match).not.toBeNull();

    const updated = await container.editorService.applyTextEdit({
      deckId: deck.id as string,
      slideId: slide.id as string,
      editId: match?.[1] ?? '',
      text: 'Updated copy',
      expectedRevisionHash: initial.selectedSlide.revisionHash,
    });

    expect(updated.selectedSlide.html).toContain('Updated copy');
    expect(updated.selectedSlide.revisionHash).not.toBe(initial.selectedSlide.revisionHash);
    expect(updated.selectedPreview.imageBase64.length).toBeGreaterThan(100);
    expect(updated.selectedSlide.validationPresentation.status).toBe('clean');
  }, 12000);

  it('rejects stale revision hashes with a conflict error', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    containers.push(container);

    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({ soulId: soul.id as string, title: 'Conflict Deck' });

    const slide = await container.deckService.addSlide({
      deckId: deck.id as string,
      html: makeValidSlideHtml('Conflict copy'),
      metadata: {
        title: 'Editable Slide',
        type: 'content',
        narrative: 'Editable slide narrative',
      },
    });

    const state = await container.editorService.getEditorState(deck.id as string, slide.id as string);
    const match = state.selectedSlide.html.match(/data-edit-id="([^"]+)"/);
    expect(match).not.toBeNull();

    await container.deckService.updateSlide({
      deckId: deck.id as string,
      slideId: slide.id as string,
      html: state.selectedSlide.html.replace('Conflict copy', 'External update'),
    });

    await expect(container.editorService.applyTextEdit({
      deckId: deck.id as string,
      slideId: slide.id as string,
      editId: match?.[1] ?? '',
      text: 'My update',
      expectedRevisionHash: state.selectedSlide.revisionHash,
    })).rejects.toBeInstanceOf(SlideRevisionConflictError);
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
      html: makeValidSlideHtml('Deck one baseline'),
      metadata: {
        title: 'Deck One Slide',
        type: 'content',
        narrative: 'Deck one narrative',
      },
    });

    const slide = await container.deckService.addSlide({
      deckId: deckTwo.id as string,
      html: makeValidSlideHtml('Cross-deck copy'),
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

    // Regression for v4 → v4.1 confusion: an existing-but-empty deck used
    // to throw DECK_NOT_FOUND, indistinguishable from a truly missing one.
    // It now throws DECK_EMPTY with `suggestedTool: "add_slide"` so the
    // agent can recover in one turn.
    await expect(
      container.editorService.getEditorState(deck.id as string),
    ).rejects.toBeInstanceOf(DeckEmptyError);
  });
});
