/**
 * MCP Tool: apply_section_field_edit
 *
 * v4.9c — section-mode mirror of `apply_slide_field_edit`. Patches one
 * named field of an IR node inside a section, then runs the standard
 * recompile + Stage 1 validation. Returns a `structuredResponse` so the
 * DocumentEditor's `onToolResult` listener picks up the section_id and
 * refreshes the rail / preview.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { soulId } from '../../types/common.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

const PATH_STEP = z.union([z.string(), z.number().int().nonnegative()]);
const PATH_SCHEMA = z.array(PATH_STEP).min(2);

export function registerApplySectionFieldEditTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'apply_section_field_edit',
    {
      title: 'Apply Section Field Edit',
      description:
        'Patch one named field of an IR node inside a section. Mirror of `apply_slide_field_edit`.',
      inputSchema: z.object({
        deck_id: z.string(),
        section_id: z.string(),
        path: PATH_SCHEMA,
        field: z.string().min(1),
        value: z.unknown(),
      }),
    },
    async ({ deck_id, section_id, path, field, value }) => {
      try {
        const section = await container.documentService.applySectionFieldEdit({
          deckId: deck_id,
          sectionId: section_id,
          path,
          field,
          value,
        });
        const summary = await container.deckService.getDeckSummary(deck_id);
        const validation = await container.validationService.validateSection(
          { id: section.id, kind: section.kind, html: section.html },
          soulId(summary.soulId as string),
          summary.format,
        );
        return structuredResponse({
          section_id: section.id as string,
          kind: section.kind,
          position: section.position,
          path,
          field,
          validation: {
            passed: validation.passed,
            error_count: validation.errorCount,
            warning_count: validation.warningCount,
            issues: validation.issues,
          },
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
