/**
 * save_as_template MCP tool.
 *
 * Saves a validated slide as a reusable layout recipe (template)
 * associated with its Design Soul.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { ServiceContainer } from '../../container.js';
import { soulId, slideId } from '../../types/common.js';
import { SoulIdSchema, SlideIdSchema } from '../_shared/schemas.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerSaveAsTemplateTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'save_as_template',
    {
      title: 'Save Slide as Template',
      description:
        'Save a validated slide as a reusable layout recipe (template). The slide must ' +
        'have passed validation before it can be saved. The resulting template is associated ' +
        'with the Design Soul and can be reused for future slide creation.',
      inputSchema: z.object({
        soul_id: SoulIdSchema,
        slide_id: SlideIdSchema,
        name: z.string().min(1).max(120).describe('Human-readable name for the template'),
        tags: z.array(z.string()).describe('Tags for categorizing the template'),
        description: z
          .string()
          .min(1)
          .max(500)
          .describe('Brief description of the template layout and its intended use'),
      }),
    },
    async ({ soul_id, slide_id, name, tags, description }) => {
      try {
        const recipe = await container.soulService.saveAsTemplate(
          soulId(soul_id),
          slideId(slide_id),
          name,
          tags,
          description,
        );

        return textResponse({
          template_id: recipe.id,
          type: recipe.type,
          name: recipe.name,
          tags: recipe.tags,
          source: recipe.source,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
