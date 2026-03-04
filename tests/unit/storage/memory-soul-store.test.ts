import { describe, it, expect, beforeEach } from 'vitest';
import { InMemorySoulStore } from '../../../src/storage/memory/soul-store.js';
import type { DesignSoul, LayoutRecipe } from '../../../src/types/design-soul.js';
import type { SoulId, TemplateId } from '../../../src/types/common.js';

function makeSoul(overrides: Partial<DesignSoul> = {}): DesignSoul {
  return {
    id: 'soul-1' as SoulId,
    name: 'Test Soul',
    description: 'A test design soul',
    status: 'draft',
    layers: {} as DesignSoul['layers'],
    cssTokens: ':root { --color-canvas: #fff; }',
    tokenNames: ['--color-canvas'],
    allowedFonts: ['Inter'],
    utilityCss: '.card { background: var(--color-surface); }',
    styleGuide: '# Style Guide\n\nTest guide content.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeRecipe(soulId: SoulId, type: string = 'title-slide'): LayoutRecipe {
  return {
    id: `tpl-${type}` as TemplateId,
    soulId,
    type,
    name: `${type} template`,
    description: `A ${type} template`,
    tags: ['test'],
    source: 'built-in' as const,
    html: '<div>recipe</div>',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('InMemorySoulStore', () => {
  let store: InMemorySoulStore;

  beforeEach(() => {
    store = new InMemorySoulStore();
  });

  describe('save and get', () => {
    it('saves and retrieves a soul by ID', async () => {
      const soul = makeSoul();
      await store.save(soul);

      const retrieved = await store.get('soul-1' as SoulId);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe('soul-1');
      expect(retrieved!.name).toBe('Test Soul');
    });

    it('returns undefined for non-existent ID', async () => {
      const result = await store.get('non-existent' as SoulId);
      expect(result).toBeUndefined();
    });

    it('overwrites existing soul on save with same ID', async () => {
      const soul = makeSoul();
      await store.save(soul);

      const updated = makeSoul({ name: 'Updated Soul' });
      await store.save(updated);

      const retrieved = await store.get('soul-1' as SoulId);
      expect(retrieved!.name).toBe('Updated Soul');
    });
  });

  describe('deep clone on read (mutation safety)', () => {
    it('returns a deep copy, not a reference', async () => {
      const soul = makeSoul();
      await store.save(soul);

      const retrieved1 = await store.get('soul-1' as SoulId);
      retrieved1!.name = 'MUTATED';

      const retrieved2 = await store.get('soul-1' as SoulId);
      expect(retrieved2!.name).toBe('Test Soul');
    });
  });

  describe('list', () => {
    it('returns empty array when no souls exist', async () => {
      const results = await store.list();
      expect(results).toEqual([]);
    });

    it('returns all souls when no filter specified', async () => {
      await store.save(makeSoul({ id: 'soul-1' as SoulId, status: 'draft' }));
      await store.save(makeSoul({ id: 'soul-2' as SoulId, status: 'approved' }));

      const results = await store.list();
      expect(results).toHaveLength(2);
    });

    it('returns all souls with "all" filter', async () => {
      await store.save(makeSoul({ id: 'soul-1' as SoulId, status: 'draft' }));
      await store.save(makeSoul({ id: 'soul-2' as SoulId, status: 'approved' }));

      const results = await store.list('all');
      expect(results).toHaveLength(2);
    });

    it('filters by status when specified', async () => {
      await store.save(makeSoul({ id: 'soul-1' as SoulId, status: 'draft' }));
      await store.save(makeSoul({ id: 'soul-2' as SoulId, status: 'approved' }));
      await store.save(makeSoul({ id: 'soul-3' as SoulId, status: 'draft' }));

      const drafts = await store.list('draft');
      expect(drafts).toHaveLength(2);
      expect(drafts.every((s) => s.status === 'draft')).toBe(true);

      const approved = await store.list('approved');
      expect(approved).toHaveLength(1);
      expect(approved[0].status).toBe('approved');
    });
  });

  describe('delete', () => {
    it('deletes an existing soul and returns true', async () => {
      await store.save(makeSoul());
      const result = await store.delete('soul-1' as SoulId);
      expect(result).toBe(true);

      const retrieved = await store.get('soul-1' as SoulId);
      expect(retrieved).toBeUndefined();
    });

    it('returns false for non-existent ID', async () => {
      const result = await store.delete('non-existent' as SoulId);
      expect(result).toBe(false);
    });

    it('also deletes associated recipes', async () => {
      const soulId = 'soul-1' as SoulId;
      await store.save(makeSoul({ id: soulId }));
      await store.saveRecipes(soulId, [makeRecipe(soulId)]);

      await store.delete(soulId);

      const recipes = await store.getRecipes(soulId);
      expect(recipes).toEqual([]);
    });
  });

  describe('recipes', () => {
    it('saves and retrieves recipes for a soul', async () => {
      const soulId = 'soul-1' as SoulId;
      const templates = [
        makeRecipe(soulId, 'title-slide'),
        makeRecipe(soulId, 'two-column'),
      ];

      await store.saveRecipes(soulId, templates);

      const retrieved = await store.getRecipes(soulId);
      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].type).toBe('title-slide');
      expect(retrieved[1].type).toBe('two-column');
    });

    it('returns empty array for non-existent soul recipes', async () => {
      const result = await store.getRecipes('non-existent' as SoulId);
      expect(result).toEqual([]);
    });

    it('deep-clones recipes on read', async () => {
      const soulId = 'soul-1' as SoulId;
      await store.saveRecipes(soulId, [makeRecipe(soulId)]);

      const retrieved1 = await store.getRecipes(soulId);
      retrieved1[0].name = 'MUTATED';

      const retrieved2 = await store.getRecipes(soulId);
      expect(retrieved2[0].name).not.toBe('MUTATED');
    });

    it('addRecipe appends a recipe to existing ones', async () => {
      const soulId = 'soul-1' as SoulId;
      await store.saveRecipes(soulId, [makeRecipe(soulId, 'title-slide')]);

      const newRecipe = makeRecipe(soulId, 'metrics');
      await store.addRecipe(soulId, newRecipe);

      const recipes = await store.getRecipes(soulId);
      expect(recipes).toHaveLength(2);
      expect(recipes[0].type).toBe('title-slide');
      expect(recipes[1].type).toBe('metrics');
    });
  });
});
