import { describe, it, expect, beforeEach } from 'vitest';
import { resolveAssetRefs } from '../../../../src/domain/assets/asset-resolver.js';
import { AssetService } from '../../../../src/domain/assets/asset-service.js';
import { InMemoryAssetStore } from '../../../../src/storage/memory/asset-store.js';
import { FixedClock } from '../../../../src/infrastructure/clock.js';
import { Logger } from '../../../../src/infrastructure/logger.js';

// A tiny 1x1 red PNG pixel as base64
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

describe('resolveAssetRefs', () => {
  let assetService: AssetService;
  let assetStore: InMemoryAssetStore;

  beforeEach(() => {
    assetStore = new InMemoryAssetStore();
    const clock = new FixedClock('2026-01-15T12:00:00.000Z');
    const logger = new Logger('test', 'error');
    assetService = new AssetService(assetStore, clock, logger);
  });

  it('returns HTML unchanged when no asset refs present', async () => {
    const html = '<div><img src="https://example.com/img.png"></div>';
    const result = await resolveAssetRefs(html, assetService);
    expect(result).toBe(html);
  });

  it('resolves a single asset://UUID ref to a data URI', async () => {
    const asset = await assetService.upload({
      name: 'Logo',
      filename: 'logo.png',
      mimeType: 'image/png',
      scope: { type: 'global' },
      role: 'logo',
      dataBase64: TINY_PNG_BASE64,
    });

    const html = `<img src="asset://${asset.id}" class="logo">`;
    const result = await resolveAssetRefs(html, assetService);

    expect(result).toMatch(/^<img src="data:image\/png;base64,[A-Za-z0-9+/=]+" class="logo">$/);
    expect(result).not.toContain('asset://');
  });

  it('resolves multiple asset refs in one HTML string', async () => {
    const asset1 = await assetService.upload({
      name: 'Logo',
      filename: 'logo.png',
      mimeType: 'image/png',
      scope: { type: 'global' },
      role: 'logo',
      dataBase64: TINY_PNG_BASE64,
    });
    const asset2 = await assetService.upload({
      name: 'Photo',
      filename: 'photo.png',
      mimeType: 'image/png',
      scope: { type: 'global' },
      role: 'content',
      dataBase64: TINY_PNG_BASE64,
    });

    const html = `<div>
      <img src="asset://${asset1.id}">
      <img src="asset://${asset2.id}">
    </div>`;

    const result = await resolveAssetRefs(html, assetService);

    expect(result).not.toContain('asset://');
    // Both should be replaced with data URIs
    const matches = result.match(/data:image\/png;base64,/g);
    expect(matches).toHaveLength(2);
  });

  it('leaves unknown asset IDs unchanged', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const html = `<img src="asset://${fakeId}">`;
    const result = await resolveAssetRefs(html, assetService);

    expect(result).toBe(html);
  });

  it('handles mixed content — only resolves asset refs', async () => {
    const asset = await assetService.upload({
      name: 'Logo',
      filename: 'logo.png',
      mimeType: 'image/png',
      scope: { type: 'global' },
      role: 'logo',
      dataBase64: TINY_PNG_BASE64,
    });

    const html = `<div>
      <img src="https://example.com/other.png">
      <img src="asset://${asset.id}" class="logo">
      <p>Some text</p>
    </div>`;

    const result = await resolveAssetRefs(html, assetService);

    expect(result).toContain('https://example.com/other.png');
    expect(result).not.toContain('asset://');
    expect(result).toContain('data:image/png;base64,');
    expect(result).toContain('Some text');
  });

  it('handles duplicate refs efficiently', async () => {
    const asset = await assetService.upload({
      name: 'Logo',
      filename: 'logo.png',
      mimeType: 'image/png',
      scope: { type: 'global' },
      role: 'logo',
      dataBase64: TINY_PNG_BASE64,
    });

    const html = `<div>
      <img src="asset://${asset.id}">
      <img src="asset://${asset.id}">
    </div>`;

    const result = await resolveAssetRefs(html, assetService);

    expect(result).not.toContain('asset://');
    const matches = result.match(/data:image\/png;base64,/g);
    expect(matches).toHaveLength(2);
  });
});
