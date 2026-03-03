import { describe, it, expect, beforeEach } from 'vitest';
import { AssetService } from '../../../../src/domain/assets/asset-service.js';
import { InMemoryAssetStore } from '../../../../src/storage/memory/asset-store.js';
import { FixedClock } from '../../../../src/infrastructure/clock.js';
import { Logger } from '../../../../src/infrastructure/logger.js';
import { soulId, deckId, assetId } from '../../../../src/types/common.js';
import { PenguiError } from '../../../../src/types/errors.js';

// A tiny 1x1 red PNG pixel as base64
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

// A tiny SVG
const TINY_SVG_BASE64 = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect fill="red" width="1" height="1"/></svg>',
).toString('base64');

describe('AssetService', () => {
  let assetService: AssetService;
  let assetStore: InMemoryAssetStore;
  let clock: FixedClock;
  let logger: Logger;

  beforeEach(() => {
    assetStore = new InMemoryAssetStore();
    clock = new FixedClock('2026-01-15T12:00:00.000Z');
    logger = new Logger('test', 'error');
    assetService = new AssetService(assetStore, clock, logger);
  });

  describe('upload', () => {
    it('uploads a PNG asset and returns metadata', async () => {
      const asset = await assetService.upload({
        name: 'Test Logo',
        filename: 'logo.png',
        mimeType: 'image/png',
        scope: { type: 'soul', soulId: soulId('soul-1') },
        role: 'logo',
        dataBase64: TINY_PNG_BASE64,
      });

      expect(asset.id).toBeDefined();
      expect(asset.name).toBe('Test Logo');
      expect(asset.filename).toBe('logo.png');
      expect(asset.mimeType).toBe('image/png');
      expect(asset.scope).toEqual({ type: 'soul', soulId: soulId('soul-1') });
      expect(asset.role).toBe('logo');
      expect(asset.sizeBytes).toBeGreaterThan(0);
      expect(asset.createdAt).toBe('2026-01-15T12:00:00.000Z');
    });

    it('uploads an SVG asset', async () => {
      const asset = await assetService.upload({
        name: 'Icon',
        filename: 'icon.svg',
        mimeType: 'image/svg+xml',
        scope: { type: 'global' },
        role: 'content',
        dataBase64: TINY_SVG_BASE64,
      });

      expect(asset.mimeType).toBe('image/svg+xml');
      expect(asset.sizeBytes).toBeGreaterThan(0);
    });

    it('uploads a JPEG asset', async () => {
      // Use a minimal valid base64 string (doesn't need to be valid JPEG for storage)
      const asset = await assetService.upload({
        name: 'Photo',
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        scope: { type: 'deck', deckId: deckId('deck-1') },
        role: 'content',
        dataBase64: TINY_PNG_BASE64,
      });

      expect(asset.mimeType).toBe('image/jpeg');
    });

    it('rejects unsupported mime types', async () => {
      await expect(
        assetService.upload({
          name: 'Bad',
          filename: 'file.gif',
          mimeType: 'image/gif' as never,
          scope: { type: 'global' },
          role: 'content',
          dataBase64: TINY_PNG_BASE64,
        }),
      ).rejects.toThrow(PenguiError);
    });

    it('stores binary data that can be retrieved', async () => {
      const asset = await assetService.upload({
        name: 'Logo',
        filename: 'logo.png',
        mimeType: 'image/png',
        scope: { type: 'global' },
        role: 'logo',
        dataBase64: TINY_PNG_BASE64,
      });

      const data = await assetStore.getData(asset.id);
      expect(data).toBeDefined();
      expect(data!.length).toBe(asset.sizeBytes);
    });
  });

  describe('get', () => {
    it('returns metadata for an existing asset', async () => {
      const uploaded = await assetService.upload({
        name: 'Logo',
        filename: 'logo.png',
        mimeType: 'image/png',
        scope: { type: 'global' },
        role: 'logo',
        dataBase64: TINY_PNG_BASE64,
      });

      const asset = await assetService.get(uploaded.id);
      expect(asset).toBeDefined();
      expect(asset!.name).toBe('Logo');
    });

    it('returns undefined for non-existent asset', async () => {
      const asset = await assetService.get(assetId('non-existent'));
      expect(asset).toBeUndefined();
    });
  });

  describe('getDataUri', () => {
    it('returns a data URI for an existing asset', async () => {
      const uploaded = await assetService.upload({
        name: 'Logo',
        filename: 'logo.png',
        mimeType: 'image/png',
        scope: { type: 'global' },
        role: 'logo',
        dataBase64: TINY_PNG_BASE64,
      });

      const dataUri = await assetService.getDataUri(uploaded.id);
      expect(dataUri).toBeDefined();
      expect(dataUri).toMatch(/^data:image\/png;base64,/);
    });

    it('returns undefined for non-existent asset', async () => {
      const dataUri = await assetService.getDataUri(assetId('non-existent'));
      expect(dataUri).toBeUndefined();
    });
  });

  describe('list', () => {
    it('lists all assets when no filter', async () => {
      await assetService.upload({
        name: 'A',
        filename: 'a.png',
        mimeType: 'image/png',
        scope: { type: 'global' },
        role: 'logo',
        dataBase64: TINY_PNG_BASE64,
      });
      await assetService.upload({
        name: 'B',
        filename: 'b.png',
        mimeType: 'image/png',
        scope: { type: 'global' },
        role: 'content',
        dataBase64: TINY_PNG_BASE64,
      });

      const all = await assetService.list();
      expect(all).toHaveLength(2);
    });

    it('filters by scope type', async () => {
      await assetService.upload({
        name: 'Soul Logo',
        filename: 'logo.png',
        mimeType: 'image/png',
        scope: { type: 'soul', soulId: soulId('soul-1') },
        role: 'logo',
        dataBase64: TINY_PNG_BASE64,
      });
      await assetService.upload({
        name: 'Deck Image',
        filename: 'photo.png',
        mimeType: 'image/png',
        scope: { type: 'deck', deckId: deckId('deck-1') },
        role: 'content',
        dataBase64: TINY_PNG_BASE64,
      });

      const soulAssets = await assetService.list({ scope: 'soul' });
      expect(soulAssets).toHaveLength(1);
      expect(soulAssets[0].name).toBe('Soul Logo');

      const deckAssets = await assetService.list({ scope: 'deck' });
      expect(deckAssets).toHaveLength(1);
      expect(deckAssets[0].name).toBe('Deck Image');
    });

    it('filters by role', async () => {
      await assetService.upload({
        name: 'Logo',
        filename: 'logo.png',
        mimeType: 'image/png',
        scope: { type: 'global' },
        role: 'logo',
        dataBase64: TINY_PNG_BASE64,
      });
      await assetService.upload({
        name: 'Photo',
        filename: 'photo.png',
        mimeType: 'image/png',
        scope: { type: 'global' },
        role: 'content',
        dataBase64: TINY_PNG_BASE64,
      });

      const logos = await assetService.list({ role: 'logo' });
      expect(logos).toHaveLength(1);
      expect(logos[0].name).toBe('Logo');
    });

    it('filters by soulId', async () => {
      await assetService.upload({
        name: 'Soul1 Logo',
        filename: 'logo1.png',
        mimeType: 'image/png',
        scope: { type: 'soul', soulId: soulId('soul-1') },
        role: 'logo',
        dataBase64: TINY_PNG_BASE64,
      });
      await assetService.upload({
        name: 'Soul2 Logo',
        filename: 'logo2.png',
        mimeType: 'image/png',
        scope: { type: 'soul', soulId: soulId('soul-2') },
        role: 'logo',
        dataBase64: TINY_PNG_BASE64,
      });

      const assets = await assetService.list({ soulId: soulId('soul-1') });
      expect(assets).toHaveLength(1);
      expect(assets[0].name).toBe('Soul1 Logo');
    });

    it('filters by deckId', async () => {
      await assetService.upload({
        name: 'Deck1 Image',
        filename: 'img1.png',
        mimeType: 'image/png',
        scope: { type: 'deck', deckId: deckId('deck-1') },
        role: 'content',
        dataBase64: TINY_PNG_BASE64,
      });
      await assetService.upload({
        name: 'Deck2 Image',
        filename: 'img2.png',
        mimeType: 'image/png',
        scope: { type: 'deck', deckId: deckId('deck-2') },
        role: 'content',
        dataBase64: TINY_PNG_BASE64,
      });

      const assets = await assetService.list({ deckId: deckId('deck-1') });
      expect(assets).toHaveLength(1);
      expect(assets[0].name).toBe('Deck1 Image');
    });
  });

  describe('delete', () => {
    it('deletes an existing asset', async () => {
      const asset = await assetService.upload({
        name: 'Logo',
        filename: 'logo.png',
        mimeType: 'image/png',
        scope: { type: 'global' },
        role: 'logo',
        dataBase64: TINY_PNG_BASE64,
      });

      const deleted = await assetService.delete(asset.id);
      expect(deleted).toBe(true);

      const retrieved = await assetService.get(asset.id);
      expect(retrieved).toBeUndefined();

      const data = await assetStore.getData(asset.id);
      expect(data).toBeUndefined();
    });

    it('returns false for non-existent asset', async () => {
      const deleted = await assetService.delete(assetId('non-existent'));
      expect(deleted).toBe(false);
    });
  });

  describe('ref', () => {
    it('builds correct ref string', () => {
      const ref = AssetService.ref(assetId('abc-123'));
      expect(ref).toBe('asset://abc-123');
    });
  });
});
