/**
 * v4 integration — slug derivation end-to-end through the container +
 * list_decks + get_session session view.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createContainer } from '../../../src/container.js';
import { loadConfig } from '../../../src/config.js';
import { sampleSoulInput } from '../../helpers/fixtures.js';

describe('v4 slugs + listDecks + session', () => {
  let container: ReturnType<typeof createContainer>;

  beforeEach(() => {
    container = createContainer(loadConfig({ logLevel: 'error' }));
  });

  it('createDeck stores a slug derived from the title', async () => {
    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({
      soulId: soul.id as string,
      title: 'Brand Handbook 2026',
    });
    expect(deck.slug).toBe('brand-handbook-2026');
  });

  it('createDeck with a colliding title appends a suffix', async () => {
    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const a = await container.deckService.createDeck({
      soulId: soul.id as string,
      title: 'My Deck',
    });
    const b = await container.deckService.createDeck({
      soulId: soul.id as string,
      title: 'My Deck',
    });
    expect(a.slug).toBe('my-deck');
    expect(b.slug).toBe('my-deck-2');
  });

  it('soul register derives a slug from the name', async () => {
    const soul = await container.soulService.register({
      ...sampleSoulInput,
      name: 'Cozy Premium',
    });
    expect(soul.slug).toBe('cozy-premium');
  });

  it('resolveRef accepts both UUID and slug for decks', async () => {
    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({
      soulId: soul.id as string,
      title: 'Quarterly Report',
    });

    const byUuid = await container.deckService.getDeckSummary(deck.id as string);
    const bySlug = await container.deckService.getDeckSummary(deck.slug as string);
    expect(byUuid.id).toBe(bySlug.id);
    expect(bySlug.slug).toBe('quarterly-report');
  });

  it('resolveRef accepts both UUID and slug for souls (via createDeck)', async () => {
    const soul = await container.soulService.register({
      ...sampleSoulInput,
      name: 'Pastel Study',
    });
    await container.soulService.approve(soul.id);
    // Create the deck by passing the soul's slug instead of its UUID.
    const deck = await container.deckService.createDeck({
      soulId: soul.slug as string,
      title: 'Study Pack',
    });
    expect(deck.soulId).toBe(soul.id);
  });

  it('getDeckSummary exposes slug + soulSlug', async () => {
    const soul = await container.soulService.register({
      ...sampleSoulInput,
      name: 'Warm Classic',
    });
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({
      soulId: soul.id as string,
      title: 'Annual Notes',
    });
    const summary = await container.deckService.getDeckSummary(deck.id as string);
    expect(summary.slug).toBe('annual-notes');
    expect(summary.soulSlug).toBe('warm-classic');
  });

  it('listDecks returns decks newest-first with slugs', async () => {
    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    await container.deckService.createDeck({ soulId: soul.id as string, title: 'First' });
    await new Promise((r) => setTimeout(r, 5));
    await container.deckService.createDeck({ soulId: soul.id as string, title: 'Second' });

    const decks = await container.deckService.listDecks();
    expect(decks.length).toBe(2);
    expect(decks[0].title).toBe('Second');
    expect(decks[1].title).toBe('First');
    expect(decks.map((d) => d.slug)).toEqual(['second', 'first']);
  });

  it('backfills slugs for pre-v4 deck records (missing slug field)', async () => {
    // Simulate a legacy deck on disk by writing directly to the store.
    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const legacyDeck = {
      id: 'legacy-deck-id' as never,
      soulId: soul.id,
      title: 'Legacy Thing',
      author: '',
      slideIds: [],
      sectionIds: [],
      format: 'slides_16_9' as const,
      authoringModel: 'slides' as const,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      // NOTE: no `slug` field
    };
    await container.deckStore.save(legacyDeck as never);

    // listDecks should backfill.
    const decks = await container.deckService.listDecks();
    const legacy = decks.find((d) => d.title === 'Legacy Thing');
    expect(legacy?.slug).toBe('legacy-thing');

    // Slug is persisted back to the store.
    const reread = await container.deckStore.get('legacy-deck-id' as never);
    expect(reread?.slug).toBe('legacy-thing');
  });

  it('get_session returns an empty view when nothing is set', async () => {
    const session = await container.editorService.getSession();
    expect(session.activeDeck).toBeUndefined();
    expect(session.activeSoul).toBeUndefined();
    expect(session.openPanels).toEqual([]);
  });

  it('setActiveWorkspace populates and get_session reflects current titles', async () => {
    const soul = await container.soulService.register({
      ...sampleSoulInput,
      name: 'Session Soul',
    });
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({
      soulId: soul.id as string,
      title: 'Session Deck',
    });

    await container.editorService.setActiveWorkspace({
      deckRef: deck.slug as string,
      soulRef: soul.slug as string,
      workflow: 'create-presentation',
      openPanels: ['Editor'],
    });

    const session = await container.editorService.getSession();
    expect(session.activeDeck?.slug).toBe('session-deck');
    expect(session.activeSoul?.slug).toBe('session-soul');
    expect(session.activeWorkflow).toBe('create-presentation');
    expect(session.openPanels).toEqual(['Editor']);
  });
});
