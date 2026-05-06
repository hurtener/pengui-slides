/**
 * MCP Tool: set_deck_chrome
 *
 * v4.18 — set or clear the deck-level chrome (header/footer regions
 * that render on every slide). Slides-mode only — document-mode decks
 * use update_document_meta for their @page-chrome directive.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { DeckChromeSchema } from '../../domain/ir/chrome.js';

export function registerSetDeckChromeTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'set_deck_chrome',
    {
      title: 'Set Deck Chrome',
      description:
        'Set or clear the deck-level chrome (header/footer regions that render on every slide). ' +
        'Pass `chrome: null` to clear chrome entirely. Slides-mode only — document-mode decks use ' +
        'update_document_meta for their @page-chrome directive. Recompiles all authored-IR slides.',
      inputSchema: z.object({
        deck_id: z.string().describe('The slides-mode deck to configure.'),
        chrome: DeckChromeSchema.nullable().describe(
          'Full DeckChrome object (header / footer / showOnCover) or `null` to clear.',
        ),
      }),
    },
    async ({ deck_id, chrome }) => {
      try {
        const deck = await container.deckService.setDeckChrome(deck_id, chrome);
        return structuredResponse({
          deck_id: deck.id as string,
          chrome: deck.chrome ?? null,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
