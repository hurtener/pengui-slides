/**
 * Smoke tests for registerAddCommentFromAppTool.
 *
 * Uses the same handler-extraction pattern as open-deck-editor.tool.test.ts —
 * a lightweight fake server that captures the registered callback, then
 * calls it directly. The container is mocked so this test does not depend on
 * Wave 1 domain infrastructure being present in this worktree.
 */

import { describe, expect, it, vi } from 'vitest';
import { registerAddCommentFromAppTool } from '../../../../src/tools/app/add-comment-from-app.tool.js';

describe('registerAddCommentFromAppTool', () => {
  function buildFakeServer() {
    let capturedHandler:
      | ((args: Record<string, unknown>) => Promise<Record<string, unknown>>)
      | undefined;

    const server = {
      server: {
        getClientCapabilities: () => ({
          extensions: {
            'io.modelcontextprotocol/ui': { mimeTypes: ['application/mcp-resource'] },
          },
        }),
      },
      registerTool: (
        _name: string,
        _config: unknown,
        callback: typeof capturedHandler,
      ) => {
        capturedHandler = callback;
        return {} as never;
      },
    };

    return { server, getHandler: () => capturedHandler! };
  }

  function buildFakeContainer(overrides?: Partial<{ commentService: unknown }>) {
    const defaultComment = {
      id: 'comment-001',
      deckId: 'deck-abc',
      target: { kind: 'slide', slideId: 'slide-xyz' },
      author: 'user',
      kind: 'revision',
      body: 'Please make the title larger.',
      createdAt: '2026-04-23T10:00:00.000Z',
    };

    return {
      commentService: {
        add: vi.fn().mockResolvedValue(defaultComment),
      },
      ...overrides,
    };
  }

  it('registers the handler and stores a comment with author="user"', async () => {
    const { server, getHandler } = buildFakeServer();
    const container = buildFakeContainer();

    registerAddCommentFromAppTool(server as never, container as never);

    const handler = getHandler();
    expect(handler).toBeDefined();

    const result = await handler({
      deck_id: 'deck-abc',
      target: { kind: 'slide', slide_id: 'slide-xyz' },
      kind: 'revision',
      body: 'Please make the title larger.',
    });

    expect(result.isError).toBeUndefined();
    expect(container.commentService.add).toHaveBeenCalledOnce();
    expect(container.commentService.add).toHaveBeenCalledWith({
      deckId: 'deck-abc',
      target: { kind: 'slide', slideId: 'slide-xyz' },
      author: 'user',
      kind: 'revision',
      body: 'Please make the title larger.',
    });

    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.author).toBe('user');
    expect(structured.id).toBe('comment-001');
    expect(structured.kind).toBe('revision');
  });

  it('echoes view_uuid in the response when provided', async () => {
    const { server, getHandler } = buildFakeServer();
    const container = buildFakeContainer();

    registerAddCommentFromAppTool(server as never, container as never);

    const result = await getHandler()({
      deck_id: 'deck-abc',
      target: { kind: 'slide', slide_id: 'slide-xyz' },
      kind: 'note',
      body: 'Looks good here.',
      view_uuid: 'view-uuid-123',
      scroll_snapshot: '{"scrollTop":240}',
    });

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured.view_uuid).toBe('view-uuid-123');
    expect(structured.scroll_snapshot).toBe('{"scrollTop":240}');
  });

  it('does not include view_uuid key when not provided', async () => {
    const { server, getHandler } = buildFakeServer();
    const container = buildFakeContainer();

    registerAddCommentFromAppTool(server as never, container as never);

    const result = await getHandler()({
      deck_id: 'deck-abc',
      target: { kind: 'slide', slide_id: 'slide-xyz' },
      kind: 'approval',
      body: 'Approved.',
    });

    const structured = result.structuredContent as Record<string, unknown>;
    expect(structured).not.toHaveProperty('view_uuid');
    expect(structured).not.toHaveProperty('scroll_snapshot');
  });

  it('maps element target correctly (containerId + editId)', async () => {
    const { server, getHandler } = buildFakeServer();
    const container = buildFakeContainer({
      commentService: {
        add: vi.fn().mockResolvedValue({
          id: 'comment-002',
          deckId: 'deck-abc',
          target: { kind: 'element', containerId: 'slide-xyz', editId: 'title-node' },
          author: 'user',
          kind: 'question',
          body: 'Is this font on-brand?',
          createdAt: '2026-04-23T10:01:00.000Z',
        }),
      },
    });

    registerAddCommentFromAppTool(server as never, container as never);

    await getHandler()({
      deck_id: 'deck-abc',
      target: { kind: 'element', container_id: 'slide-xyz', edit_id: 'title-node' },
      kind: 'question',
      body: 'Is this font on-brand?',
    });

    expect((container.commentService as { add: ReturnType<typeof vi.fn> }).add).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { kind: 'element', containerId: 'slide-xyz', editId: 'title-node' },
        author: 'user',
      }),
    );
  });

  it('returns an error response when commentService.add throws', async () => {
    const { server, getHandler } = buildFakeServer();
    const container = buildFakeContainer({
      commentService: {
        add: vi.fn().mockRejectedValue(Object.assign(new Error('DECK_NOT_FOUND'), {
          code: 'DECK_NOT_FOUND',
          details: {},
        })),
      },
    });

    registerAddCommentFromAppTool(server as never, container as never);

    const result = await getHandler()({
      deck_id: 'no-such-deck',
      target: { kind: 'slide', slide_id: 'slide-1' },
      kind: 'note',
      body: 'Stranded comment.',
    });

    expect(result.isError).toBe(true);
  });
});
