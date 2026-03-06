/**
 * list_design_souls MCP tool.
 *
 * Lists all registered Design Souls, optionally filtered by status.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { ServiceContainer } from '../../container.js';
import { StatusFilterSchema } from '../_shared/schemas.js';
import { textResponse } from '../_shared/responses.js';
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

        return textResponse({
          souls: souls.map((soul) => ({
            soul_id: soul.id,
            name: soul.name,
            status: soul.status,
            token_count: soul.tokenNames.length,
          })),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
