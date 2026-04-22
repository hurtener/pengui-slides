import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SoulService } from '../../../../src/domain/souls/soul-service.js';
import { InMemorySoulStore } from '../../../../src/storage/memory/soul-store.js';
import { InMemorySlideStore } from '../../../../src/storage/memory/slide-store.js';
import { FixedClock } from '../../../../src/infrastructure/clock.js';
import { Logger } from '../../../../src/infrastructure/logger.js';
import { sampleSoulInput } from '../../../helpers/fixtures.js';
import type { SoulId, SlideId, DeckId } from '../../../../src/types/common.js';
import type { Slide } from '../../../../src/types/deck.js';
import type { ValidationResult } from '../../../../src/types/validation.js';
import { SoulNotFoundError, PenguiError, ErrorCode } from '../../../../src/types/errors.js';

describe('SoulService', () => {
  let service: SoulService;
  let store: InMemorySoulStore;
  let slideStore: InMemorySlideStore;
  let clock: FixedClock;
  let logger: Logger;

  beforeEach(() => {
    store = new InMemorySoulStore();
    slideStore = new InMemorySlideStore();
    clock = new FixedClock('2026-01-15T12:00:00.000Z');
    logger = new Logger('test', 'error'); // suppress log output
    service = new SoulService(store, slideStore, clock, logger);
  });

  describe('register', () => {
    it('creates a new soul with draft status', async () => {
      const soul = await service.register(sampleSoulInput);

      expect(soul.status).toBe('draft');
      expect(soul.name).toBe('Test Soul');
      expect(soul.description).toBe('A test design soul for unit tests');
    });

    it('generates CSS tokens from layers', async () => {
      const soul = await service.register(sampleSoulInput);

      expect(soul.cssTokens).toContain(':root {');
      expect(soul.cssTokens).toContain('--color-canvas');
    });

    it('populates tokenNames array', async () => {
      const soul = await service.register(sampleSoulInput);

      expect(soul.tokenNames).toBeInstanceOf(Array);
      expect(soul.tokenNames.length).toBeGreaterThan(0);
      expect(soul.tokenNames).toContain('--color-canvas');
    });

    it('extracts allowedFonts', async () => {
      const soul = await service.register(sampleSoulInput);

      expect(soul.allowedFonts).toContain('Inter');
      expect(soul.allowedFonts).toContain('JetBrains Mono');
    });

    it('sets timestamps from clock', async () => {
      const soul = await service.register(sampleSoulInput);

      expect(soul.createdAt).toBe('2026-01-15T12:00:00.000Z');
      expect(soul.updatedAt).toBe('2026-01-15T12:00:00.000Z');
    });

    it('generates a unique ID', async () => {
      const soul1 = await service.register(sampleSoulInput);
      const soul2 = await service.register(sampleSoulInput);

      expect(soul1.id).not.toBe(soul2.id);
    });

    it('persists the soul to the store', async () => {
      const soul = await service.register(sampleSoulInput);

      const retrieved = await store.get(soul.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('Test Soul');
    });

    it('generates non-empty utilityCss', async () => {
      const soul = await service.register(sampleSoulInput);

      expect(typeof soul.utilityCss).toBe('string');
      expect(soul.utilityCss.length).toBeGreaterThan(0);
    });

    it('generates non-empty styleGuide', async () => {
      const soul = await service.register(sampleSoulInput);

      expect(typeof soul.styleGuide).toBe('string');
      expect(soul.styleGuide.length).toBeGreaterThan(0);
    });
  });

  describe('approve', () => {
    it('transitions status from draft to approved', async () => {
      const soul = await service.register(sampleSoulInput);
      const result = await service.approve(soul.id);

      expect(result.soul.status).toBe('approved');
    });

    it('sets approvedAt timestamp', async () => {
      const soul = await service.register(sampleSoulInput);
      const result = await service.approve(soul.id);

      expect(result.soul.approvedAt).toBe('2026-01-15T12:00:00.000Z');
    });

    it('generates layout recipes', async () => {
      const soul = await service.register(sampleSoulInput);
      const result = await service.approve(soul.id);

      // 6 slide recipes + 11 print recipes = 17 total (SPEC §5.3)
      expect(result.recipes).toHaveLength(17);
      expect(result.recipes[0].soulId).toBe(soul.id);
    });

    it('generates both slide and print recipes', async () => {
      const soul = await service.register(sampleSoulInput);
      const result = await service.approve(soul.id);

      const slideRecipes = result.recipes.filter((r) => r.medium === 'slides');
      const printRecipes = result.recipes.filter((r) => r.medium === 'print');
      expect(slideRecipes).toHaveLength(6);
      expect(printRecipes).toHaveLength(11);
    });

    it('persists recipes to the store', async () => {
      const soul = await service.register(sampleSoulInput);
      await service.approve(soul.id);

      const recipes = await store.getRecipes(soul.id);
      // 6 slide + 11 print = 17 total
      expect(recipes).toHaveLength(17);
    });

    it('throws SoulNotFoundError for non-existent soul', async () => {
      await expect(
        service.approve('non-existent' as SoulId),
      ).rejects.toThrow(SoulNotFoundError);
    });

    it('throws error when soul is already approved', async () => {
      const soul = await service.register(sampleSoulInput);
      await service.approve(soul.id);

      await expect(service.approve(soul.id)).rejects.toThrow(PenguiError);

      try {
        await service.approve(soul.id);
      } catch (err) {
        expect((err as PenguiError).code).toBe(ErrorCode.SOUL_ALREADY_APPROVED);
      }
    });
  });

  describe('get', () => {
    it('returns soul by ID', async () => {
      const soul = await service.register(sampleSoulInput);
      const result = await service.get(soul.id);

      expect(result.soul.id).toBe(soul.id);
      expect(result.soul.name).toBe('Test Soul');
    });

    it('throws SoulNotFoundError for non-existent soul', async () => {
      await expect(
        service.get('non-existent' as SoulId),
      ).rejects.toThrow(SoulNotFoundError);
    });

    it('includes recipes when requested', async () => {
      const soul = await service.register(sampleSoulInput);
      await service.approve(soul.id);

      const result = await service.get(soul.id, true);
      expect(result.recipes).toBeDefined();
      // 6 slide + 11 print = 17 total (SPEC §5.3)
      expect(result.recipes).toHaveLength(17);
    });

    it('omits recipes when not requested', async () => {
      const soul = await service.register(sampleSoulInput);
      const result = await service.get(soul.id);

      expect(result.recipes).toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns empty array when no souls exist', async () => {
      const results = await service.list();
      expect(results).toEqual([]);
    });

    it('returns all souls', async () => {
      await service.register(sampleSoulInput);
      await service.register({ ...sampleSoulInput, name: 'Second Soul' });

      const results = await service.list();
      expect(results).toHaveLength(2);
    });

    it('filters by status', async () => {
      const soul1 = await service.register(sampleSoulInput);
      await service.register({ ...sampleSoulInput, name: 'Second Soul' });
      await service.approve(soul1.id);

      const drafts = await service.list('draft');
      expect(drafts).toHaveLength(1);
      expect(drafts[0].name).toBe('Second Soul');

      const approved = await service.list('approved');
      expect(approved).toHaveLength(1);
      expect(approved[0].id).toBe(soul1.id);
    });

    it('returns all with "all" filter', async () => {
      await service.register(sampleSoulInput);
      const soul2 = await service.register({ ...sampleSoulInput, name: 'Second' });
      await service.approve(soul2.id);

      const all = await service.list('all');
      expect(all).toHaveLength(2);
    });
  });

  describe('saveAsTemplate', () => {
    function makePassingValidation(): ValidationResult {
      return {
        passed: true,
        issues: [],
        styleScore: {
          overall: 0.95,
          tokenCompliance: 1,
          typographyConsistency: 0.9,
          spacingConsistency: 0.9,
          contrastAccessibility: 1,
          structuralIntegrity: 1,
        },
        errorCount: 0,
        warningCount: 0,
        infoCount: 0,
        stage1ElapsedMs: 10,
        stage2Skipped: true,
        validatedAt: '2026-01-15T12:00:00.000Z',
      };
    }

    function makeSlide(soulId: SoulId, passed: boolean): Slide {
      return {
        id: 'slide-1' as SlideId,
        deckId: 'deck-1' as DeckId,
        position: 0,
        html: '<div>test slide</div>',
        metadata: {
          title: 'Test Slide',
          type: 'content',
          narrative: 'Test narrative',
          keyPoints: [],
          dataPoints: [],
          tags: [],
          generatedAt: '2026-01-15T12:00:00.000Z',
          soulId: soulId as string,
          deckId: 'deck-1',
          metaVersion: '1.0',
        },
        lastValidation: passed ? makePassingValidation() : undefined,
        createdAt: '2026-01-15T12:00:00.000Z',
        updatedAt: '2026-01-15T12:00:00.000Z',
      };
    }

    it('creates a recipe with source "user-saved"', async () => {
      const soul = await service.register(sampleSoulInput);
      await service.approve(soul.id);

      const slide = makeSlide(soul.id, true);
      await slideStore.save(slide);

      const recipe = await service.saveAsTemplate(
        soul.id,
        slide.id,
        'My Template',
        ['custom', 'test'],
        'Saved from test',
      );

      expect(recipe.source).toBe('user-saved');
      expect(recipe.name).toBe('My Template');
      expect(recipe.tags).toEqual(['custom', 'test']);
      expect(recipe.description).toBe('Saved from test');
      expect(recipe.soulId).toBe(soul.id);
      expect(recipe.savedFromSlideId).toBe(slide.id);
      expect(recipe.html).toBe(slide.html);
    });

    it('throws for non-existent soul', async () => {
      const slide = makeSlide('non-existent' as SoulId, true);
      await slideStore.save(slide);

      await expect(
        service.saveAsTemplate(
          'non-existent' as SoulId,
          slide.id,
          'Template',
          [],
          'desc',
        ),
      ).rejects.toThrow(SoulNotFoundError);
    });

    it('throws for non-existent slide', async () => {
      const soul = await service.register(sampleSoulInput);
      await service.approve(soul.id);

      await expect(
        service.saveAsTemplate(
          soul.id,
          'non-existent' as SlideId,
          'Template',
          [],
          'desc',
        ),
      ).rejects.toThrow(PenguiError);
    });

    it('throws for slide without passing validation', async () => {
      const soul = await service.register(sampleSoulInput);
      await service.approve(soul.id);

      const slide = makeSlide(soul.id, false);
      await slideStore.save(slide);

      await expect(
        service.saveAsTemplate(
          soul.id,
          slide.id,
          'Template',
          [],
          'desc',
        ),
      ).rejects.toThrow(PenguiError);

      try {
        await service.saveAsTemplate(soul.id, slide.id, 'Template', [], 'desc');
      } catch (err) {
        expect((err as PenguiError).code).toBe(ErrorCode.VALIDATION_FAILED);
      }
    });
  });
});
