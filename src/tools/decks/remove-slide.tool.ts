/**
 * MCP Tool: remove_slide
 *
 * Removes a slide from a deck and deletes it.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerRemoveSlideTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'remove_slide',
    {
      title: 'Remove Slide',
      description: 'Remove a slide from a deck and delete it.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck containing the slide.'),
        slide_id: z.string().describe('The slide to remove.'),
      }),
    },
    async ({ deck_id, slide_id }) => {
      try {
        await container.deckService.removeSlide(deck_id, slide_id);

        // Get updated deck info
        const deck = await container.deckService.getDeckSummary(deck_id);

        return textResponse({
          removed: true,
          slide_count: deck.slideCount,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
