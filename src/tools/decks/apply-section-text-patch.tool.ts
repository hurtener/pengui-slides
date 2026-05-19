/**
 * MCP Tool: apply_section_text_patch
 *
 * v4.23 — section-mode mirror of `apply_slide_text_patch`. Surgical
 * find/replace on a string-typed field of an IR node inside a section.
 * Use when only a small slice of a long string (a paragraph,
 * code_block.code, a table cell text) needs to change — saves the
 * agent from re-emitting the whole value + avoids escape mistakes.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { soulId } from '../../types/common.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

const PATH_STEP = z.union([z.string(), z.number().int().nonnegative()]);
const PATH_SCHEMA = z
  .array(PATH_STEP)
  .min(2)
  .describe(
    'Path to the parent IR node carrying the addressed field. ' +
      'Examples: ["body", 0]; ["body", 2, "left", 1].',
  );

export function registerApplySectionTextPatchTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'apply_section_text_patch',
    {
      title: 'Apply Section Text Patch',
      description:
        'Find/replace a unique substring inside a string-typed field of an IR node within a ' +
        'section. Use this instead of `apply_section_field_edit` when only a small portion of a ' +
        'long string (code_block.code, a long prose run, a table cell text) needs to change — ' +
        'saves the LLM from re-emitting the entire value and avoids JSON-escaping mistakes. ' +
        '\n\n' +
        'FIELD GRAMMAR — `"code"` for a top-level string; `"items[2]"` for a string-valued ' +
        'array slot; `"body[0].text"` to patch the `text` of a specific RichText run. ' +
        '\n\n' +
        'SEMANTICS — `find` must occur EXACTLY ONCE in the current value. Zero matches returns ' +
        'SLIDE_TEXT_EDIT_NOT_FOUND; multiple matches returns INVALID_INPUT (extend the snippet). ' +
        '`replace` is taken verbatim (no regex). ' +
        '\n\n' +
        'RETURNS — `{ section_id, kind, position, path, field, validation }`. The section is ' +
        'recompiled and re-validated against the deck\'s soul.',
      inputSchema: z.object({
        deck_id: z.string().describe('UUID or slug of the deck containing the section.'),
        section_id: z.string().describe('UUID of the section to edit.'),
        path: PATH_SCHEMA,
        field: z
          .string()
          .min(1)
          .describe(
            'Dotted field path inside the node. `"code"` for code_block.code; `"body[0].text"` ' +
              'for the first RichText run on a callout / hero / prose.',
          ),
        find: z
          .string()
          .min(1)
          .describe('Substring to replace. Must occur exactly once in the current value.'),
        replace: z
          .string()
          .describe('Replacement substring. May be empty (delete). Verbatim — no regex.'),
      }),
    },
    async ({ deck_id, section_id, path, field, find, replace }) => {
      try {
        const section = await container.documentService.applySectionTextPatch({
          deckId: deck_id,
          sectionId: section_id,
          path,
          field,
          find,
          replace,
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
