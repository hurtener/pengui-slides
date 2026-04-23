/**
 * MCP Tool: list_sections
 *
 * Returns a lightweight ordered list of every section in a deck (no HTML).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import type { SectionSummary } from '../../types/section.js';

export function registerListSectionsTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'list_sections',
    {
      title: 'List Sections',
      description:
        'List every section of a document-mode deck (id, position, kind, title, validity, style score). No HTML bodies.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to list sections for.'),
      }),
    },
    async ({ deck_id }) => {
      try {
        const sections = await container.documentService.listSections(deck_id);
        const summaries: SectionSummary[] = sections.map((section) => ({
          id: section.id,
          position: section.position,
          kind: section.kind,
          title: section.metadata.title,
          isValid: section.lastValidation?.passed ?? false,
          ...(section.lastValidation?.styleScore
            ? { styleScore: section.lastValidation.styleScore.overall }
            : {}),
        }));

        return textResponse({
          section_count: summaries.length,
          sections: summaries,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
