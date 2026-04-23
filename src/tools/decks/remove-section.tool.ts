/**
 * MCP Tool: remove_section
 *
 * Removes a section from a document-mode deck and deletes it.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerRemoveSectionTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'remove_section',
    {
      title: 'Remove Section',
      description: 'Remove a section from a document-mode deck and delete it.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck containing the section.'),
        section_id: z.string().describe('The section to remove.'),
      }),
    },
    async ({ deck_id, section_id }) => {
      try {
        await container.documentService.removeSection(deck_id, section_id);

        const deck = await container.deckService.getDeckSummary(deck_id);

        return textResponse({
          removed: true,
          section_count: deck.sectionCount,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
