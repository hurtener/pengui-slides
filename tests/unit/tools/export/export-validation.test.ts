import { describe, it, expect } from 'vitest';
import { createContainer } from '../../../../src/container.js';
import { loadConfig } from '../../../../src/config.js';
import { validateSlidesForExport } from '../../../../src/tools/export/export-validation.js';
import { sampleSoulInput, makeValidSlideHtml } from '../../../helpers/fixtures.js';

describe('validateSlidesForExport', () => {
  it('passes full validation for exportable slides and stores the result', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({ soulId: soul.id as string, title: 'Valid Deck' });

    const slide = await container.deckService.addSlide({
      deckId: deck.id as string,
      html: makeValidSlideHtml('Exportable'),
      metadata: { title: 'Exportable', type: 'content', narrative: 'Valid slide' },
    });

    await expect(
      validateSlidesForExport(container, deck.id as string, soul.id as string, [slide]),
    ).resolves.toBeUndefined();

    const stored = await container.deckService.getSlide(slide.id as string);
    expect(stored.lastValidation?.stage2Skipped).toBe(false);
    expect(stored.lastValidation?.passed).toBe(true);
  });

  it('blocks export when any slide fails full validation', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({ soulId: soul.id as string, title: 'Invalid Deck' });

    const invalidHtml = `<!DOCTYPE html>
<html>
<head>
  <style>
    .slide {
      width: 1920px;
      height: 1080px;
      padding: var(--space-safe-area);
    }
  </style>
</head>
<body>
  <div class="slide">Missing metadata comment</div>
</body>
</html>`;

    const slide = await container.deckService.addSlide({
      deckId: deck.id as string,
      html: invalidHtml,
      metadata: { title: 'Invalid', type: 'content', narrative: 'Should fail' },
    });

    await expect(
      validateSlidesForExport(container, deck.id as string, soul.id as string, [slide]),
    ).rejects.toThrow('failed full validation');

    const stored = await container.deckService.getSlide(slide.id as string);
    expect(stored.lastValidation?.passed).toBe(false);
  });
});
