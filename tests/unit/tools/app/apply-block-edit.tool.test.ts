import { describe, expect, it, vi } from 'vitest';
import { registerApplyBlockEditTool } from '../../../../src/tools/app/apply-block-edit.tool.js';

function makeServer(handler: { handler: unknown }) {
  return {
    server: { getClientCapabilities: () => undefined },
    registerTool: (_name: string, _config: unknown, cb: unknown) => {
      handler.handler = cb;
      return {} as never;
    },
  };
}

const STUB_SECTION = {
  id: 'sec-1',
  deckId: 'deck-1',
  position: 0,
  html: '<section class="pengui-section pengui-prose"><p>Hello</p></section>',
  kind: 'prose',
  breakHints: {},
  metadata: { title: 'Intro', kind: 'prose', narrative: '', generatedAt: '', soulId: '', deckId: 'deck-1', position: 0, metaVersion: '3.0', revisionHash: 'abc' },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
};

const STUB_SUMMARY = {
  id: 'deck-1',
  title: 'Test Doc',
  format: 'a4',
  authoringModel: 'document',
  slides: [],
  slideCount: 0,
};

describe('registerApplyBlockEditTool', () => {
  it('kind=section_kind — updates section kind', async () => {
    const ref = { handler: undefined as unknown };
    const server = makeServer(ref);

    const container = {
      documentService: {
        updateSection: vi.fn().mockResolvedValue({ ...STUB_SECTION, kind: 'callout', metadata: { ...STUB_SECTION.metadata, kind: 'callout' } }),
      },
      deckService: {
        getDeckSummary: vi.fn().mockResolvedValue(STUB_SUMMARY),
      },
    };

    registerApplyBlockEditTool(server as never, container as never);

    const handler = ref.handler as (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await handler({
      kind: 'section_kind',
      deck_ref: 'deck-1',
      section_id: 'sec-1',
      new_kind: 'callout',
    });

    expect(result.isError).toBeUndefined();
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.deck).toBeDefined();
    expect(content.section).toBeDefined();
    expect((content.section as Record<string, unknown>).kind).toBe('callout');
    expect(container.documentService.updateSection).toHaveBeenCalledWith({
      deckId: 'deck-1',
      sectionId: 'sec-1',
      kind: 'callout',
    });
  });

  it('kind=break_hints — updates break hints', async () => {
    const ref = { handler: undefined as unknown };
    const server = makeServer(ref);

    const container = {
      documentService: {
        updateSection: vi.fn().mockResolvedValue({
          ...STUB_SECTION,
          breakHints: { breakBefore: 'page', keepTogether: true },
        }),
      },
      deckService: {
        getDeckSummary: vi.fn().mockResolvedValue(STUB_SUMMARY),
      },
    };

    registerApplyBlockEditTool(server as never, container as never);

    const handler = ref.handler as (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await handler({
      kind: 'break_hints',
      deck_ref: 'deck-1',
      section_id: 'sec-1',
      hints: { break_before: 'page', keep_together: true },
    });

    expect(result.isError).toBeUndefined();
    expect(container.documentService.updateSection).toHaveBeenCalledWith(
      expect.objectContaining({
        deckId: 'deck-1',
        sectionId: 'sec-1',
        breakHints: { breakBefore: 'page', keepTogether: true },
      }),
    );
  });

  it('kind=chrome_config — updates document chrome meta', async () => {
    const ref = { handler: undefined as unknown };
    const server = makeServer(ref);

    const container = {
      documentService: {
        updateDocumentMeta: vi.fn().mockResolvedValue({ id: 'deck-1' }),
      },
      deckService: {
        getDeckSummary: vi.fn().mockResolvedValue(STUB_SUMMARY),
      },
    };

    registerApplyBlockEditTool(server as never, container as never);

    const handler = ref.handler as (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await handler({
      kind: 'chrome_config',
      deck_ref: 'deck-1',
      chrome: { pageNumber: true, runningTitle: 'My Doc' },
    });

    expect(result.isError).toBeUndefined();
    expect(container.documentService.updateDocumentMeta).toHaveBeenCalledWith('deck-1', {
      chrome: { pageNumber: true, runningTitle: 'My Doc' },
    });
    const content = result.structuredContent as Record<string, unknown>;
    expect(content.deck).toBeDefined();
  });

  it('returns error response on service failure', async () => {
    const ref = { handler: undefined as unknown };
    const server = makeServer(ref);

    const container = {
      documentService: {
        updateSection: vi.fn().mockRejectedValue(new Error('Section not found')),
      },
      deckService: {
        getDeckSummary: vi.fn().mockResolvedValue(STUB_SUMMARY),
      },
    };

    registerApplyBlockEditTool(server as never, container as never);

    const handler = ref.handler as (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await handler({
      kind: 'section_kind',
      deck_ref: 'deck-1',
      section_id: 'missing-sec',
      new_kind: 'prose',
    });

    expect(result.isError).toBe(true);
  });
});
