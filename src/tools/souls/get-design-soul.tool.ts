/**
 * get_design_soul MCP tool.
 *
 * Retrieves a single Design Soul by ID, optionally including
 * its generated skeleton templates.
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
        'Retrieve a Design Soul by its ID. Optionally include the generated skeleton ' +
        'templates (only available for approved souls).',
      inputSchema: z.object({
        soul_id: SoulIdSchema,
        include_skeletons: z
          .boolean()
          .optional()
          .default(false)
          .describe('Whether to include skeleton templates in the response'),
      }),
    },
    async ({ soul_id, include_skeletons }) => {
      try {
        const { soul, skeletons } = await container.soulService.get(soulId(soul_id), include_skeletons);

        const response: Record<string, unknown> = {
          soul: {
            id: soul.id,
            name: soul.name,
            status: soul.status,
            css_tokens: soul.cssTokens,
            token_names: soul.tokenNames,
            allowed_fonts: soul.allowedFonts,
          },
        };

        if (skeletons) {
          response.skeletons = skeletons.map((s) => ({
            id: s.id,
            type: s.type,
            name: s.name,
            description: s.description,
            html: s.html,
          }));
        }

        return textResponse(response);
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
