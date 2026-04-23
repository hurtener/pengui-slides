/**
 * MCP Tool: reorder_sections
 *
 * Reorders the sections in a document-mode deck.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerReorderSectionsTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'reorder_sections',
    {
      title: 'Reorder Sections',
      description:
        'Reorder the sections in a document-mode deck to match the given section ID order.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to reorder.'),
        new_order: z
          .array(z.string())
          .describe('The complete list of section IDs in the desired order.'),
      }),
    },
    async ({ deck_id, new_order }) => {
      try {
        const deck = await container.documentService.reorderSections(deck_id, new_order);

        return textResponse({
          section_count: deck.sectionIds.length,
          order: deck.sectionIds,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
