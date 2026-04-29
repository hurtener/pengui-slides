/**
 * MCP Tool: get_slide
 *
 * Retrieves a single slide's HTML, metadata, and position.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { SlideNotFoundError } from '../../types/errors.js';

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
    async ({ deck_id, slide_id }) => {
      try {
        const slide = await container.deckService.getSlide(slide_id);
        if ((slide.deckId as string) !== deck_id) {
          throw new SlideNotFoundError(slide_id);
        }

        // structuredResponse exposes the payload to App callers via
        // structuredContent (the v4.9e morph flow needs slide.ir at
        // runtime to compose the new node). The text content keeps the
        // pretty-printed JSON for human / agent consumers.
        return structuredResponse({
          html: slide.html,
          ir: slide.ir,
          source_kind: slide.sourceKind,
          document: slide.document,
          translation_issues: slide.translationIssues,
          metadata: slide.metadata,
          position: slide.position,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
