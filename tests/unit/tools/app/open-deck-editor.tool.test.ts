import { describe, expect, it, vi } from 'vitest';
import { registerOpenDeckEditorTool } from '../../../../src/tools/app/open-deck-editor.tool.js';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';

describe('registerOpenDeckEditorTool', () => {
  it('still opens the app when MCP Apps support cannot be confirmed from capabilities', async () => {
    let handler:
      | ((args: { deck_id: string; slide_id?: string | null }) => Promise<Record<string, unknown>>)
      | undefined;

    const server = {
      server: {
        getClientCapabilities: () => undefined,
      },
      registerTool: (_name: string, _config: unknown, callback: typeof handler) => {
        handler = callback;
        return {} as never;
      },
    };

    const editorState = {
      deck: { id: 'deck-1', title: 'Deck', slideCount: 1, slides: [] },
      selectedSlide: {
        slideId: 'slide-1',
        position: 0,
        html: '<section class="slide">Hello</section>',
        metadata: { title: 'Slide', type: 'content', revisionHash: 'rev-1' },
        lastValidation: null,
        validationPresentation: {
          status: 'unvalidated',
          headline: 'This slide has not been validated yet.',
          blockingCount: 0,
          introducedCount: 0,
          preExistingCount: 0,
          resolvedCount: 0,
          topBlockers: [],
          topPreExisting: [],
          showTechnicalDetailsAvailable: false,
        },
        validationDelta: {
          introducedIssues: [],
          resolvedIssues: [],
          preExistingIssues: [],
          blockingIssues: [],
          status: 'unvalidated',
          summary: 'This slide has not been validated yet.',
        },
        revisionHash: 'rev-1',
      },
      thumbnails: [],
      selectedPreview: {
        slideId: 'slide-1',
        position: 0,
        title: 'Slide',
        type: 'content',
        imageBase64: '',
        isValid: false,
        health: 'needs_attention',
        hasNewIssues: false,
        blockingCount: 0,
        validationPresentation: {
          status: 'unvalidated',
          headline: 'This slide has not been validated yet.',
          blockingCount: 0,
          introducedCount: 0,
          preExistingCount: 0,
          resolvedCount: 0,
          topBlockers: [],
          topPreExisting: [],
          showTechnicalDetailsAvailable: false,
        },
      },
    };

    const container = {
      deckService: {
        getDeckSummary: vi.fn().mockResolvedValue({
          id: 'deck-1',
          title: 'Deck',
          authoringModel: 'slides',
          slideCount: 1,
          sectionCount: 0,
        }),
      },
      editorService: {
        getEditorState: vi.fn().mockResolvedValue(editorState),
      },
    };

    registerOpenDeckEditorTool(server as never, container as never);

    const result = await handler!({ deck_id: 'deck-1' });

    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({
      deck_id: 'deck-1',
      authoring_model: 'slides',
      initial_slide_id: 'slide-1',
      app_resource_uri: 'ui://deck-editor/index.html',
      editor_state: editorState,
      ui_capability_detected: false,
      warning: 'MCP Apps support could not be confirmed from client capabilities. Some SDK versions omit extensions during initialize parsing, so the app launch will proceed without a hard block.',
    });
    expect(container.editorService.getEditorState).toHaveBeenCalledWith('deck-1', undefined);
  });

  it('opens cleanly without a warning when the UI capability is present', async () => {
    let handler:
      | ((args: { deck_id: string; slide_id?: string | null }) => Promise<Record<string, unknown>>)
      | undefined;

    const server = {
      server: {
        getClientCapabilities: () => ({
          extensions: {
            'io.modelcontextprotocol/ui': {
              mimeTypes: [RESOURCE_MIME_TYPE],
            },
          },
        }),
      },
      registerTool: (_name: string, _config: unknown, callback: typeof handler) => {
        handler = callback;
        return {} as never;
      },
    };

    const container = {
      deckService: {
        getDeckSummary: vi.fn().mockResolvedValue({
          id: 'deck-1',
          title: 'Deck',
          authoringModel: 'slides',
          slideCount: 1,
          sectionCount: 0,
        }),
      },
      editorService: {
        getEditorState: vi.fn().mockResolvedValue({
          deck: { id: 'deck-1', title: 'Deck', slideCount: 1, slides: [] },
          selectedSlide: {
            slideId: 'slide-1',
            position: 0,
            html: '<section class="slide">Hello</section>',
            metadata: { title: 'Slide', type: 'content', revisionHash: 'rev-1' },
            lastValidation: null,
            validationPresentation: {
              status: 'clean',
              headline: 'This slide is ready.',
              blockingCount: 0,
              introducedCount: 0,
              preExistingCount: 0,
              resolvedCount: 0,
              topBlockers: [],
              topPreExisting: [],
              showTechnicalDetailsAvailable: false,
            },
            validationDelta: {
              introducedIssues: [],
              resolvedIssues: [],
              preExistingIssues: [],
              blockingIssues: [],
              status: 'clean',
              summary: 'No issues introduced by this edit.',
            },
            revisionHash: 'rev-1',
          },
          thumbnails: [],
          selectedPreview: {
            slideId: 'slide-1',
            position: 0,
            title: 'Slide',
            type: 'content',
            imageBase64: '',
            isValid: false,
            health: 'clean',
            hasNewIssues: false,
            blockingCount: 0,
            validationPresentation: {
              status: 'clean',
              headline: 'This slide is ready.',
              blockingCount: 0,
              introducedCount: 0,
              preExistingCount: 0,
              resolvedCount: 0,
              topBlockers: [],
              topPreExisting: [],
              showTechnicalDetailsAvailable: false,
            },
          },
        }),
      },
    };

    registerOpenDeckEditorTool(server as never, container as never);

    const result = await handler!({ deck_id: 'deck-1' });

    expect(result.structuredContent?.ui_capability_detected).toBe(true);
    expect(result.structuredContent?.warning).toBeUndefined();
  });

  it('opens document-mode decks without calling the slide-centric editor state builder', async () => {
    let handler:
      | ((args: { deck_id: string; slide_id?: string | null }) => Promise<Record<string, unknown>>)
      | undefined;

    const server = {
      server: {
        getClientCapabilities: () => ({
          extensions: {
            'io.modelcontextprotocol/ui': {
              mimeTypes: [RESOURCE_MIME_TYPE],
            },
          },
        }),
      },
      registerTool: (_name: string, _config: unknown, callback: typeof handler) => {
        handler = callback;
        return {} as never;
      },
    };

    const container = {
      deckService: {
        getDeckSummary: vi.fn().mockResolvedValue({
          id: 'doc-deck',
          title: 'Química Cosmética — Cuadros Sinópticos',
          authoringModel: 'document',
          slideCount: 0,
          sectionCount: 22,
        }),
      },
      editorService: {
        getEditorState: vi.fn(),
      },
    };

    registerOpenDeckEditorTool(server as never, container as never);

    const result = await handler!({ deck_id: 'doc-deck' });

    expect(result.isError).toBeUndefined();
    expect(container.editorService.getEditorState).not.toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({
      deck_id: 'doc-deck',
      authoring_model: 'document',
      section_count: 22,
      app_resource_uri: 'ui://deck-editor/index.html',
      ui_capability_detected: true,
    });
    expect(result.structuredContent).not.toHaveProperty('editor_state');
    expect(result.structuredContent).not.toHaveProperty('initial_slide_id');
  });
});
