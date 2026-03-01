/**
 * MCP Tool: get_slide
 *
 * Retrieves a single slide's HTML, metadata, and position.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerGetSlideTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'get_slide',
    {
      title: 'Get Slide',
      description: 'Retrieve a single slide by ID, returning its HTML, metadata, and position.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck containing the slide.'),
        slide_id: z.string().describe('The slide to retrieve.'),
      }),
    },
    async ({ deck_id: _deck_id, slide_id }) => {
      try {
        // Verify deck exists via getSlide (slide stores deckId)
        const slide = await container.deckService.getSlide(slide_id);

        return textResponse({
          html: slide.html,
          metadata: slide.metadata,
          position: slide.position,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
