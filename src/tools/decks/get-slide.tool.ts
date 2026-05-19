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
import { BooleanParamSchema } from '../_shared/schemas.js';

export function registerGetSlideTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'get_slide',
    {
      title: 'Get Slide',
      description:
        'Retrieve a single slide by ID. Default view returns the LLM-authoring shape: IR + ' +
        'source_kind + metadata + position + translation_issues (no html / document blobs). ' +
        'Pass `include_html: true` or `include_document: true` for the App-rendering path — ' +
        'these are large and rarely useful for the LLM authoring loop.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck containing the slide.'),
        slide_id: z.string().describe('The slide to retrieve.'),
        include_html: BooleanParamSchema.describe(
          'Include the compiled HTML in the response. Defaults to false — saves significant ' +
          'tokens when the agent only needs the IR for an edit.',
        ),
        include_document: BooleanParamSchema.describe(
          'Include the SlideDocument (element tree used by the editable-PPTX exporter). ' +
          'Defaults to false. Only the App needs this for native-shape inspection.',
        ),
      }),
    },
    async ({ deck_id, slide_id, include_html, include_document }) => {
      try {
        const slide = await container.deckService.getSlide(slide_id);
        if ((slide.deckId as string) !== deck_id) {
          throw new SlideNotFoundError(slide_id);
        }

        // structuredResponse exposes the payload to App callers via
        // structuredContent (the v4.9e morph flow needs slide.ir at
        // runtime to compose the new node). The text content keeps the
        // pretty-printed JSON for human / agent consumers.
        // v4.23 — html + document gated behind explicit opt-in so the
        // default LLM-authoring path doesn't pay their (large) token cost.
        return structuredResponse({
          ir: slide.ir,
          source_kind: slide.sourceKind,
          translation_issues: slide.translationIssues,
          metadata: slide.metadata,
          position: slide.position,
          ...(include_html ? { html: slide.html } : {}),
          ...(include_document ? { document: slide.document } : {}),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
