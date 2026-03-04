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
import { SoulIdSchema } from '../_shared/schemas.js';
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
        include_recipes: z
          .boolean()
          .optional()
          .default(false)
          .describe('Whether to include layout recipes in the response'),
        /** @deprecated Use include_recipes instead */
        include_skeletons: z
          .boolean()
          .optional()
          .describe('[Deprecated] Alias for include_recipes'),
        include_style_guide: z
          .boolean()
          .optional()
          .default(true)
          .describe('Whether to include the style guide in the response'),
      }),
    },
    async ({ soul_id, include_recipes, include_skeletons, include_style_guide }) => {
      try {
        // include_skeletons is a deprecated alias for include_recipes
        const shouldIncludeRecipes = include_recipes || include_skeletons || false;

        const { soul, recipes } = await container.soulService.get(
          soulId(soul_id),
          shouldIncludeRecipes,
        );

        const response: Record<string, unknown> = {
          soul: {
            id: soul.id,
            name: soul.name,
            status: soul.status,
            css_tokens: soul.cssTokens,
            utility_css: soul.utilityCss,
            token_names: soul.tokenNames,
            allowed_fonts: soul.allowedFonts,
          },
        };

        if (include_style_guide) {
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
