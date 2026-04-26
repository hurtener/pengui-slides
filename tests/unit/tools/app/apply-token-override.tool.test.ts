import { describe, expect, it, vi } from 'vitest';
import { registerApplyTokenOverrideTool } from '../../../../src/tools/app/apply-token-override.tool.js';

function makeServer(handler: { handler: unknown }) {
  return {
    server: { getClientCapabilities: () => undefined },
    registerTool: (_name: string, _config: unknown, cb: unknown) => {
      handler.handler = cb;
      return {} as never;
    },
  };
}

describe('registerApplyTokenOverrideTool', () => {
  it('calls applyTokenOverride and returns updated soul summary', async () => {
    const ref = { handler: undefined as unknown };
    const server = makeServer(ref);

    const updatedSoul = {
      id: 'soul-1',
      slug: 'my-soul',
      name: 'My Soul',
      status: 'approved',
      cssTokens: ':root { --color-accent-primary: #ff0000; }',
      allowedFonts: ['Inter'],
      updatedAt: '2024-06-01T00:00:00.000Z',
    };

    const container = {
      soulService: {
        resolveRefOrThrow: vi.fn().mockResolvedValue('soul-1'),
        applyTokenOverride: vi.fn().mockResolvedValue(updatedSoul),
      },
      deckService: {
        recompileSlidesForSoul: vi
          .fn()
          .mockResolvedValue({ recompiledCount: 3, skippedCount: 1, failures: [] }),
      },
    };

    registerApplyTokenOverrideTool(server as never, container as never);

    const handler = ref.handler as (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await handler({
      soul_ref: 'my-soul',
      layer: 'color',
      token_name: 'accentPrimary',
      value: '#ff0000',
    });

    expect(result.isError).toBeUndefined();
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.soul_id).toBe('soul-1');
    expect(content.layer).toBe('color');
    expect(content.token_name).toBe('accentPrimary');
    expect(content.new_value).toBe('#ff0000');
    expect(content.allowed_fonts).toEqual(['Inter']);
    const recompile = content.recompile as Record<string, unknown>;
    expect(recompile.slides_updated).toBe(3);
    expect(recompile.slides_skipped).toBe(1);

    expect(container.soulService.resolveRefOrThrow).toHaveBeenCalledWith('my-soul');
    expect(container.soulService.applyTokenOverride).toHaveBeenCalledWith(
      'soul-1',
      'color',
      'accentPrimary',
      '#ff0000',
    );
    expect(container.deckService.recompileSlidesForSoul).toHaveBeenCalledWith('soul-1');
  });

  it('returns error response when soul is not found', async () => {
    const ref = { handler: undefined as unknown };
    const server = makeServer(ref);

    const container = {
      soulService: {
        resolveRefOrThrow: vi.fn().mockRejectedValue(new Error('Soul not found: bad-ref')),
        applyTokenOverride: vi.fn(),
      },
    };

    registerApplyTokenOverrideTool(server as never, container as never);

    const handler = ref.handler as (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await handler({
      soul_ref: 'bad-ref',
      layer: 'color',
      token_name: 'canvas',
      value: '#fff',
    });

    expect(result.isError).toBe(true);
  });
});
