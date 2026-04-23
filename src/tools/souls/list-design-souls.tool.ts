/**
 * list_design_souls MCP tool.
 *
 * Lists all registered Design Souls, optionally filtered by status.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { ServiceContainer } from '../../container.js';
import { StatusFilterSchema } from '../_shared/schemas.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerListDesignSoulsTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'list_design_souls',
    {
      title: 'List Design Souls',
      description:
        'List all registered Design Souls. Optionally filter by status ' +
        '(draft, approved, archived, or all).',
      inputSchema: z.object({
        status_filter: StatusFilterSchema,
      }),
    },
    async ({ status_filter }) => {
      try {
        const souls = await container.soulService.list(status_filter ?? undefined);
        const recipeCounts = await Promise.all(
          souls.map(async (soul) => ({
            soulId: soul.id,
            recipeCount: (await container.soulStore.getRecipes(soul.id)).length,
          })),
        );
        const recipeCountMap = new Map(recipeCounts.map((entry) => [entry.soulId, entry.recipeCount]));

        // Trigger slug backfill for any legacy souls missing a slug.
        await Promise.all(souls.map((s) => container.soulService.slugFor(s.id)));

        return structuredResponse({
          souls: await Promise.all(
            souls.map(async (soul) => ({
              soul_id: soul.id,
              slug: soul.slug ?? (await container.soulService.slugFor(soul.id)),
              name: soul.name,
              status: soul.status,
              token_count: soul.tokenNames.length,
              recipe_count: recipeCountMap.get(soul.id) ?? 0,
            })),
          ),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
