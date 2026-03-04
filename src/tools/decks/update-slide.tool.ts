/**
 * MCP Tool: update_slide
 *
 * Updates a slide's HTML and/or metadata. Re-validates if HTML changed.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { soulId } from '../../types/common.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

const dataPointSchema = z.object({
  label: z.string().describe('Label for the data point.'),
  value: z.union([z.string(), z.number()]).describe('Value of the data point.'),
  unit: z.string().optional().describe('Unit of measurement.'),
  source: z.string().optional().describe('Data source attribution.'),
  period: z.string().optional().describe('Time period the data covers.'),
  trend: z.string().optional().describe('Trend direction: "up", "down", or "flat".'),
});

const sourceSchema = z.object({
  url: z.string().optional().describe('Source URL.'),
  title: z.string().optional().describe('Source title.'),
  quoteSpan: z.string().optional().describe('Quoted text span from the source.'),
  confidence: z.number().optional().describe('Confidence score (0-1).'),
  retrievedAt: z.string().optional().describe('ISO timestamp of when the source was retrieved.'),
});

const partialMetadataSchema = z.object({
  title: z.string().optional().describe('Slide title.'),
  type: z.string().optional().describe('Slide type.'),
  narrative: z.string().optional().describe('Narrative description.'),
  key_points: z.array(z.string()).optional().describe('Key points.'),
  data_points: z.array(dataPointSchema).optional().describe('Structured data points.'),
  tags: z.array(z.string()).optional().describe('Tags.'),
  audience: z.string().optional().describe('Target audience.'),
  confidentiality: z.string().optional().describe('Confidentiality level.'),
  sources: z.array(sourceSchema).optional().describe('Source attributions.'),
}).optional();

export function registerUpdateSlideTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'update_slide',
    {
      title: 'Update Slide',
      description: 'Update a slide\'s HTML and/or metadata. Re-validates if HTML changed.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck containing the slide.'),
        slide_id: z.string().describe('The slide to update.'),
        html: z.string().optional().describe('New HTML content for the slide.'),
        metadata: partialMetadataSchema.describe('Partial metadata fields to update.'),
      }),
    },
    async ({ deck_id, slide_id, html, metadata }) => {
      try {
        const updateInput: {
          deckId: string;
          slideId: string;
          html?: string;
          metadata?: Record<string, unknown>;
        } = {
          deckId: deck_id,
          slideId: slide_id,
        };

        if (html !== undefined) {
          updateInput.html = html;
        }

        if (metadata !== undefined) {
          updateInput.metadata = {
            ...(metadata.title !== undefined ? { title: metadata.title } : {}),
            ...(metadata.type !== undefined ? { type: metadata.type } : {}),
            ...(metadata.narrative !== undefined ? { narrative: metadata.narrative } : {}),
            ...(metadata.key_points !== undefined ? { keyPoints: metadata.key_points } : {}),
            ...(metadata.data_points !== undefined ? { dataPoints: metadata.data_points } : {}),
            ...(metadata.tags !== undefined ? { tags: metadata.tags } : {}),
            ...(metadata.audience !== undefined ? { audience: metadata.audience } : {}),
            ...(metadata.confidentiality !== undefined ? { confidentiality: metadata.confidentiality } : {}),
            ...(metadata.sources !== undefined ? { sources: metadata.sources } : {}),
          };
        }

        const slide = await container.deckService.updateSlide(updateInput as Parameters<typeof container.deckService.updateSlide>[0]);

        // If HTML was changed, embed metadata and re-validate
        let validation;
        if (html !== undefined) {
          // Embed metadata into the updated HTML
          const embeddedHtml = container.metadataEmbedder.update(html, slide.metadata);

          // Update the slide with embedded HTML
          await container.deckService.updateSlide({
            deckId: deck_id,
            slideId: slide_id,
            html: embeddedHtml,
          });

          // Validate the embedded HTML
          const deck = await container.deckService.getDeckSummary(deck_id);
          const sId = soulId(deck.soulId as string);
          validation = await container.validationService.validateSlide(embeddedHtml, sId);

          // Store the validation result on the slide
          await container.deckService.updateSlide({
            deckId: deck_id,
            slideId: slide_id,
            lastValidation: validation,
          });
        }

        return textResponse({
          slide_id: slide.id,
          ...(validation ? { validation } : {}),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
