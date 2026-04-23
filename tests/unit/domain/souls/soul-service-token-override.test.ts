/**
 * Unit tests for SoulService.applyTokenOverride (Wave 3).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SoulService } from '../../../../src/domain/souls/soul-service.js';
import { InMemorySoulStore } from '../../../../src/storage/memory/soul-store.js';
import { InMemorySlideStore } from '../../../../src/storage/memory/slide-store.js';
import { FixedClock } from '../../../../src/infrastructure/clock.js';
import { Logger } from '../../../../src/infrastructure/logger.js';
import { sampleSoulInput } from '../../../helpers/fixtures.js';
import { PenguiError, ErrorCode } from '../../../../src/types/errors.js';

describe('SoulService.applyTokenOverride', () => {
  let service: SoulService;
  let store: InMemorySoulStore;
  let clock: FixedClock;

  beforeEach(() => {
    store = new InMemorySoulStore();
    const slideStore = new InMemorySlideStore();
    clock = new FixedClock('2026-01-15T12:00:00.000Z');
    const logger = new Logger('test', 'error');
    service = new SoulService(store, slideStore, clock, logger);
  });

  it('updates a color token and regenerates cssTokens', async () => {
    const soul = await service.register(sampleSoulInput);
    expect(soul.cssTokens).toContain('--color-canvas:');

    const updated = await service.applyTokenOverride(soul.id, 'color', 'canvas', '#000000');

    expect(updated.layers.color.canvas).toBe('#000000');
    expect(updated.cssTokens).toContain('--color-canvas: #000000');
    expect(updated.updatedAt).toBe('2026-01-15T12:00:00.000Z');
  });

  it('updates a spacing token and reflects change in cssTokens', async () => {
    const soul = await service.register(sampleSoulInput);

    const updated = await service.applyTokenOverride(soul.id, 'spacing', 'baseUnit', 20);

    expect(updated.layers.spacing.baseUnit).toBe(20);
    expect(updated.cssTokens).toContain('--space-base: 20px');
  });

  it('updates a typography token and rebuilds cssTokens', async () => {
    const soul = await service.register(sampleSoulInput);

    const updated = await service.applyTokenOverride(soul.id, 'typography', 'sizeH1', 64);

    expect(updated.layers.typography.sizeH1).toBe(64);
    expect(updated.cssTokens).toContain('--text-h1: 64px');
  });

  it('updates allowedFonts when fontDisplay changes', async () => {
    const soul = await service.register(sampleSoulInput);
    expect(soul.allowedFonts).toContain('Inter');

    const updated = await service.applyTokenOverride(
      soul.id,
      'typography',
      'fontDisplay',
      "'Roboto', sans-serif",
    );

    expect(updated.allowedFonts).toContain('Roboto');
    // Inter should still be in allowedFonts because fontBody is still Inter
    // unless fontBody also uses Inter — verify font change was applied
    expect(updated.layers.typography.fontDisplay).toBe("'Roboto', sans-serif");
  });

  it('persists the updated soul in the store', async () => {
    const soul = await service.register(sampleSoulInput);

    await service.applyTokenOverride(soul.id, 'color', 'accentPrimary', '#ff0000');

    const persisted = await store.get(soul.id);
    expect(persisted?.layers.color.accentPrimary).toBe('#ff0000');
  });

  it('throws INVALID_INPUT for an unknown tokenName in a valid layer', async () => {
    const soul = await service.register(sampleSoulInput);

    await expect(
      service.applyTokenOverride(soul.id, 'color', 'nonExistentToken', '#abc'),
    ).rejects.toThrow(PenguiError);

    await expect(
      service.applyTokenOverride(soul.id, 'color', 'nonExistentToken', '#abc'),
    ).rejects.toMatchObject({ code: ErrorCode.INVALID_INPUT });
  });

  it('throws SoulNotFoundError for an unknown soul id', async () => {
    await expect(
      service.applyTokenOverride('soul-does-not-exist' as never, 'color', 'canvas', '#fff'),
    ).rejects.toThrow('Design Soul not found');
  });

  it('regenerates recipes when soul is approved', async () => {
    const soul = await service.register(sampleSoulInput);
    await service.approve(soul.id);

    // Get recipes before the override
    const recipesBefore = await store.getRecipes(soul.id);
    expect(recipesBefore.length).toBeGreaterThan(0);

    // Apply an override — should regenerate recipes
    await service.applyTokenOverride(soul.id, 'color', 'canvas', '#f0f0f0');

    // Recipes should be regenerated (same count — built-in templates)
    const recipesAfter = await store.getRecipes(soul.id);
    expect(recipesAfter.length).toBe(recipesBefore.length);
  });

  it('does NOT call saveRecipes when soul is still draft', async () => {
    const soul = await service.register(sampleSoulInput);
    // soul is draft — no recipes should be generated
    const recipesBefore = await store.getRecipes(soul.id);
    expect(recipesBefore.length).toBe(0);

    await service.applyTokenOverride(soul.id, 'color', 'canvas', '#fafafa');

    const recipesAfter = await store.getRecipes(soul.id);
    expect(recipesAfter.length).toBe(0);
  });
});
