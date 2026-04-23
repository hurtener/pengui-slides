import { describe, it, expect } from 'vitest';
import { createContainer } from '../../src/container.js';
import { loadConfig } from '../../src/config.js';
import { sampleSoulInput } from '../helpers/fixtures.js';

describe('createContainer', () => {
  it('returns all expected services', () => {
    const config = loadConfig({ logLevel: 'error' });
    const container = createContainer(config);

    expect(container.config).toBeDefined();
    expect(container.logger).toBeDefined();
    expect(container.clock).toBeDefined();
    expect(container.soulStore).toBeDefined();
    expect(container.deckStore).toBeDefined();
    expect(container.slideStore).toBeDefined();
    expect(container.soulService).toBeDefined();
    expect(container.deckService).toBeDefined();
    expect(container.validationService).toBeDefined();
    expect(container.metadataParser).toBeDefined();
    expect(container.metadataEmbedder).toBeDefined();
    expect(container.metadataExporter).toBeDefined();
    expect(container.renderService).toBeDefined();
    expect(container.assetStore).toBeDefined();
    expect(container.assetService).toBeDefined();
  });

  it('services are properly wired (soul register and approve)', async () => {
    const config = loadConfig({ logLevel: 'error' });
    const container = createContainer(config);

    // Register a soul
    const soul = await container.soulService.register(sampleSoulInput);
    expect(soul.status).toBe('draft');

    // Approve it
    const { soul: approved, recipes } = await container.soulService.approve(soul.id);
    expect(approved.status).toBe('approved');
    // 6 slide + 11 print = 17 total (SPEC §5.3)
    expect(recipes.length).toBe(17);

    // Retrieve it
    const { soul: retrieved } = await container.soulService.get(soul.id);
    expect(retrieved.status).toBe('approved');
  });

  it('deck service can create decks using registered souls', async () => {
    const config = loadConfig({ logLevel: 'error' });
    const container = createContainer(config);

    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);

    const deck = await container.deckService.createDeck({
      soulId: soul.id as string,
      title: 'Integration Test Deck',
    });

    expect(deck.soulId).toBe(soul.id);
    expect(deck.title).toBe('Integration Test Deck');
  });
});
