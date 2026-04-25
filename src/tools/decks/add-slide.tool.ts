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
import {
  buildValidationDelta,
  buildValidationPresentation,
} from '../../domain/validation/validation-presentation.js';
import {
  buildSoulTokenLookups,
  substituteSoulTokens,
} from '../../domain/souls/index.js';

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
        'Add a new slide to a slide-model deck. ONLY applies to decks with authoringModel="slides" (slides_16_9, plus legacy print decks created with authoringModel="slides"). For document-model print decks (v3 default), use add_section instead — the tool returns a WRONG_AUTHORING_MODEL error naming add_section. The slide HTML must declare .slide dimensions that match the DECK FORMAT: 1920×1080 for slides_16_9, 1240×1754 for print_a4_portrait (legacy), 1275×1650 for print_letter_portrait (legacy). .slide MUST carry "position: relative" and "padding: var(--space-safe-area)"; declare "html, body { margin: 0 }" explicitly. The server auto-injects @slide-meta from `metadata` and auto-substitutes literal CSS values for the matching soul-declared `var(--*)` before storage. Three categories are substituted: color hex literals (e.g. `#228be6` → `var(--color-accent-primary)`), spacing px literals on margin/padding/gap/inset/top/right/bottom/left (e.g. `padding: 16px` → `var(--space-md)`), and radius dimensions on border-radius (e.g. `border-radius: 8px` → `var(--radius-md)`). The change set is returned in `auto_substitutions` (each entry tagged with `category: "color" | "spacing" | "radius"`) so you can emit var() form directly on the next turn. Values inside calc()/var()/min()/max() are left alone. See pengui://docs/slide-format for the canonical template. See pengui://docs/document-mode for the v3 continuous-document flow. Returns the slide ID, position, slide count, auto-substitutions, and validation results.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to add the slide to.'),
        html: z.string().describe('The slide HTML content.'),
        metadata: metadataSchema.describe('Slide metadata.'),
        position: z.number().nullish().describe('Zero-based position to insert the slide. Appends to end if omitted.'),
      }),
    },
    async ({ deck_id, html, metadata, position }) => {
      try {
        // Load the deck's soul up-front so we can run token-literal
        // substitution before storage. Any soul-known color hex, spacing
        // px, or radius dimension in the slide HTML is rewritten to
        // var(--token); the change set is returned in the response so the
        // agent learns and emits the var() form on the next turn.
        const deckPre = await container.deckService.getDeckSummary(deck_id);
        const soulPre = await container.soulStore.get(deckPre.soulId);
        const lookups = soulPre
          ? buildSoulTokenLookups(soulPre.layers)
          : { color: new Map(), spacing: new Map(), radius: new Map() };
        const sub = substituteSoulTokens(html, lookups);
        const sourceHtml = sub.html;

        // 1. Add slide (stores with substituted HTML)
        const slide = await container.deckService.addSlide({
          deckId: deck_id,
          html: sourceHtml,
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

        // 2. Embed metadata into the (substituted) HTML
        const embeddedHtml = container.metadataEmbedder.embed(sourceHtml, slide.metadata);

        // 3. Update the slide with embedded HTML
        await container.deckService.updateSlide({
          deckId: deck_id,
          slideId: slide.id as string,
          html: embeddedHtml,
        });

        // 4. Retrieve the deck to get the soul ID and slide count
        const deck = await container.deckService.getDeckSummary(deck_id);
        const sId = soulId(deck.soulId as string);

        // 5. Validate the embedded HTML against the deck's Design Soul using the deck's format geometry
        const validation = await container.validationService.validateSlide(embeddedHtml, sId, 'lint', deck.format);

        // 6. Store the validation result on the slide
        await container.deckService.updateSlide({
          deckId: deck_id,
          slideId: slide.id as string,
          lastValidation: validation,
        });

        // 7. Compile HTML into the canonical slide document when possible.
        const refreshedSlide = await container.deckService.getSlide(slide.id as string);
        const compilation = await container.slideDocumentService.compileSlideHtml(
          embeddedHtml,
          refreshedSlide.metadata.revisionHash,
        );
        const translationState = container.slideDocumentService.buildTranslationState(compilation);
        await container.deckService.updateSlide({
          deckId: deck_id,
          slideId: slide.id as string,
          sourceKind: translationState.sourceKind,
          document: translationState.document ?? undefined,
          translationIssues: translationState.translationIssues,
        });

        const validationDelta = buildValidationDelta(validation, null);
        const validationPresentation = buildValidationPresentation(validationDelta);

        return textResponse({
          slide_id: slide.id,
          position: slide.position,
          slide_count: deck.slideCount,
          source_kind: translationState.sourceKind,
          translation_issues: translationState.translationIssues,
          auto_substitutions: sub.substitutions,
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
