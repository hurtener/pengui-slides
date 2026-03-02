import { describe, it, expect } from 'vitest';
import { RecipeGenerator } from '../../../../src/domain/souls/recipe-generator.js';
import { FixedClock } from '../../../../src/infrastructure/clock.js';
import type { SoulId } from '../../../../src/types/common.js';
import type { LayoutRecipe } from '../../../../src/types/design-soul.js';

describe('RecipeGenerator', () => {
  const generator = new RecipeGenerator();
  const soulId = 'soul-test' as SoulId;
  const cssTokens = ':root { --color-canvas: #fff; }';
  const clock = new FixedClock('2026-01-15T12:00:00.000Z');

  it('generates exactly 6 layout recipes', () => {
    const recipes = generator.generateAll(soulId, cssTokens, clock);
    expect(recipes).toHaveLength(6);
  });

  it('generates all expected recipe types', () => {
    const recipes = generator.generateAll(soulId, cssTokens, clock);
    const types = recipes.map((r) => r.type);

    const expectedTypes = [
      'title-slide',
      'two-column',
      'metrics',
      'features-grid',
      'closing-cta',
      'blank-themed',
    ];

    for (const expectedType of expectedTypes) {
      expect(types).toContain(expectedType);
    }
  });

  it('each recipe has a unique ID', () => {
    const recipes = generator.generateAll(soulId, cssTokens, clock);
    const ids = recipes.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(6);
  });

  it('each recipe references the correct soulId', () => {
    const recipes = generator.generateAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(recipe.soulId).toBe(soulId);
    }
  });

  it('each recipe has a non-empty name and description', () => {
    const recipes = generator.generateAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(recipe.name.length).toBeGreaterThan(0);
      expect(recipe.description.length).toBeGreaterThan(0);
    }
  });

  it('each recipe has non-empty HTML', () => {
    const recipes = generator.generateAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(recipe.html.length).toBeGreaterThan(0);
    }
  });

  it('each recipe has a tags array', () => {
    const recipes = generator.generateAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(Array.isArray(recipe.tags)).toBe(true);
      expect(recipe.tags.length).toBeGreaterThan(0);
    }
  });

  it('each recipe has source "built-in"', () => {
    const recipes = generator.generateAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(recipe.source).toBe('built-in');
    }
  });

  it('each recipe HTML includes the CSS tokens', () => {
    const recipes = generator.generateAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(recipe.html).toContain(cssTokens);
    }
  });

  it('each recipe HTML is a complete HTML document', () => {
    const recipes = generator.generateAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(recipe.html).toContain('<!DOCTYPE html>');
      expect(recipe.html).toContain('<html');
      expect(recipe.html).toContain('<head>');
      expect(recipe.html).toContain('<body>');
      expect(recipe.html).toContain('<div class="slide">');
    }
  });

  it('each recipe HTML includes the @slide-meta placeholder', () => {
    const recipes = generator.generateAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(recipe.html).toContain('<!-- @slide-meta -->');
    }
  });

  it('NO recipe HTML contains @slot: markers', () => {
    const recipes = generator.generateAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(recipe.html).not.toContain('@slot:');
    }
  });

  it('each recipe HTML contains HTML comments (inline docs)', () => {
    const recipes = generator.generateAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      // Each recipe should have at least one inline comment beyond @slide-meta
      const commentMatches = recipe.html.match(/<!--[\s\S]*?-->/g) || [];
      // Filter out @slide-meta
      const inlineComments = commentMatches.filter(
        (c) => !c.includes('@slide-meta'),
      );
      expect(inlineComments.length).toBeGreaterThan(0);
    }
  });

  it('recipe HTML includes utility CSS classes', () => {
    const recipes = generator.generateAll(soulId, cssTokens, clock);
    // The utility CSS library should be embedded in each recipe's HTML
    for (const recipe of recipes) {
      expect(recipe.html).toContain('.card');
      expect(recipe.html).toContain('.flex-center');
      expect(recipe.html).toContain('.text-hero');
    }
  });

  it('each recipe uses the clock timestamp for createdAt', () => {
    const recipes = generator.generateAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(recipe.createdAt).toBe('2026-01-15T12:00:00.000Z');
    }
  });
});
