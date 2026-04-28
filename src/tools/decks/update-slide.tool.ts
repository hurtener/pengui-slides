/**
 * MCP Tool: update_slide
 *
 * Updates a slide's IR tree and/or metadata. When the IR is replaced,
 * the slide's HTML is recompiled from the new IR (using the deck's
 * Design Soul + format geometry) and re-validated.
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
import { SlideIRSchema, type SlideIR } from '../../domain/ir/index.js';

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
      description:
        "Update a slide's IR tree and/or metadata. When `slide_ir` is provided, the slide's HTML is recompiled from the new IR using the deck's Design Soul + format geometry, and re-validated. " +
        '\n\n' +
        '**Read `pengui://schema/slide-ir`** for the node grammar before authoring `slide_ir`. ' +
        '\n\n' +
        'INPUT — `slide_ir` is the structured tree (hero/prose/image/callout/heading/list/divider/quote/table/two_column/grid/section_divider nodes — see `pengui://schema/slide-ir` for the full v4.8 grammar). Doc-only nodes (toc, bibliography, page_break) are rejected at update time by the slide-mode lint. Token references are SEMANTIC (e.g. background: "accent"), so the same IR re-renders cleanly when the soul changes. ' +
        '\n\n' +
        'PARTIAL UPDATES — omit `slide_ir` to update only metadata. Omit `metadata` to replace only the IR. Both may be set together. ' +
        '\n\n' +
        'VALIDATION — defaults to `lint`. Pass `validation_depth: "full"` to also run Stage 2 (Playwright render-truth) so contrast/overflow/legibility issues surface here instead of at export. ' +
        '\n\n' +
        'RETURNS — `{ slide_id, source_kind, validation?, validation_delta? }`. Validation runs only when content changes (IR or metadata).',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck containing the slide.'),
        slide_id: z.string().describe('The slide to update.'),
        slide_ir: SlideIRSchema.nullish().describe('New structured IR tree. Omit to keep existing IR.'),
        metadata: partialMetadataSchema.describe('Partial metadata fields to update.'),
        validation_depth: z
          .enum(['lint', 'full'])
          .nullish()
          .describe(
            'Validation depth. "lint" (default) is fast static analysis; "full" runs Stage 2 (Playwright render) so contrast/overflow/legibility issues surface here instead of at export. ~1–3 s extra.',
          ),
      }),
    },
    async ({ deck_id, slide_id, slide_ir, metadata, validation_depth }) => {
      try {
        const previousSlide = await container.deckService.getSlide(slide_id);
        const previousValidation = previousSlide.lastValidation ?? null;
        const shouldRevalidate = slide_ir != null || metadata != null;

        const updateInput: {
          deckId: string;
          slideId: string;
          ir?: SlideIR;
          metadata?: Record<string, unknown>;
        } = {
          deckId: deck_id,
          slideId: slide_id,
        };

        if (slide_ir != null) {
          updateInput.ir = slide_ir;
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

        if (shouldRevalidate) {
          const deck = await container.deckService.getDeckSummary(deck_id);
          const sId = soulId(deck.soulId as string);
          validation = await container.validationService.validateSlide(slide.html, sId, validation_depth ?? 'lint', deck.format);

          await container.deckService.updateSlide({
            deckId: deck_id,
            slideId: slide_id,
            lastValidation: validation,
          });

          validationDelta = buildValidationDelta(validation, previousValidation);
          validationPresentation = buildValidationPresentation(validationDelta);
        }

        return textResponse({
          slide_id: slide.id,
          source_kind: slide.sourceKind,
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
