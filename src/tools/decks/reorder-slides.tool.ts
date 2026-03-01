/**
 * MCP Tool: reorder_slides
 *
 * Reorders the slides in a deck to match the given order.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerReorderSlidesTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'reorder_slides',
    {
      title: 'Reorder Slides',
      description: 'Reorder the slides in a deck to match the given slide ID order.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to reorder.'),
        slide_ids: z.array(z.string()).describe('The complete list of slide IDs in the desired order.'),
      }),
    },
    async ({ deck_id, slide_ids }) => {
      try {
        const deck = await container.deckService.reorderSlides(deck_id, slide_ids);

        return textResponse({
          slide_count: deck.slideIds.length,
          order: deck.slideIds,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
