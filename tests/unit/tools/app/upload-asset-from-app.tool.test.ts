import { describe, expect, it, vi } from 'vitest';
import { registerUploadAssetFromAppTool } from '../../../../src/tools/app/upload-asset-from-app.tool.js';

function makeServer(handler: { handler: unknown }) {
  return {
    server: { getClientCapabilities: () => undefined },
    registerTool: (_name: string, _config: unknown, cb: unknown) => {
      handler.handler = cb;
      return {} as never;
    },
  };
}

// 1x1 transparent PNG in base64 — tiny, well under 5 MB
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('registerUploadAssetFromAppTool', () => {
  it('uploads a small PNG and returns the asset ref', async () => {
    const ref = { handler: undefined as unknown };
    const server = makeServer(ref);

    const asset = {
      id: 'asset-123',
      name: 'Test Image',
      mimeType: 'image/png',
      sizeBytes: 68,
      scope: { type: 'global' },
      role: 'content',
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    const container = {
      assetService: {
        upload: vi.fn().mockResolvedValue(asset),
      },
      soulService: { resolveRefOrThrow: vi.fn() },
      deckService: { resolveRefOrThrow: vi.fn() },
    };

    registerUploadAssetFromAppTool(server as never, container as never);

    const handler = ref.handler as (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await handler({
      data_base64: TINY_PNG_BASE64,
      mime_type: 'image/png',
      scope: { type: 'global' },
      role: 'content',
      label: 'Test Image',
    });

    expect(result.isError).toBeUndefined();
    const content = result.structuredContent as { asset: Record<string, unknown> };
    expect(content.asset.ref).toBe('asset://asset-123');
    expect(content.asset.asset_id).toBe('asset-123');
    expect(content.asset.mime_type).toBe('image/png');
    expect(container.assetService.upload).toHaveBeenCalledOnce();
  });

  it('rejects payloads exceeding 5 MB', async () => {
    const ref = { handler: undefined as unknown };
    const server = makeServer(ref);

    const container = {
      assetService: { upload: vi.fn() },
      soulService: { resolveRefOrThrow: vi.fn() },
      deckService: { resolveRefOrThrow: vi.fn() },
    };

    registerUploadAssetFromAppTool(server as never, container as never);

    const handler = ref.handler as (args: Record<string, unknown>) => Promise<Record<string, unknown>>;

    // Build a >5 MB base64 string (5.1 MB of raw bytes)
    const bigBuffer = Buffer.alloc(5 * 1024 * 1024 + 1024, 0);
    const bigBase64 = bigBuffer.toString('base64');

    const result = await handler({
      data_base64: bigBase64,
      mime_type: 'image/png',
      scope: { type: 'global' },
      role: 'content',
    });

    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0].text).toContain('5 MB');
    expect(container.assetService.upload).not.toHaveBeenCalled();
  });

  it('resolves soul_ref to canonical ID for soul scope', async () => {
    const ref = { handler: undefined as unknown };
    const server = makeServer(ref);

    const asset = {
      id: 'asset-999',
      name: 'Logo',
      mimeType: 'image/svg+xml',
      sizeBytes: 100,
      scope: { type: 'soul', soulId: 'soul-abc' },
      role: 'logo',
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    const container = {
      assetService: { upload: vi.fn().mockResolvedValue(asset) },
      soulService: { resolveRefOrThrow: vi.fn().mockResolvedValue('soul-abc') },
      deckService: { resolveRefOrThrow: vi.fn() },
    };

    registerUploadAssetFromAppTool(server as never, container as never);

    const handler = ref.handler as (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await handler({
      data_base64: TINY_PNG_BASE64,
      mime_type: 'image/svg+xml',
      scope: { type: 'soul', soul_ref: 'my-soul' },
      role: 'logo',
    });

    expect(result.isError).toBeUndefined();
    expect(container.soulService.resolveRefOrThrow).toHaveBeenCalledWith('my-soul');
  });
});
