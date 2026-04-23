/**
 * MCP Tool: list_decks
 *
 * Lightweight list of every deck on the server. Returns slug + title +
 * format + authoring model + counts + timestamps — no HTML, no revisions,
 * no slide/section bodies. Sorted newest-updated first.
 *
 * This is the agent's entry point for "what decks exist?" when the user
 * references one by name or slug. Use `get_deck_summary` to drill into a
 * specific deck (which then returns slide/section summaries).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { ServiceContainer } from '../../container.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerListDecksTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'list_decks',
    {
      title: 'List Decks',
      description:
        'Lightweight list of all decks on the server (no HTML, no slide bodies). ' +
        'Each entry returns the deck\'s UUID and slug (human-readable handle), soul id + slug, ' +
        'title, author, format, authoring model, slide/section counts, and timestamps. ' +
        'Sorted newest-updated first. Use this to find a deck by name and then call ' +
        'get_deck_summary with either the UUID or the slug for details.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const decks = await container.deckService.listDecks();
        return structuredResponse({
          deck_count: decks.length,
          decks: decks.map((d) => ({
            id: d.id,
            slug: d.slug,
            soul_id: d.soulId,
            soul_slug: d.soulSlug,
            title: d.title,
            author: d.author,
            format: d.format,
            authoring_model: d.authoringModel,
            slide_count: d.slideCount,
            section_count: d.sectionCount,
            created_at: d.createdAt,
            updated_at: d.updatedAt,
          })),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
