/**
 * MCP Tool: promote_section_root
 *
 * Surgical repair for the "root not <section>" structural error. Rewrites
 * the section fragment's single top-level element into
 * `<section class="pengui-section pengui-{kind}">`, preserving inline
 * styles, ids, data-*, and all children. Use this instead of re-emitting
 * the whole fragment when the only issue is the wrapper tag.
 *
 * Fails loudly (not silently) if the fragment has multiple top-level
 * elements — in that case, call `wrap_section_root` instead.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { soulId } from '../../types/common.js';

export function registerPromoteSectionRootTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'promote_section_root',
    {
      title: 'Promote Section Root',
      description:
        'Surgically rewrite a section fragment\'s single root element into ' +
        '`<section class="pengui-section pengui-{kind}">` where `{kind}` is the section\'s ' +
        'current stored kind. Preserves every attribute on the original root (inline style, id, ' +
        'data-*) and merges the required classes. Strips any stale `pengui-{other-kind}` classes ' +
        'so the wrapper ends up with exactly one kind class. Also re-embeds the @section-meta comment. ' +
        '\n\n' +
        'WHEN TO CALL — the `validation` block of `add_section` / `update_section` / `validate_section` ' +
        'reports rule `section-structural` with id ending in `-root-not-section`, and the fragment has ' +
        'exactly ONE top-level element. Using this tool is cheaper than re-emitting the full fragment. ' +
        '\n\n' +
        'REQUIRES — exactly one top-level element in the fragment. If there are zero or multiple, ' +
        'returns `SECTION_INVALID_FRAGMENT`. For multiple top-level elements, call `wrap_section_root` ' +
        'instead. ' +
        '\n\n' +
        'RETURNS — `{ section_id, kind, position, validation: { passed, error_count, warning_count, issues } }`. ' +
        'Inspect `validation` — other unrelated issues (e.g. token compliance) may still be present ' +
        'and require follow-up `update_section` calls.',
      inputSchema: z.object({
        deck_id: z.string().describe('UUID or slug of the deck containing the section.'),
        section_id: z.string().describe('UUID of the section whose root needs promotion.'),
      }),
    },
    async ({ deck_id, section_id }) => {
      try {
        const section = await container.documentService.promoteSectionRoot(
          deck_id,
          section_id,
        );

        const deck = await container.deckService.getDeckSummary(deck_id);
        const validation = await container.validationService.validateSection(
          { id: section.id, kind: section.kind, html: section.html },
          soulId(deck.soulId as string),
          deck.format,
        );

        return textResponse({
          section_id: section.id,
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
