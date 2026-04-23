/**
 * get_design_soul MCP tool.
 *
 * Retrieves a single Design Soul by ID, optionally including
 * its layout recipes and style guide.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { ServiceContainer } from '../../container.js';
import { soulId } from '../../types/common.js';
import { SoulIdSchema, BooleanParamSchema } from '../_shared/schemas.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerGetDesignSoulTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'get_design_soul',
    {
      title: 'Get Design Soul',
      description:
        'Retrieve a Design Soul by its ID. Optionally include the layout recipes ' +
        '(only available for approved souls) and the generated style guide.',
      inputSchema: z.object({
        soul_id: SoulIdSchema,
        include_recipes: BooleanParamSchema
          .describe('Whether to include layout recipes in the response. Defaults to false.'),
        include_style_guide: BooleanParamSchema
          .describe('Whether to include the style guide in the response. Defaults to true.'),
      }),
    },
    async ({ soul_id, include_recipes, include_style_guide }) => {
      try {
        const shouldIncludeRecipes = include_recipes ?? false;

        const { soul, recipes } = await container.soulService.get(
          soulId(soul_id),
          shouldIncludeRecipes,
        );

        const response: Record<string, unknown> = {
          soul: {
            id: soul.id,
            name: soul.name,
            description: soul.description,
            status: soul.status,
            layers: soul.layers,
            css_tokens: soul.cssTokens,
            utility_css: soul.utilityCss,
            token_names: soul.tokenNames,
            allowed_fonts: soul.allowedFonts,
            created_at: soul.createdAt,
            updated_at: soul.updatedAt,
            approved_at: soul.approvedAt ?? null,
          },
        };

        if (include_style_guide ?? true) {
          response.style_guide = soul.styleGuide;
        }

        if (recipes) {
          response.layout_recipes = recipes.map((r) => ({
            id: r.id,
            type: r.type,
            name: r.name,
            description: r.description,
            tags: r.tags,
            source: r.source,
            medium: r.medium,
            html: r.html,
          }));
        }

        return textResponse(response);
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
