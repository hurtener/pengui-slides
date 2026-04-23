/**
 * MCP Tool: get_deck_summary
 *
 * Returns a lightweight summary of a deck (no HTML bodies).
 *
 * Output keys are snake_case to match the rest of the MCP tool surface;
 * the underlying domain type (DeckSummary) is camelCase.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerGetDeckSummaryTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'get_deck_summary',
    {
      title: 'Get Deck Summary',
      description:
        'Get a lightweight summary of a deck (no HTML bodies). Returns `authoring_model` ' +
        '("slides" or "document") — READ THIS FIRST to decide whether to use the slide verbs ' +
        '(add_slide / update_slide / render_preview / export_html / export_pptx / export_google_slides) ' +
        'or the section verbs (add_section / update_section / list_sections / update_document_meta). ' +
        'Also returns `format`, `slide_count` + `slides[]` for slide decks, and `section_count` + `sections[]` ' +
        'for document decks (both arrays always present — the non-active one is empty).',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to summarise. Accepts UUID or slug.'),
      }),
    },
    async ({ deck_id }) => {
      try {
        const summary = await container.deckService.getDeckSummary(deck_id);

        return structuredResponse({
          id: summary.id,
          slug: summary.slug,
          soul_id: summary.soulId,
          soul_slug: summary.soulSlug,
          title: summary.title,
          author: summary.author,
          format: summary.format,
          authoring_model: summary.authoringModel,
          slide_count: summary.slideCount,
          slides: summary.slides.map((s) => ({
            id: s.id,
            position: s.position,
            title: s.title,
            type: s.type,
            is_valid: s.isValid,
            ...(s.styleScore != null ? { style_score: s.styleScore } : {}),
          })),
          section_count: summary.sectionCount,
          sections: summary.sections.map((s) => ({
            id: s.id,
            position: s.position,
            kind: s.kind,
            title: s.title,
            is_valid: s.isValid,
            ...(s.styleScore != null ? { style_score: s.styleScore } : {}),
          })),
          revision_count: summary.revisionCount,
          created_at: summary.createdAt,
          updated_at: summary.updatedAt,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
