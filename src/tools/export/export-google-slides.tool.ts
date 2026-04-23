import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { isPrintFormat } from '../../domain/formats/format-registry.js';
import { FormatNotExportableError } from '../../types/errors.js';
import {
  ensureSlidesReadyForEditableExport,
  validateSlidesForExport,
} from './export-validation.js';

export function registerExportGoogleSlidesTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'export_google_slides',
    {
      title: 'Export Google Slides',
      description: 'Create a fully editable Google Slides presentation from a deck. Requires Google API credentials via environment variables.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to export.'),
      }),
    },
    async ({ deck_id }) => {
      try {
        const summary = await container.deckService.getDeckSummary(deck_id);
        if (isPrintFormat(summary.format)) {
          throw new FormatNotExportableError(summary.format, 'export_google_slides', 'export_pdf');
        }
        const slides = await Promise.all(
          summary.slides.map((slideSummary) => container.deckService.getSlide(slideSummary.id as string)),
        );

        await validateSlidesForExport(container, deck_id, summary.soulId as string, slides);
        const editableSlides = await ensureSlidesReadyForEditableExport(container, deck_id, slides);
        const result = await container.googleSlidesExportService.export(editableSlides, summary.title);

        return textResponse({
          presentation_id: result.presentationId,
          presentation_url: result.presentationUrl,
          slide_count: result.slideCount,
          slides: result.slides,
          exported_at: result.exportedAt,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
