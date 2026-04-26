import { describe, it, expect } from 'vitest';
import { createContainer } from '../../../../src/container.js';
import { loadConfig } from '../../../../src/config.js';
import { validateSlidesForExport } from '../../../../src/tools/export/export-validation.js';
import { sampleSoulInput, makeSlideIR } from '../../../helpers/fixtures.js';

describe('validateSlidesForExport', () => {
  it('passes full validation for exportable slides and stores the result', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({ soulId: soul.id as string, title: 'Valid Deck' });

    const slide = await container.deckService.addSlide({
      deckId: deck.id as string,
      ir: makeSlideIR('Exportable'),
      metadata: { title: 'Exportable', type: 'content', narrative: 'Valid slide' },
    });

    await expect(
      validateSlidesForExport(container, deck.id as string, soul.id as string, [slide]),
    ).resolves.toBeUndefined();

    const stored = await container.deckService.getSlide(slide.id as string);
    expect(stored.lastValidation?.stage2Skipped).toBe(false);
    expect(stored.lastValidation?.passed).toBe(true);
  }, 20000);

  it('blocks export when any slide fails full validation', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({ soulId: soul.id as string, title: 'Broken Deck' });

    const slide = await container.deckService.addSlide({
      deckId: deck.id as string,
      ir: makeSlideIR('Hi'),
      metadata: { title: 'Will Be Broken', type: 'content', narrative: 'Will fail after store mutation' },
    });

    // The IR pipeline always emits valid HTML, so to exercise the
    // export-blocking path we replace the stored html with deliberately
    // broken markup at the store level.
    const stored = (await container.deckService.getSlide(slide.id as string));
    const broken = '<!DOCTYPE html><html><body><div>missing slide container</div></body></html>';
    await (container as unknown as { slideStore: { save: (s: unknown) => Promise<void> } }).slideStore.save({
      ...stored,
      html: broken,
    });

    const updated = await container.deckService.getSlide(slide.id as string);

    await expect(
      validateSlidesForExport(container, deck.id as string, soul.id as string, [updated]),
    ).rejects.toThrow('failed full validation');

    const after = await container.deckService.getSlide(slide.id as string);
    expect(after.lastValidation?.passed).toBe(false);
  }, 12000);
});
