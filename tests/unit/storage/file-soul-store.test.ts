import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { FileSoulStore } from '../../../src/storage/file/soul-store.js';
import type { SoulId } from '../../../src/types/common.js';
import type { DesignSoul, LayoutRecipe, SoulLayers } from '../../../src/types/design-soul.js';

function makeSoulId(id: string): SoulId {
  return id as SoulId;
}

function makeLayers(): SoulLayers {
  return {
    color: {
      canvas: '#fff', surface: '#f5f5f5', surfaceAlt: '#eee', border: '#ddd',
      textPrimary: '#111', textSecondary: '#555', textTertiary: '#999', textInverse: '#fff',
      accentPrimary: '#0066cc', accentSecondary: '#cc6600', accentWarm: '#cc0000',
      success: '#00cc66', warning: '#cccc00', error: '#cc0000', info: '#0099cc',
    },
    typography: {
      fontDisplay: 'Inter', fontBody: 'Inter', fontMono: 'Fira Code',
      sizeHero: 72, sizeH1: 48, sizeH2: 36, sizeH3: 28, sizeBody: 18, sizeLabel: 14, sizeCaption: 12,
      weightNormal: 400, weightMedium: 500, weightBold: 700,
      lineHeightHeading: 1.2, lineHeightBody: 1.6,
      letterSpacingHeading: '-0.02em', letterSpacingBody: '0',
    },
    spacing: {
      baseUnit: 8, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64, safeAreaInset: 48,
    },
    shape: {
      none: '0', sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px',
      buttonRadius: '8px', cardRadius: '12px', inputRadius: '8px', badgeRadius: '9999px',
    },
    depth: {
      shadowNone: 'none', shadowSoft: '0 1px 2px rgba(0,0,0,0.05)',
      shadowMedium: '0 4px 6px rgba(0,0,0,0.1)', shadowElevated: '0 10px 15px rgba(0,0,0,0.15)',
      shadowInner: 'inset 0 2px 4px rgba(0,0,0,0.06)', borderWidth: '1px', borderOpacity: 0.1,
    },
    components: {
      cardPadding: '24px', cardShadow: '0 4px 6px rgba(0,0,0,0.1)', cardBorderWidth: '1px',
      buttonPaddingX: '16px', buttonPaddingY: '8px',
      inputPaddingX: '12px', inputPaddingY: '8px', inputBorderWidth: '1px',
      badgePaddingX: '8px', badgePaddingY: '4px',
    },
    motion: {
      durationFast: '100ms', durationNormal: '200ms', durationSlow: '300ms',
      easingDefault: 'ease-out', easingEmphasized: 'cubic-bezier(0.2, 0, 0, 1)',
      northStar: 'Clean and professional', doRules: ['Use consistent spacing'], dontRules: ['Avoid clutter'],
    },
  };
}

function makeSoul(id: string, status: 'draft' | 'approved' | 'archived' = 'draft'): DesignSoul {
  return {
    id: makeSoulId(id),
    name: `Soul ${id}`,
    description: `Test soul ${id}`,
    status,
    layers: makeLayers(),
    cssTokens: ':root { --color-canvas: #fff; }',
    tokenNames: ['--color-canvas'],
    allowedFonts: ['Inter', 'Fira Code'],
    utilityCss: '.card { background: var(--color-surface); }',
    styleGuide: '# Style Guide\n\nTest guide content.',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  };
}

