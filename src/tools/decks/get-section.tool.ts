/**
 * MCP Tool: get_section
 *
 * Retrieves a single section's HTML fragment, metadata, and break hints.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerGetSectionTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'get_section',
    {
      title: 'Get Section',
      description:
        'Retrieve a single section by ID, returning its HTML fragment, kind, break hints, and metadata.',
      inputSchema: z.object({
        section_id: z.string().describe('The section to retrieve.'),
      }),
    },
    async ({ section_id }) => {
      try {
        const section = await container.documentService.getSection(section_id);
        return textResponse({
          id: section.id,
          deck_id: section.deckId,
          position: section.position,
          kind: section.kind,
          html: section.html,
          break_hints: section.breakHints,
          metadata: section.metadata,
          last_validation: section.lastValidation,
          created_at: section.createdAt,
          updated_at: section.updatedAt,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
