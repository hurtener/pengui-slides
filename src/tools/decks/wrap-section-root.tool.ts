/**
 * MCP Tool: wrap_section_root
 *
 * Surgical repair for the "multiple top-level elements" structural error.
 * Wraps every top-level element in the fragment in a new
 * `<section class="pengui-section pengui-{kind}">`. Optional `child_order`
 * reorders the top-level elements by their original indices so the agent
 * can fix source-order mistakes without rewriting content.
 *
 * Call `list_section_top_level_elements` first if you want to decide an
 * explicit order — or rely on source order by omitting `child_order`.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { soulId } from '../../types/common.js';

export function registerWrapSectionRootTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'wrap_section_root',
    {
      title: 'Wrap Section Root',
      description:
        'Surgically wrap every top-level element of a section fragment into a single ' +
        '`<section class="pengui-section pengui-{kind}">` where `{kind}` is the section\'s ' +
        'current stored kind. All children are preserved verbatim. Re-embeds the @section-meta comment ' +
        'above the new wrapper. ' +
        '\n\n' +
        'WHEN TO CALL — the `validation` block of `add_section` / `update_section` / `validate_section` ' +
        'reports rule `section-structural` with id ending in `-multiple-root-elements`. The issue\'s ' +
        '`actual` field enumerates the nodes as `[0] <tag#id.class>, [1] ...` — use that to decide ' +
        'whether you need to reorder them via `child_order`. ' +
        '\n\n' +
        'REQUIRES — at least one top-level element in the fragment. Returns `SECTION_INVALID_FRAGMENT` ' +
        'on empty fragments. Returns `INVALID_INPUT` if `child_order` is malformed (not a permutation ' +
        'of `[0 .. n-1]` where n is the top-level element count). ' +
        '\n\n' +
        'RETURNS — `{ section_id, kind, position, wrapped_element_count, top_level_elements_before: [{ index, tag, id?, classes }], ' +
        'validation: { passed, error_count, warning_count, issues } }`. Inspect `top_level_elements_before` ' +
        'to confirm what was bundled; inspect `validation` for remaining unrelated issues.',
      inputSchema: z.object({
        deck_id: z.string().describe('UUID or slug of the deck containing the section.'),
        section_id: z.string().describe('UUID of the section to wrap.'),
        child_order: z
          .array(z.number().int().nonnegative())
          .nullish()
          .describe(
            'Optional new order for the top-level elements, as a permutation of their original ' +
              '0-based source-order indices. Example: `[2, 0, 1]` to move the third element first. ' +
              'Must contain every index exactly once — partial permutations are rejected with ' +
              'INVALID_INPUT. Omit to preserve source order.',
          ),
      }),
    },
    async ({ deck_id, section_id, child_order }) => {
      try {
        const beforeElements = await container.documentService.listSectionTopLevelElements(
          deck_id,
          section_id,
        );
        const section = await container.documentService.wrapSectionRoot(
          deck_id,
          section_id,
          child_order ?? undefined,
        );

        const deck = await container.deckService.getDeckSummary(deck_id);
        const validation = await container.validationService.validateSection(
          { id: section.id, kind: section.kind, html: section.html },
          soulId(deck.soulId as string),
          deck.format,
        );

        return structuredResponse({
          section_id: section.id as string,
          kind: section.kind,
          position: section.position,
          wrapped_element_count: beforeElements.length,
          top_level_elements_before: beforeElements,
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
