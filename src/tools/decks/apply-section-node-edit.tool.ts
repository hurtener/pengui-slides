/**
 * MCP Tool: apply_section_node_edit
 *
 * v4.6: replace a single node inside a section's IR tree without
 * resubmitting the whole body. Mirror of apply_slide_node_edit for
 * document-mode decks. Sections share the slide IR node grammar, so
 * the path / new_node shape is identical.
 *
 * After the replacement the section's IR is committed via update_section,
 * so HTML recompiles and validation re-runs.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { soulId } from '../../types/common.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { SlideNodeSchema } from '../../domain/ir/index.js';

const PATH_STEP = z.union([z.string(), z.number().int().nonnegative()]);
const PATH_SCHEMA = z
  .array(PATH_STEP)
  .min(2)
  .describe(
    'Structural path into the IR tree. Starts with "body" then a numeric index; ' +
      'two_column nodes accept "left"/"right" + numeric index; grid nodes accept ' +
      '"cells" + row index + cell index. Examples: ["body", 0]; ' +
      '["body", 2, "right", 1]; ["body", 3, "cells", 1, 0].',
  );

export function registerApplySectionNodeEditTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'apply_section_node_edit',
    {
      title: 'Apply Section Node Edit',
      description:
        'Replace a single IR node inside a section at the given path. Mirror of ' +
        '`apply_slide_node_edit` for document-mode decks. Cheaper than resubmitting the ' +
        'full section_ir for targeted edits. ' +
        '\n\n' +
        'INPUT — same path / new_node shape as apply_slide_node_edit; sections share the ' +
        'slide IR node grammar. Fetch `pengui://schema/slide-ir` for the contract. ' +
        'Slide-only nodes (section_divider) are rejected by the doc-mode lint at ' +
        'update_section time. ' +
        '\n\n' +
        'RETURNS — `{ section_id, kind, position, validation }`.',
      inputSchema: z.object({
        deck_id: z.string().describe('UUID or slug of the deck containing the section.'),
        section_id: z.string().describe('UUID of the section to edit.'),
        path: PATH_SCHEMA,
        new_node: SlideNodeSchema.describe('Replacement node (any IR node type).'),
      }),
    },
    async ({ deck_id, section_id, path, new_node }) => {
      try {
        const section = await container.documentService.applySectionNodeEdit({
          deckId: deck_id,
          sectionId: section_id,
          path,
          newNode: new_node,
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