describe('FileSoulStore', () => {
  let tmpDir: string;
  let store: FileSoulStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pengui-test-'));
    store = new FileSoulStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('save and get', () => {
    it('should save and retrieve a soul', async () => {
      const soul = makeSoul('soul-1');
      await store.save(soul);
      const retrieved = await store.get(makeSoulId('soul-1'));
      expect(retrieved).toEqual(soul);
    });

    it('should return undefined for a non-existent soul', async () => {
      const result = await store.get(makeSoulId('nonexistent'));
      expect(result).toBeUndefined();
    });

    it('should overwrite an existing soul on save', async () => {
      const soul = makeSoul('soul-1');
      await store.save(soul);

      const updated = { ...soul, name: 'Updated Soul' };
      await store.save(updated);

      const retrieved = await store.get(makeSoulId('soul-1'));
      expect(retrieved?.name).toBe('Updated Soul');
    });

    it('should deep-clone data so mutations do not affect stored data', async () => {
      const soul = makeSoul('soul-1');
      await store.save(soul);

      // Mutate original
      soul.name = 'Mutated';
      const retrieved = await store.get(makeSoulId('soul-1'));
      expect(retrieved?.name).toBe('Soul soul-1');
    });

    it('should persist data to a JSON file on disk', async () => {
      const soul = makeSoul('soul-1');
      await store.save(soul);

      const filePath = path.join(tmpDir, 'souls', 'soul-1.json');
      expect(fs.existsSync(filePath)).toBe(true);
      const onDisk = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(onDisk.id).toBe('soul-1');
    });
  });

  describe('list', () => {
    it('should return all souls when no filter is provided', async () => {
      await store.save(makeSoul('s1', 'draft'));
      await store.save(makeSoul('s2', 'approved'));
      await store.save(makeSoul('s3', 'archived'));

      const all = await store.list();
      expect(all).toHaveLength(3);
    });

    it('should return all souls when filter is "all"', async () => {
      await store.save(makeSoul('s1', 'draft'));
      await store.save(makeSoul('s2', 'approved'));

      const all = await store.list('all');
      expect(all).toHaveLength(2);
    });

    it('should filter by status', async () => {
      await store.save(makeSoul('s1', 'draft'));
      await store.save(makeSoul('s2', 'approved'));
      await store.save(makeSoul('s3', 'draft'));

      const drafts = await store.list('draft');
      expect(drafts).toHaveLength(2);
      expect(drafts.every((s) => s.status === 'draft')).toBe(true);
    });

    it('should return empty array when directory is empty', async () => {
      const all = await store.list();
      expect(all).toEqual([]);
    });

    it('should skip .recipes.json files in listing', async () => {
      await store.save(makeSoul('s1'));
      const soulId = makeSoulId('s1');
      await store.saveRecipes(soulId, [
        {
          id: 'tmpl-1' as any,
          soulId,
          type: 'title-slide',
          name: 'Title',
          description: 'A title slide',
          tags: ['test'],
          source: 'built-in' as const,
          html: '<div>Title</div>',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]);

      const all = await store.list();
      // Should only return 1 soul, not count the .recipes.json file
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe('s1');
    });
  });

  describe('delete', () => {
    it('should delete an existing soul and return true', async () => {
      await store.save(makeSoul('soul-1'));
      const result = await store.delete(makeSoulId('soul-1'));
      expect(result).toBe(true);

      const retrieved = await store.get(makeSoulId('soul-1'));
      expect(retrieved).toBeUndefined();
    });

    it('should return false when deleting a non-existent soul', async () => {
      const result = await store.delete(makeSoulId('nonexistent'));
      expect(result).toBe(false);
    });

    it('should also delete associated recipes file', async () => {
      const soulId = makeSoulId('soul-1');
      await store.save(makeSoul('soul-1'));
      await store.saveRecipes(soulId, [
        {
          id: 'tmpl-1' as any,
          soulId,
          type: 'title-slide',
          name: 'Title',
          description: 'A title slide',
          tags: ['test'],
          source: 'built-in' as const,
          html: '<div>Title</div>',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ]);

      await store.delete(soulId);

      const recipes = await store.getRecipes(soulId);
      expect(recipes).toEqual([]);
    });
  });

  describe('saveRecipes and getRecipes', () => {
    it('should save and retrieve recipes', async () => {
      const soulId = makeSoulId('soul-1');
      const templates: LayoutRecipe[] = [
        {
          id: 'tmpl-1' as any,
          soulId,
          type: 'title-slide',
          name: 'Title Slide',
          description: 'A title slide template',
          tags: ['opening', 'hero'],
          source: 'built-in' as const,
          html: '<div class="title">Hello</div>',
          createdAt: '2024-01-01T00:00:00Z',
        },
        {
          id: 'tmpl-2' as any,
          soulId,
          type: 'two-column',
          name: 'Two Column',
          description: 'A two-column template',
          tags: ['split', 'content'],
          source: 'built-in' as const,
          html: '<div class="columns">...</div>',
          createdAt: '2024-01-02T00:00:00Z',
        },
      ];

      await store.saveRecipes(soulId, templates);
      const retrieved = await store.getRecipes(soulId);
      expect(retrieved).toEqual(templates);
    });

    it('should return empty array when no recipes exist', async () => {
      const result = await store.getRecipes(makeSoulId('no-such-soul'));
      expect(result).toEqual([]);
    });

    it('should overwrite recipes on second save', async () => {
      const soulId = makeSoulId('soul-1');
      await store.saveRecipes(soulId, [
        {
          id: 'tmpl-1' as any, soulId, type: 'title-slide',
          name: 'Old', description: 'old', tags: ['old'], source: 'built-in' as const,
          html: '<div>old</div>', createdAt: '2024-01-01T00:00:00Z',
        },
      ]);

      const newTemplates: LayoutRecipe[] = [
        {
          id: 'tmpl-2' as any, soulId, type: 'metrics',
          name: 'New', description: 'new', tags: ['new'], source: 'built-in' as const,
          html: '<div>new</div>', createdAt: '2024-01-02T00:00:00Z',
        },
      ];
      await store.saveRecipes(soulId, newTemplates);

      const retrieved = await store.getRecipes(soulId);
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0].name).toBe('New');
    });
  });

  describe('addRecipe', () => {
    it('should append a recipe to existing ones', async () => {
      const soulId = makeSoulId('soul-1');
      await store.saveRecipes(soulId, [
        {
          id: 'tmpl-1' as any, soulId, type: 'title-slide',
          name: 'First', description: 'first', tags: ['test'], source: 'built-in' as const,
          html: '<div>first</div>', createdAt: '2024-01-01T00:00:00Z',
        },
      ]);

      const newRecipe: LayoutRecipe = {
        id: 'tmpl-2' as any, soulId, type: 'metrics',
        name: 'Second', description: 'second', tags: ['user'], source: 'user-saved' as const,
        html: '<div>second</div>', createdAt: '2024-01-02T00:00:00Z',
      };

      await store.addRecipe(soulId, newRecipe);

      const recipes = await store.getRecipes(soulId);
      expect(recipes).toHaveLength(2);
      expect(recipes[0].name).toBe('First');
      expect(recipes[1].name).toBe('Second');
      expect(recipes[1].source).toBe('user-saved');
    });
  });

  describe('backward compatibility: skeletons migration', () => {
    it('should read from legacy .skeletons.json when .recipes.json does not exist', async () => {
      const soulId = makeSoulId('soul-1');

      // Manually write a .skeletons.json file (legacy format)
      const soulsDir = path.join(tmpDir, 'souls');
      fs.mkdirSync(soulsDir, { recursive: true });

      const legacyData: LayoutRecipe[] = [
        {
          id: 'tmpl-legacy' as any,
          soulId,
          type: 'title-slide',
          name: 'Legacy Template',
          description: 'A legacy skeleton template',
          tags: [],
          source: 'built-in' as const,
          html: '<div>legacy</div>',
          createdAt: '2024-01-01T00:00:00Z',
        },
      ];

      fs.writeFileSync(
        path.join(soulsDir, `${soulId}.skeletons.json`),
        JSON.stringify(legacyData, null, 2),
        'utf-8',
      );

      const recipes = await store.getRecipes(soulId);
      expect(recipes).toHaveLength(1);
      expect(recipes[0].name).toBe('Legacy Template');
    });

    it('prefers .recipes.json over .skeletons.json', async () => {
      const soulId = makeSoulId('soul-1');

      const soulsDir = path.join(tmpDir, 'souls');
      fs.mkdirSync(soulsDir, { recursive: true });

      // Write legacy file
      fs.writeFileSync(
        path.join(soulsDir, `${soulId}.skeletons.json`),
        JSON.stringify([{
          id: 'tmpl-old' as any, soulId, type: 'title-slide',
          name: 'Old', description: 'old', tags: [], source: 'built-in' as const,
          html: '<div>old</div>', createdAt: '2024-01-01T00:00:00Z',
        }], null, 2),
        'utf-8',
      );

      // Write new recipes file
      await store.saveRecipes(soulId, [{
        id: 'tmpl-new' as any, soulId, type: 'title-slide',
        name: 'New', description: 'new', tags: [], source: 'built-in' as const,
        html: '<div>new</div>', createdAt: '2024-01-02T00:00:00Z',
      }]);

      const recipes = await store.getRecipes(soulId);
      expect(recipes).toHaveLength(1);
      expect(recipes[0].name).toBe('New');
    });
  });

  describe('data survives re-instantiation', () => {
    it('should read data saved by a previous store instance', async () => {
      const store1 = new FileSoulStore(tmpDir);
      await store1.save(makeSoul('soul-persist'));

      const store2 = new FileSoulStore(tmpDir);
      const retrieved = await store2.get(makeSoulId('soul-persist'));
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Soul soul-persist');
    });
  });
});
