/**
 * MCP Tool: create_deck
 *
 * Creates a new empty deck linked to a Design Soul. Accepts an optional
 * output format — slides_16_9 (default) for 16:9 presentations, or one
 * of the print formats (A4 / Letter portrait) for PDF-only study docs.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { DEFAULT_FORMAT } from '../../domain/formats/format-registry.js';

export function registerCreateDeckTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'create_deck',
    {
      title: 'Create Deck',
      description:
        'Create a new empty deck linked to a Design Soul. For 16:9 presentations use format "slides_16_9" (default). For printable PDF documents (study summaries, handouts) use "print_a4_portrait" or "print_letter_portrait" — print decks are PDF-only.',
      inputSchema: z.object({
        soul_id: z.string().describe('The ID of the Design Soul to use for this deck.'),
        title: z.string().nullish().describe('Deck title. Defaults to "Untitled Deck".'),
        author: z.string().nullish().describe('Author name.'),
        format: z
          .enum(['slides_16_9', 'print_a4_portrait', 'print_letter_portrait'])
          .nullish()
          .describe(
            'Output format. slides_16_9 = 1920×1080 presentation (PPTX / PDF / HTML / Google Slides). print_a4_portrait / print_letter_portrait = printable PDF document (PDF-only). Defaults to slides_16_9.',
          ),
      }),
    },
    async ({ soul_id, title, author, format }) => {
      try {
        const deck = await container.deckService.createDeck({
          soulId: soul_id,
          title: title ?? undefined,
          author: author ?? undefined,
          format: format ?? DEFAULT_FORMAT,
        });

        return textResponse({
          deck_id: deck.id,
          soul_id: deck.soulId,
          format: deck.format,
          slide_count: 0,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
