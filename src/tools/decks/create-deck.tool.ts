/**
 * MCP Tool: create_deck
 *
 * Creates a new empty deck linked to a Design Soul.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerCreateDeckTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'create_deck',
    {
      title: 'Create Deck',
      description: 'Create a new empty slide deck linked to a Design Soul.',
      inputSchema: z.object({
        soul_id: z.string().describe('The ID of the Design Soul to use for this deck.'),
        title: z.string().nullish().describe('Deck title. Defaults to "Untitled Deck".'),
        author: z.string().nullish().describe('Author name.'),
      }),
    },
    async ({ soul_id, title, author }) => {
      try {
        const deck = await container.deckService.createDeck({
          soulId: soul_id,
          title: title ?? undefined,
          author: author ?? undefined,
        });

        return textResponse({
          deck_id: deck.id,
          soul_id: deck.soulId,
          slide_count: 0,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
