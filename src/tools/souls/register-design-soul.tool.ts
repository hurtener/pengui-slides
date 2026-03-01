/**
 * register_design_soul MCP tool.
 *
 * Registers a new Design Soul from the provided name, description,
 * and seven-layer visual identity definition. The soul is created
 * in 'draft' status and must be approved before it can be used.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { ServiceContainer } from '../../container.js';
import type { DesignSoulInput } from '../../types/design-soul.js';
import { SoulLayersSchema } from '../_shared/schemas.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerRegisterDesignSoulTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'register_design_soul',
    {
      title: 'Register Design Soul',
      description:
        'Register a new Design Soul by providing a name, description, and complete layer definitions ' +
        '(color, typography, spacing, shape, depth, components, motion). The soul is created in "draft" ' +
        'status. CSS custom-property tokens are generated automatically from the layers.',
      inputSchema: z.object({
        name: z.string().min(1).max(120).describe('Human-readable name for the Design Soul'),
        description: z
          .string()
          .min(1)
          .max(500)
          .describe('Brief description of the visual identity this soul represents'),
        layers: SoulLayersSchema,
      }),
    },
    async ({ name, description, layers }) => {
      try {
        const input: DesignSoulInput = { name, description, layers };
        const soul = await container.soulService.register(input);

        return textResponse({
          soul_id: soul.id,
          name: soul.name,
          status: soul.status,
          token_count: soul.tokenNames.length,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
