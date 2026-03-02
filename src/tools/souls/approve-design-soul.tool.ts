/**
 * approve_design_soul MCP tool.
 *
 * Approves a draft Design Soul, transitioning it to 'approved' status
 * and generating layout recipes that can be used for slide creation.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { ServiceContainer } from '../../container.js';
import { soulId } from '../../types/common.js';
import { SoulIdSchema } from '../_shared/schemas.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerApproveDesignSoulTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'approve_design_soul',
    {
      title: 'Approve Design Soul',
      description:
        'Approve a draft Design Soul. This generates layout recipes and transitions the ' +
        'soul to "approved" status. Only draft souls can be approved.',
      inputSchema: z.object({
        soul_id: SoulIdSchema,
      }),
    },
    async ({ soul_id }) => {
      try {
        const { soul, recipes } = await container.soulService.approve(soulId(soul_id));

        return textResponse({
          soul_id: soul.id,
          status: soul.status,
          recipe_count: recipes.length,
          recipe_types: recipes.map((r) => r.type),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
