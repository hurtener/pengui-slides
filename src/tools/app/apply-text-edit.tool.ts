import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { DECK_EDITOR_RESOURCE_URI } from '../../resources/app-resources.js';
import { handleToolError } from '../_shared/error-handler.js';
import { structuredErrorResponse, structuredResponse } from '../_shared/responses.js';
import { SlideRevisionConflictError } from '../../types/errors.js';

export function registerApplyTextEditTool(server: McpServer, container: ServiceContainer): void {
  registerAppTool(
    server,
    'apply_text_edit',
    {
      title: 'Apply Text Edit',
      description: 'Apply a plain-text edit to an editable slide node and return refreshed editor state.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck containing the slide.'),
        slide_id: z.string().describe('The slide to update.'),
        edit_id: z.string().describe('The stable data-edit-id of the target text node.'),
        text: z.string().describe('Replacement plain text for the target node.'),
        expected_revision_hash: z.string().describe('The last revision hash seen by the app.'),
      }),
      _meta: {
        ui: {
          resourceUri: DECK_EDITOR_RESOURCE_URI,
          visibility: ['app'],
        },
      },
    },
    async ({ deck_id, slide_id, edit_id, text, expected_revision_hash }) => {
      try {
        const editorState = await container.editorService.applyTextEdit({
          deckId: deck_id,
          slideId: slide_id,
          editId: edit_id,
          text,
          expectedRevisionHash: expected_revision_hash,
        });

        return structuredResponse(
          { editor_state: editorState },
          `Updated text on slide "${editorState.selectedSlide.metadata.title}"`,
        );
      } catch (error) {
        if (error instanceof SlideRevisionConflictError) {
          const latestState = await container.editorService.getEditorState(deck_id, slide_id);
          return structuredErrorResponse(
            error.message,
            error.code,
            {
              conflict: true,
              editor_state: latestState,
            },
          );
        }

        return handleToolError(error);
      }
    },
  );
}
