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
        'Create a new empty deck linked to a Design Soul. The deck FORMAT determines geometry + authoring model: slides_16_9 → 1920×1080 presentation (default, authoringModel="slides", PPTX/PDF/HTML/Google Slides). print_a4_portrait / print_letter_portrait → continuous-document PDF (v3 default: authoringModel="document", use add_section not add_slide). Opt into the legacy slide-per-page print flow by passing authoringModel="slides" explicitly. Read pengui://docs/document-mode before authoring print decks in v3 mode, or pengui://docs/print-mode for the legacy per-slide flow.',
      inputSchema: z.object({
        soul_id: z.string().describe('The Design Soul to use for this deck. Accepts UUID or slug.'),
        title: z.string().nullish().describe('Deck title. Defaults to "Untitled Deck".'),
        author: z.string().nullish().describe('Author name.'),
        format: z
          .enum(['slides_16_9', 'print_a4_portrait', 'print_letter_portrait'])
          .nullish()
          .describe(
            'Output format. slides_16_9 = 1920×1080 presentation (PPTX / PDF / HTML / Google Slides). print_a4_portrait / print_letter_portrait = printable PDF document (PDF-only). Defaults to slides_16_9.',
          ),
        authoring_model: z
          .enum(['slides', 'document'])
          .nullish()
          .describe(
            'Override the authoring pipeline. Omit to use the format default: slides_16_9→slides, print formats→document. Pass "slides" on a print format to author legacy slide-per-page print decks (not recommended for new work).',
          ),
      }),
    },
    async ({ soul_id, title, author, format, authoring_model }) => {
      try {
        const deck = await container.deckService.createDeck({
          soulId: soul_id,
          title: title ?? undefined,
          author: author ?? undefined,
          format: format ?? DEFAULT_FORMAT,
          authoringModel: authoring_model ?? undefined,
        });

        return textResponse({
          deck_id: deck.id,
          slug: deck.slug,
          soul_id: deck.soulId,
          format: deck.format,
          authoring_model: deck.authoringModel,
          slide_count: 0,
          section_count: 0,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
