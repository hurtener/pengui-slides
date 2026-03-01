/**
 * MCP Tool: get_deck_summary
 *
 * Returns a lightweight summary of a deck (no HTML bodies).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerGetDeckSummaryTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'get_deck_summary',
    {
      title: 'Get Deck Summary',
      description: 'Get a lightweight summary of a deck including slide metadata (no HTML bodies).',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to summarise.'),
      }),
    },
    async ({ deck_id }) => {
      try {
        const summary = await container.deckService.getDeckSummary(deck_id);

        return textResponse(summary);
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
