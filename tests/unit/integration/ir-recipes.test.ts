/**
 * v4.6: save_as_template captures slide IR; apply_recipe instantiates
 * a recipe back into a new slide. Closes the loop so recipes are
 * usable templates, not just visual references.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createContainer } from '../../../src/container.js';
import { loadConfig } from '../../../src/config.js';
import { sampleSoulInput, makeSlideIR } from '../../helpers/fixtures.js';
import { rt } from '../../../src/domain/ir/rich-text.js';
import type { SlideIR } from '../../../src/domain/ir/index.js';

describe('IR-native recipes (v4.6)', () => {
  let container: ReturnType<typeof createContainer>;
  let soulId: string;
  let deckId: string;

  beforeEach(async () => {
    container = createContainer(loadConfig({ logLevel: 'error' }));
    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    soulId = soul.id as string;
    const deck = await container.deckService.createDeck({ soulId, title: 'D' });
    deckId = deck.id as string;
  });

  it('save_as_template captures slide.ir on user-saved recipes', async () => {
    const ir: SlideIR = {
      body: [
        { type: 'hero', title: rt('Recipe Hero'), subtitle: rt('Recipe subtitle') },
        { type: 'prose', body: rt('Some body content for the recipe.') },
      ],
    };
    const slide = await container.deckService.addSlide({
      deckId,
      ir,
      metadata: { title: 'Source slide', type: 'content', narrative: 'n' },
    });
    // Recipe save requires lastValidation.passed === true.
    await container.deckService.updateSlide({
      deckId,
      slideId: slide.id as string,
      lastValidation: {
        passed: true,
        styleScore: { overall: 1, byCategory: {} as never },
        issues: [],
        errorCount: 0,
        warningCount: 0,
        depth: 'lint',
        stage2Skipped: true,
        ranAt: '2024-01-01T00:00:00Z',
      } as never,
    });

    const recipe = await container.soulService.saveAsTemplate(
      soulId as never,
      slide.id,
      'My Recipe',
      ['custom'],
      'A user-saved recipe',
    );
    expect(recipe.ir).toBeDefined();
    expect(recipe.ir).toEqual(ir);
    expect(recipe.savedFromSlideId).toBe(slide.id);
  });

  it('saveAsTemplate omits ir when slide is not authored_ir', async () => {
    // Manually craft a legacy_html-flavored slide via the slide store
    // (an artifact of pre-v4.5 data; covers the back-compat path).
    const slide = await container.deckService.addSlide({
      deckId,
      ir: makeSlideIR('Legacy'),
      metadata: { title: 'L', type: 'content', narrative: 'n' },
    });
    const downgrade = await container.deckService.getSlide(slide.id as string);
    await (container as unknown as { slideStore: { save: (s: unknown) => Promise<void> } }).slideStore.save({
      ...downgrade,
      sourceKind: 'legacy_html',
      lastValidation: {
        passed: true,
        styleScore: { overall: 1, byCategory: {} as never },
        issues: [],
        errorCount: 0,
        warningCount: 0,
        depth: 'lint',
        stage2Skipped: true,
        ranAt: '2024-01-01T00:00:00Z',
      },
    });
    const recipe = await container.soulService.saveAsTemplate(
      soulId as never,
      slide.id,
      'Legacy Recipe',
      [],
      '',
    );
    expect(recipe.ir).toBeUndefined();
    expect(recipe.html).toBeDefined();
  });

  it('apply_recipe instantiates a recipe IR as a new slide', async () => {
    // 1. Author + save a recipe with IR
    const irForRecipe: SlideIR = {
      body: [{ type: 'hero', title: rt('Hello recipe') }],
    };
    const sourceSlide = await container.deckService.addSlide({
      deckId,
      ir: irForRecipe,
      metadata: { title: 'Source', type: 'content', narrative: 'n' },
    });
    await container.deckService.updateSlide({
      deckId,
      slideId: sourceSlide.id as string,
      lastValidation: {
        passed: true,
        styleScore: { overall: 1, byCategory: {} as never },
        issues: [],
        errorCount: 0,
        warningCount: 0,
        depth: 'lint',
        stage2Skipped: true,
        ranAt: '2024-01-01T00:00:00Z',
      } as never,
    });
    const recipe = await container.soulService.saveAsTemplate(
      soulId as never,
      sourceSlide.id,
      'Hero Recipe',
      [],
      'A hero',
    );

    // 2. Create a fresh deck and instantiate the recipe.
    const deck2 = await container.deckService.createDeck({ soulId, title: 'D2' });
    const beforeCount = (await container.deckService.getDeckSummary(deck2.id as string)).slideCount;
    expect(beforeCount).toBe(0);

    // Apply via service-layer call (mirrors what the apply_recipe tool does).
    const { recipes } = await container.soulService.get(soulId as never, true);
    const matched = recipes!.find((r) => r.id === recipe.id);
    expect(matched?.ir).toBeDefined();

    const instantiated = await container.deckService.addSlide({
      deckId: deck2.id as string,
      ir: matched!.ir as SlideIR,
      metadata: {
        title: matched!.name,
        type: matched!.type,
        narrative: matched!.description,
      },
    });
    expect(instantiated.html).toContain('Hello recipe');
    expect(instantiated.sourceKind).toBe('authored_ir');
    expect(instantiated.ir).toEqual(irForRecipe);

    const afterCount = (await container.deckService.getDeckSummary(deck2.id as string)).slideCount;
    expect(afterCount).toBe(1);
  });
});
