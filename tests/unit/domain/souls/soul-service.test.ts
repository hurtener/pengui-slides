import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SoulService } from '../../../../src/domain/souls/soul-service.js';
import { InMemorySoulStore } from '../../../../src/storage/memory/soul-store.js';
import { FixedClock } from '../../../../src/infrastructure/clock.js';
import { Logger } from '../../../../src/infrastructure/logger.js';
import { sampleSoulInput } from '../../../helpers/fixtures.js';
import type { SoulId } from '../../../../src/types/common.js';
import { SoulNotFoundError, PenguiError, ErrorCode } from '../../../../src/types/errors.js';

describe('SoulService', () => {
  let service: SoulService;
  let store: InMemorySoulStore;
  let clock: FixedClock;
  let logger: Logger;

  beforeEach(() => {
    store = new InMemorySoulStore();
    clock = new FixedClock('2026-01-15T12:00:00.000Z');
    logger = new Logger('test', 'error'); // suppress log output
    service = new SoulService(store, clock, logger);
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

    it('generates skeleton templates', async () => {
      const soul = await service.register(sampleSoulInput);
      const result = await service.approve(soul.id);

      expect(result.skeletons).toHaveLength(6);
      expect(result.skeletons[0].soulId).toBe(soul.id);
    });

    it('persists skeletons to the store', async () => {
      const soul = await service.register(sampleSoulInput);
      await service.approve(soul.id);

      const skeletons = await store.getSkeletons(soul.id);
      expect(skeletons).toHaveLength(6);
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

    it('includes skeletons when requested', async () => {
      const soul = await service.register(sampleSoulInput);
      await service.approve(soul.id);

      const result = await service.get(soul.id, true);
      expect(result.skeletons).toBeDefined();
      expect(result.skeletons).toHaveLength(6);
    });

    it('omits skeletons when not requested', async () => {
      const soul = await service.register(sampleSoulInput);
      const result = await service.get(soul.id);

      expect(result.skeletons).toBeUndefined();
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
});
