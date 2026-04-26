/**
 * MCP Tool: add_slide
 *
 * Adds a new slide to an existing deck from a structured SlideIR tree.
 * The deck-service compiles the IR into HTML, embeds @slide-meta, and
 * stores both representations on the slide. Stage 1/Stage 2 validation
 * runs against the compiled HTML using the deck's Design Soul.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { soulId } from '../../types/common.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import {
  buildValidationDelta,
  buildValidationPresentation,
} from '../../domain/validation/validation-presentation.js';
import { SlideIRSchema } from '../../domain/ir/index.js';

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
  key_points: z.array(z.string()).nullish().describe('Key points covered in this slide.'),
  data_points: z.array(dataPointSchema).nullish().describe('Structured data points.'),
  tags: z.array(z.string()).nullish().describe('Tags for categorisation.'),
  audience: z.string().nullish().describe('Target audience for this slide.'),
  confidentiality: z.string().nullish().describe('Confidentiality level: "public", "internal", "confidential", "restricted".'),
  sources: z.array(sourceSchema).nullish().describe('Source attributions.'),
});

export function registerAddSlideTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'add_slide',
    {
      title: 'Add Slide',
      description:
        'Add a new slide to a slide-model deck. ONLY applies to decks with authoringModel="slides" (slides_16_9, plus legacy print decks created with authoringModel="slides"). For document-model print decks (v3 default), use add_section instead — the tool returns a WRONG_AUTHORING_MODEL error naming add_section. ' +
        '\n\n' +
        'INPUT — `slide_ir` is a structured tree of nodes (hero, prose, image, callout, two_column). The compiler produces HTML deterministically using the deck\'s Design Soul tokens, so agents do not write CSS or hex literals — token references are SEMANTIC (e.g. background: "accent" → var(--color-accent-primary)). Fetch `pengui://schema/slide-ir` for the full node grammar and field shapes. ' +
        '\n\n' +
        'IMAGES — image nodes reference assets by id (e.g. `asset_id: "uuid"`). Upload binaries with `upload_asset` first, then pass the returned id. ' +
        '\n\n' +
        'RETURNS — `{ slide_id, position, slide_count, source_kind: "authored_ir", validation, validation_delta }`. The slide is stored with both `ir` (source of truth) and `html` (compiled snapshot for App/exporters).',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to add the slide to.'),
        slide_ir: SlideIRSchema.describe('Structured IR tree describing the slide content.'),
        metadata: metadataSchema.describe('Slide metadata.'),
        position: z.number().nullish().describe('Zero-based position to insert the slide. Appends to end if omitted.'),
      }),
    },
    async ({ deck_id, slide_ir, metadata, position }) => {
      try {
        const slide = await container.deckService.addSlide({
          deckId: deck_id,
          ir: slide_ir,
          metadata: {
            title: metadata.title,
            type: metadata.type,
            narrative: metadata.narrative,
            keyPoints: metadata.key_points ?? undefined,
            dataPoints: metadata.data_points ?? undefined,
            tags: metadata.tags ?? undefined,
            audience: metadata.audience ?? undefined,
            confidentiality: metadata.confidentiality ?? undefined,
            sources: metadata.sources ?? undefined,
          },
          position: position ?? undefined,
        });

        const deck = await container.deckService.getDeckSummary(deck_id);
        const sId = soulId(deck.soulId as string);

        const validation = await container.validationService.validateSlide(
          slide.html,
          sId,
          'lint',
          deck.format,
        );

        await container.deckService.updateSlide({
          deckId: deck_id,
          slideId: slide.id as string,
          lastValidation: validation,
        });

        const validationDelta = buildValidationDelta(validation, null);
        const validationPresentation = buildValidationPresentation(validationDelta);

        return textResponse({
          slide_id: slide.id,
          position: slide.position,
          slide_count: deck.slideCount,
          source_kind: slide.sourceKind,
          validation,
          validation_delta: validationDelta,
          validation_presentation: validationPresentation,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
