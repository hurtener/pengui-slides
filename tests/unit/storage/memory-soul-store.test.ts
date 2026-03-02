import { describe, it, expect, beforeEach } from 'vitest';
import { InMemorySoulStore } from '../../../src/storage/memory/soul-store.js';
import type { DesignSoul, SkeletonTemplate } from '../../../src/types/design-soul.js';
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
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeSkeleton(soulId: SoulId, type: string = 'title-slide'): SkeletonTemplate {
  return {
    id: `tpl-${type}` as TemplateId,
    soulId,
    type: type as SkeletonTemplate['type'],
    name: `${type} template`,
    description: `A ${type} template`,
    html: '<div>skeleton</div>',
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

    it('also deletes associated skeletons', async () => {
      const soulId = 'soul-1' as SoulId;
      await store.save(makeSoul({ id: soulId }));
      await store.saveSkeletons(soulId, [makeSkeleton(soulId)]);

      await store.delete(soulId);

      const skeletons = await store.getSkeletons(soulId);
      expect(skeletons).toEqual([]);
    });
  });

  describe('skeletons', () => {
    it('saves and retrieves skeletons for a soul', async () => {
      const soulId = 'soul-1' as SoulId;
      const templates = [
        makeSkeleton(soulId, 'title-slide'),
        makeSkeleton(soulId, 'two-column'),
      ];

      await store.saveSkeletons(soulId, templates);

      const retrieved = await store.getSkeletons(soulId);
      expect(retrieved).toHaveLength(2);
      expect(retrieved[0].type).toBe('title-slide');
      expect(retrieved[1].type).toBe('two-column');
    });

    it('returns empty array for non-existent soul skeletons', async () => {
      const result = await store.getSkeletons('non-existent' as SoulId);
      expect(result).toEqual([]);
    });

    it('deep-clones skeletons on read', async () => {
      const soulId = 'soul-1' as SoulId;
      await store.saveSkeletons(soulId, [makeSkeleton(soulId)]);

      const retrieved1 = await store.getSkeletons(soulId);
      retrieved1[0].name = 'MUTATED';

      const retrieved2 = await store.getSkeletons(soulId);
      expect(retrieved2[0].name).not.toBe('MUTATED');
    });
  });
});
