import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { DECK_EDITOR_RESOURCE_URI } from '../../resources/app-resources.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerGetEditorStateTool(server: McpServer, container: ServiceContainer): void {
  registerAppTool(
    server,
    'get_editor_state',
    {
      title: 'Get Editor State',
      description: 'Fetch the latest interactive editor state for a deck and selected slide.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to inspect.'),
        slide_id: z.string().nullish().describe('Optional slide to select. Defaults to the first slide.'),
      }),
      _meta: {
        ui: {
          resourceUri: DECK_EDITOR_RESOURCE_URI,
          visibility: ['app'],
        },
      },
    },
    async ({ deck_id, slide_id }) => {
      try {
        const editorState = await container.editorService.getEditorState(deck_id, slide_id ?? undefined);
        return structuredResponse(
          { editor_state: editorState },
          `Loaded editor state for "${editorState.deck.title}"`,
        );
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
