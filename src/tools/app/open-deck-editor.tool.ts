import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { DECK_EDITOR_RESOURCE_URI } from '../../resources/app-resources.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { getMcpAppsSupport } from './ui-capability.js';

export function registerOpenDeckEditorTool(server: McpServer, container: ServiceContainer): void {
  registerAppTool(
    server,
    'open_deck_editor',
    {
      title: 'Open Deck Editor',
      description:
        'Open the interactive deck editor MCP App for a deck. Works for both authoring models: ' +
        'slides decks open the slide editor with `editor_state` (thumbnails, selected slide, validation); ' +
        'document decks open the continuous-document editor and return only deck identity + authoring_model ' +
        'so the app can load sections itself. `slide_id` is honoured only for slides decks.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to open.'),
        slide_id: z
          .string()
          .nullish()
          .describe('Optional initial slide to select (slides-model decks only; ignored for document decks).'),
      }),
      _meta: {
        ui: {
          resourceUri: DECK_EDITOR_RESOURCE_URI,
          visibility: ['model'],
        },
      },
    },
    async ({ deck_id, slide_id }) => {
      try {
        const uiSupport = getMcpAppsSupport(server);
        const summary = await container.deckService.getDeckSummary(deck_id);

        if (summary.authoringModel === 'document') {
          return structuredResponse(
            {
              deck_id,
              authoring_model: 'document' as const,
              section_count: summary.sectionCount,
              app_resource_uri: DECK_EDITOR_RESOURCE_URI,
              ui_capability_detected: uiSupport.supported,
              ...(uiSupport.warning ? { warning: uiSupport.warning } : {}),
            },
            `Opening document editor for "${summary.title}"`,
            { viewUUID: randomUUID() },
          );
        }

        const editorState = await container.editorService.getEditorState(deck_id, slide_id ?? undefined);
        return structuredResponse(
          {
            deck_id,
            authoring_model: 'slides' as const,
            initial_slide_id: editorState.selectedSlide.slideId,
            app_resource_uri: DECK_EDITOR_RESOURCE_URI,
            editor_state: editorState,
            ui_capability_detected: uiSupport.supported,
            ...(uiSupport.warning ? { warning: uiSupport.warning } : {}),
          },
          `Opening deck editor for "${editorState.deck.title}"`,
          { viewUUID: randomUUID() },
        );
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
