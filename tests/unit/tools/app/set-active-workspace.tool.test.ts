import { describe, expect, it, vi } from 'vitest';
import { registerSetActiveWorkspaceTool } from '../../../../src/tools/app/set-active-workspace.tool.js';

function makeServer(handler: { handler: unknown }) {
  return {
    server: { getClientCapabilities: () => undefined },
    registerTool: (_name: string, _config: unknown, cb: unknown) => {
      handler.handler = cb;
      return {} as never;
    },
  };
}

describe('registerSetActiveWorkspaceTool', () => {
  it('updates session and returns active_deck when deck_ref is set', async () => {
    const ref = { handler: undefined as unknown };
    const server = makeServer(ref);

    const session = {
      activeDeck: {
        id: 'deck-1',
        slug: 'my-deck',
        title: 'My Deck',
        format: 'slides_16_9',
        authoringModel: 'slides',
      },
      openPanels: [],
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    const container = {
      editorService: {
        setActiveWorkspace: vi.fn().mockResolvedValue(session),
      },
    };

    registerSetActiveWorkspaceTool(server as never, container as never);

    const handler = ref.handler as (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await handler({ deck_ref: 'my-deck', soul_ref: undefined, workflow: undefined, open_panels: undefined });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      active_deck: {
        id: 'deck-1',
        slug: 'my-deck',
        title: 'My Deck',
        format: 'slides_16_9',
        authoring_model: 'slides',
      },
      open_panels: [],
    });
    expect(container.editorService.setActiveWorkspace).toHaveBeenCalledWith({
      deckRef: 'my-deck',
      soulRef: undefined,
      workflow: undefined,
      openPanels: undefined,
    });
  });

  it('clears active deck when deck_ref is null', async () => {
    const ref = { handler: undefined as unknown };
    const server = makeServer(ref);

    const session = { openPanels: [], updatedAt: '2024-01-01T00:00:00.000Z' };

    const container = {
      editorService: {
        setActiveWorkspace: vi.fn().mockResolvedValue(session),
      },
    };

    registerSetActiveWorkspaceTool(server as never, container as never);

    const handler = ref.handler as (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await handler({ deck_ref: null });

    expect(result.isError).toBeUndefined();
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.active_deck).toBeUndefined();
    expect(container.editorService.setActiveWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ deckRef: null }),
    );
  });

  it('returns error response on service failure', async () => {
    const ref = { handler: undefined as unknown };
    const server = makeServer(ref);

    const container = {
      editorService: {
        setActiveWorkspace: vi.fn().mockRejectedValue(new Error('Soul not found')),
      },
    };

    registerSetActiveWorkspaceTool(server as never, container as never);

    const handler = ref.handler as (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await handler({ soul_ref: 'bad-slug' });

    expect(result.isError).toBe(true);
  });
});
