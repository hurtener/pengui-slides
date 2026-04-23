/**
 * MCP Tool: render_preview
 *
 * Renders preview thumbnails for slides in a deck. Thumbnail dimensions
 * are derived from the deck's format geometry so print decks produce
 * portrait thumbnails and slide decks produce 16:9 thumbnails.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { getFormat } from '../../domain/formats/format-registry.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { FormatNotExportableError } from '../../types/errors.js';

/** Target thumbnail short-edge in pixels. Width for landscape, height for portrait. */
const THUMBNAIL_SHORT_EDGE = 270;

export function registerRenderPreviewTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'render_preview',
    {
      title: 'Render Preview',
      description:
        'Render preview thumbnails for slides in a slide-model deck. Returns base64-encoded images. ' +
        'ONLY applies to decks with authoringModel="slides" — document-model decks have no per-slide ' +
        'frame (sections compose into a flowing document), so this tool raises FormatNotExportableError ' +
        'naming export_pdf instead. For document decks, use export_pdf to render the full document.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to render previews for.'),
        slides: z.array(z.string()).nullish().describe('Specific slide IDs to render. If omitted, renders all slides.'),
        thumbnail_width: z.number().nullish().describe('Width of the thumbnail in pixels. Defaults to a format-appropriate size.'),
      }),
    },
    async ({ deck_id, slides: slideIds, thumbnail_width }) => {
      try {
        const summary = await container.deckService.getDeckSummary(deck_id);
        if (summary.authoringModel === 'document') {
          throw new FormatNotExportableError(
            summary.format,
            'render_preview',
            'export_pdf',
          );
        }
        const format = getFormat(summary.format);
        const { widthPx, heightPx, thumbnailAspect } = format.geometry;

        // Derive thumbnail dimensions from the format's thumbnail aspect ratio.
        // When the caller overrides width, preserve the format's aspect ratio for height.
        let thumbWidth: number;
        let thumbHeight: number;
        if (thumbnail_width != null) {
          thumbWidth = thumbnail_width;
          thumbHeight = Math.round(thumbnail_width / thumbnailAspect);
        } else {
          // For landscape (slides): THUMBNAIL_SHORT_EDGE is the height.
          // For portrait (print): THUMBNAIL_SHORT_EDGE is still the height, giving a
          // narrower portrait thumbnail (~192px wide for A4, ~196px wide for Letter).
          thumbHeight = THUMBNAIL_SHORT_EDGE;
          thumbWidth = Math.round(THUMBNAIL_SHORT_EDGE * thumbnailAspect);
        }

        const allSlideIds = slideIds ?? summary.slides.map((s) => s.id as string);
        const slideObjects = await Promise.all(
          allSlideIds.map((id) => container.deckService.getSlide(id)),
        );

        const previews = await container.renderService.renderPreview(slideObjects, {
          width: thumbWidth,
          height: thumbHeight,
          nativeWidth: widthPx,
          nativeHeight: heightPx,
        });

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
