import { describe, it, expect } from 'vitest';
import { createContainer } from '../../src/container.js';
import { loadConfig } from '../../src/config.js';
import { HtmlExporter } from '../../src/domain/rendering/html-exporter.js';
import { sampleSoulInput, makeSlideIR, makeValidSlideHtml } from '../helpers/fixtures.js';

describe('End-to-end flow (no MCP)', () => {
  it('register soul -> approve -> create deck -> add slide -> validate -> export HTML', async () => {
    const config = loadConfig({ logLevel: 'error' });
    const container = createContainer(config);

    // 1. Register Design Soul
    const soul = await container.soulService.register(sampleSoulInput);
    expect(soul.status).toBe('draft');
    expect(soul.cssTokens).toContain(':root {');

    // 2. Approve Design Soul
    const { soul: approved, recipes } = await container.soulService.approve(soul.id);
    expect(approved.status).toBe('approved');
    // 6 slide recipes + 11 print recipes = 17 total (SPEC §5.3)
    expect(recipes).toHaveLength(17);

    // 3. Create Deck
    const deck = await container.deckService.createDeck({
      soulId: soul.id as string,
      title: 'E2E Test Deck',
      author: 'Test Runner',
    });
    expect(deck.title).toBe('E2E Test Deck');
    expect(deck.slideIds).toHaveLength(0);

    // 4. Add Slide
    const slide = await container.deckService.addSlide({
      deckId: deck.id as string,
      ir: makeSlideIR('E2E Slide Content'),
      metadata: {
        title: 'First Slide',
        type: 'content',
        narrative: 'This is the first slide for the E2E test.',
        keyPoints: ['Point A', 'Point B'],
        tags: ['test', 'e2e'],
      },
    });
    expect(slide.position).toBe(0);
    expect(slide.metadata.title).toBe('First Slide');
    expect(slide.metadata.metaVersion).toBe('1.0');
    expect(slide.sourceKind).toBe('authored_ir');

    // 5. Validate (lint only) — use the compiled HTML now stored on the slide
    const validation = await container.validationService.validateSlide(
      slide.html,
      soul.id,
      'lint',
    );
    expect(validation).toBeDefined();
    expect(validation.stage2Skipped).toBe(true);
    expect(validation.styleScore.overall).toBeGreaterThanOrEqual(0);
    expect(validation.styleScore.overall).toBeLessThanOrEqual(1);

    // 5b. Save as template — update slide with passing validation, then save
    const slideWithValidation = {
      ...slide,
      lastValidation: { ...validation, passed: true },
    };
    await container.slideStore.save(slideWithValidation);

    const savedRecipe = await container.soulService.saveAsTemplate(
      soul.id,
      slide.id,
      'My Template',
      ['custom'],
      'Saved from test',
    );
    expect(savedRecipe.source).toBe('user-saved');
    expect(savedRecipe.name).toBe('My Template');
    expect(savedRecipe.savedFromSlideId).toBe(slide.id);

    // Verify recipe count is now 18 (6 slide built-in + 11 print built-in + 1 user-saved)
    const { recipes: allRecipes } = await container.soulService.get(soul.id, true);
    expect(allRecipes).toHaveLength(18);

    // 6. Get Deck Summary
    const summary = await container.deckService.getDeckSummary(deck.id as string);
    expect(summary.slideCount).toBe(1);
    expect(summary.slides[0].title).toBe('First Slide');
    expect(summary.revisionCount).toBeGreaterThanOrEqual(2); // deck_created + slide_added

    // 7. Add a second slide
    const slide2 = await container.deckService.addSlide({
      deckId: deck.id as string,
      ir: makeSlideIR('Second Slide Content'),
      metadata: {
        title: 'Second Slide',
        type: 'metrics',
        narrative: 'Metrics overview',
      },
    });
    expect(slide2.position).toBe(1);

    // 8. Update the first slide
    const updatedSlide = await container.deckService.updateSlide({
      deckId: deck.id as string,
      slideId: slide.id as string,
      metadata: { title: 'Updated First Slide' },
    });
    expect(updatedSlide.metadata.title).toBe('Updated First Slide');

    // 9. Reorder slides
    const reorderedDeck = await container.deckService.reorderSlides(
      deck.id as string,
      [slide2.id as string, slide.id as string],
    );
    expect(reorderedDeck.slideIds[0]).toBe(slide2.id);
    expect(reorderedDeck.slideIds[1]).toBe(slide.id);

    // 10. Export HTML
    const slides = [slide, slide2].map((s) => ({
      ...s,
      html: makeValidSlideHtml(`Content for ${s.metadata.title}`),
    }));

    // Use the HtmlExporter from rendering
    const htmlExporter = new HtmlExporter(container.logger);
    const exportResult = await htmlExporter.export(slides, 'E2E Test Deck', true);

    expect(exportResult.format).toBe('html');
    expect(exportResult.slideCount).toBe(2);
    expect(exportResult.fileSizeBytes).toBeGreaterThan(0);

    const htmlOutput = exportResult.data.toString('utf-8');
    expect(htmlOutput).toContain('<!DOCTYPE html>');
    expect(htmlOutput).toContain('slide-frame');

    // 11. Verify metadata can be parsed
    const metadata = container.metadataParser.parse(slide.html);
    expect(metadata).not.toBeNull();

    // 12. Verify metadata can be exported to markdown
    const markdown = container.metadataExporter.toMarkdown(updatedSlide.metadata);
    expect(markdown).toContain('# Updated First Slide');
    expect(markdown).toContain('Point A');
  }, 30_000);
});
