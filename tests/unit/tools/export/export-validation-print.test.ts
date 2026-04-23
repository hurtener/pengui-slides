/**
 * Regression test: validateSlidesForExport must thread the deck's format
 * geometry into the Stage 1 / Stage 2 validators. Without this, print
 * decks get validated against 1920×1080 defaults and A4-sized content
 * fails the safe-area / overflow checks.
 */

import { describe, it, expect } from 'vitest';
import { createContainer } from '../../../../src/container.js';
import { loadConfig } from '../../../../src/config.js';
import { validateSlidesForExport } from '../../../../src/tools/export/export-validation.js';
import { sampleSoulInput, makeValidPrintA4Html } from '../../../helpers/fixtures.js';

describe('validateSlidesForExport — format threading', () => {
  it('validates a print_a4_portrait deck against A4 geometry, not 1920×1080', async () => {
    const container = createContainer(loadConfig({ logLevel: 'error' }));
    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);

    // Explicit `authoringModel: 'slides'` opts into the legacy per-slide
    // print pipeline (pre-v3). The v3 default for print formats is
    // 'document', which routes through Section-based authoring.
    const deck = await container.deckService.createDeck({
      soulId: soul.id as string,
      title: 'Print Deck',
      format: 'print_a4_portrait',
      authoringModel: 'slides',
    });

    const slide = await container.deckService.addSlide({
      deckId: deck.id as string,
      html: makeValidPrintA4Html('Valid A4 content'),
      metadata: { title: 'Print Page', type: 'content', narrative: 'A4 page' },
    });

    // If the validator ran against slides_16_9 defaults, the .slide
    // element declaring width:1240px height:1754px would fail safe-area
    // checks and any content near A4 bounds would be flagged as overflow
    // against a 1920×1080 canvas. Passing means the deck format is
    // correctly threaded into the ValidationContext.
    await expect(
      validateSlidesForExport(container, deck.id as string, soul.id as string, [slide]),
    ).resolves.toBeUndefined();

    const stored = await container.deckService.getSlide(slide.id as string);
    expect(stored.lastValidation?.passed).toBe(true);
    expect(stored.lastValidation?.stage2Skipped).toBe(false);
  }, 20000);
});
