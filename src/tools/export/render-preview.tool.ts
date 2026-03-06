/**
 * MCP Tool: render_preview
 *
 * Renders preview thumbnails for slides in a deck.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerRenderPreviewTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'render_preview',
    {
      title: 'Render Preview',
      description: 'Render preview thumbnails for slides in a deck. Returns base64-encoded images.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to render previews for.'),
        slides: z.array(z.string()).nullish().describe('Specific slide IDs to render. If omitted, renders all slides.'),
        thumbnail_width: z.number().nullish().describe('Width of the thumbnail in pixels. Defaults to config preview width.'),
      }),
    },
    async ({ deck_id, slides: slideIds, thumbnail_width }) => {
      try {
        // Get the deck summary to retrieve slide info
        const summary = await container.deckService.getDeckSummary(deck_id);

        // Get the full slide objects
        const allSlideIds = slideIds ?? summary.slides.map((s) => s.id as string);
        const slideObjects = await Promise.all(
          allSlideIds.map((id) => container.deckService.getSlide(id)),
        );

        // Build preview options
        const previewOptions: { width?: number; height?: number } = {};
        if (thumbnail_width != null) {
          previewOptions.width = thumbnail_width;
          // Maintain 16:9 aspect ratio
          previewOptions.height = Math.round(thumbnail_width * 9 / 16);
        }

        const previews = await container.renderService.renderPreview(slideObjects, previewOptions);

        return textResponse({
          previews: previews.map((p) => ({
            slide_id: p.slideId,
            image_base64: p.imageBase64,
            position: p.position,
          })),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
