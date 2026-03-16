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
import {
  buildValidationDelta,
  buildValidationPresentation,
} from '../../domain/validation/validation-presentation.js';

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
  title: z.string().nullish().describe('Slide title.'),
  type: z.string().nullish().describe('Slide type.'),
  narrative: z.string().nullish().describe('Narrative description.'),
  key_points: z.array(z.string()).nullish().describe('Key points.'),
  data_points: z.array(dataPointSchema).nullish().describe('Structured data points.'),
  tags: z.array(z.string()).nullish().describe('Tags.'),
  audience: z.string().nullish().describe('Target audience.'),
  confidentiality: z.string().nullish().describe('Confidentiality level.'),
  sources: z.array(sourceSchema).nullish().describe('Source attributions.'),
}).nullish();

export function registerUpdateSlideTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'update_slide',
    {
      title: 'Update Slide',
      description: 'Update a slide\'s HTML and/or metadata. Re-validates if HTML changed.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck containing the slide.'),
        slide_id: z.string().describe('The slide to update.'),
        html: z.string().nullish().describe('New HTML content for the slide.'),
        metadata: partialMetadataSchema.describe('Partial metadata fields to update.'),
      }),
    },
    async ({ deck_id, slide_id, html, metadata }) => {
      try {
        const previousSlide = await container.deckService.getSlide(slide_id);
        const previousValidation = previousSlide.lastValidation ?? null;
        const shouldSyncMetadata = html != null || metadata != null;
        const updateInput: {
          deckId: string;
          slideId: string;
          html?: string;
          metadata?: Record<string, unknown>;
        } = {
          deckId: deck_id,
          slideId: slide_id,
        };

        if (html != null) {
          updateInput.html = html;
        }

        if (metadata != null) {
          updateInput.metadata = {
            ...(metadata.title != null ? { title: metadata.title } : {}),
            ...(metadata.type != null ? { type: metadata.type } : {}),
            ...(metadata.narrative != null ? { narrative: metadata.narrative } : {}),
            ...(metadata.key_points != null ? { keyPoints: metadata.key_points } : {}),
            ...(metadata.data_points != null ? { dataPoints: metadata.data_points } : {}),
            ...(metadata.tags != null ? { tags: metadata.tags } : {}),
            ...(metadata.audience != null ? { audience: metadata.audience } : {}),
            ...(metadata.confidentiality != null ? { confidentiality: metadata.confidentiality } : {}),
            ...(metadata.sources != null ? { sources: metadata.sources } : {}),
          };
        }

        const slide = await container.deckService.updateSlide(
          updateInput as Parameters<typeof container.deckService.updateSlide>[0],
        );

        let validation;
        let validationDelta;
        let validationPresentation;
        let sourceKind;
        let translationIssues;
        if (shouldSyncMetadata) {
          const sourceHtml = html ?? slide.html;
          const embeddedHtml = container.metadataEmbedder.update(sourceHtml, slide.metadata);

          await container.deckService.updateSlide({
            deckId: deck_id,
            slideId: slide_id,
            html: embeddedHtml,
          });

          const deck = await container.deckService.getDeckSummary(deck_id);
          const sId = soulId(deck.soulId as string);
          validation = await container.validationService.validateSlide(embeddedHtml, sId);

          // Store the validation result on the slide
          await container.deckService.updateSlide({
            deckId: deck_id,
            slideId: slide_id,
            lastValidation: validation,
          });

          const refreshed = await container.deckService.getSlide(slide_id);
          const compilation = await container.slideDocumentService.compileSlideHtml(
            embeddedHtml,
            refreshed.metadata.revisionHash,
          );
          const translationState = container.slideDocumentService.buildTranslationState(compilation);

          await container.deckService.updateSlide({
            deckId: deck_id,
            slideId: slide_id,
            sourceKind: translationState.sourceKind,
            document: translationState.document ?? undefined,
            translationIssues: translationState.translationIssues,
          });
          sourceKind = translationState.sourceKind;
          translationIssues = translationState.translationIssues;

          validationDelta = buildValidationDelta(validation, previousValidation);
          validationPresentation = buildValidationPresentation(validationDelta);
        }

        return textResponse({
          slide_id: slide.id,
          ...(sourceKind ? { source_kind: sourceKind } : {}),
          ...(translationIssues ? { translation_issues: translationIssues } : {}),
          ...(validation ? { validation } : {}),
          ...(validationDelta ? { validation_delta: validationDelta } : {}),
          ...(validationPresentation ? { validation_presentation: validationPresentation } : {}),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
