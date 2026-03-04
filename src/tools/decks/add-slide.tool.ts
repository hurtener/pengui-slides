/**
 * MCP Tool: add_slide
 *
 * Adds a new slide to an existing deck, then validates the HTML
 * against the deck's Design Soul.
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

const metadataSchema = z.object({
  title: z.string().describe('Slide title.'),
  type: z.string().describe('Slide type (e.g. "title", "content", "metrics", "two-column").'),
  narrative: z.string().describe('Narrative description of the slide content.'),
  key_points: z.array(z.string()).optional().describe('Key points covered in this slide.'),
  data_points: z.array(dataPointSchema).optional().describe('Structured data points.'),
  tags: z.array(z.string()).optional().describe('Tags for categorisation.'),
  audience: z.string().optional().describe('Target audience for this slide.'),
  confidentiality: z.string().optional().describe('Confidentiality level: "public", "internal", "confidential", "restricted".'),
  sources: z.array(sourceSchema).optional().describe('Source attributions.'),
});

export function registerAddSlideTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'add_slide',
    {
      title: 'Add Slide',
      description: 'Add a new slide to a deck. Returns the slide ID, position, updated slide count, and validation results.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to add the slide to.'),
        html: z.string().describe('The slide HTML content.'),
        metadata: metadataSchema.describe('Slide metadata.'),
        position: z.number().optional().describe('Zero-based position to insert the slide. Appends to end if omitted.'),
      }),
    },
    async ({ deck_id, html, metadata, position }) => {
      try {
        // 1. Add slide (stores with raw HTML)
        const slide = await container.deckService.addSlide({
          deckId: deck_id,
          html,
          metadata: {
            title: metadata.title,
            type: metadata.type,
            narrative: metadata.narrative,
            keyPoints: metadata.key_points,
            dataPoints: metadata.data_points,
            tags: metadata.tags,
            audience: metadata.audience,
            confidentiality: metadata.confidentiality,
            sources: metadata.sources,
          },
          position,
        });

        // 2. Embed metadata into HTML
        const embeddedHtml = container.metadataEmbedder.embed(html, slide.metadata);

        // 3. Update the slide with embedded HTML
        await container.deckService.updateSlide({
          deckId: deck_id,
          slideId: slide.id as string,
          html: embeddedHtml,
        });

        // 4. Retrieve the deck to get the soul ID and slide count
        const deck = await container.deckService.getDeckSummary(deck_id);
        const sId = soulId(deck.soulId as string);

        // 5. Validate the embedded HTML against the deck's Design Soul
        const validation = await container.validationService.validateSlide(embeddedHtml, sId);

        // 6. Store the validation result on the slide
        await container.deckService.updateSlide({
          deckId: deck_id,
          slideId: slide.id as string,
          lastValidation: validation,
        });

        return textResponse({
          slide_id: slide.id,
          position: slide.position,
          slide_count: deck.slideCount,
          validation,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
