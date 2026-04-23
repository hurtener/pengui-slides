/**
 * MCP Tool: validate_section
 *
 * Validates a document-mode Section FRAGMENT against its deck's soul.
 * Mirrors validate_slide but for Sections — runs the section Stage 1
 * (fragment contract, wrapper-class presence, figure/table shape,
 * token/font compliance, network isolation). Stage 2 (render-truth)
 * runs at export time via validateDocument, not here.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { soulId, sectionId } from '../../types/common.js';
import { ALL_SECTION_KINDS, type SectionKind } from '../../types/section.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerValidateSectionTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'validate_section',
    {
      title: 'Validate Section',
      description:
        'Validate a document-mode section HTML FRAGMENT against a Design Soul. Fast path: runs only Section Stage 1 lints (fragment contract, wrapper-class presence, figure/table shape, token/font compliance, network isolation) — no Playwright render. Pass deck_id to use the deck\'s format geometry (print_a4_portrait / print_letter_portrait); without it the check defaults to print_a4_portrait. Stage 2 checks (split-keep-together, orphan-heading, page-count) only run at export time. Returns issues, style score, and pass/fail status.',
      inputSchema: z.object({
        html: z.string().describe('The section HTML fragment to validate.'),
        kind: z
          .enum(ALL_SECTION_KINDS as [string, ...string[]])
          .describe('Section kind (drives break defaults and structural validation).'),
        soul_id: z.string().describe('The Design Soul to validate against.'),
        deck_id: z.string().nullish().describe('The deck this section belongs to. When provided, validation uses the deck\'s format geometry instead of the print_a4_portrait default.'),
      }),
    },
    async ({ html, kind, soul_id, deck_id }) => {
      try {
        const sId = soulId(soul_id);
        const format = deck_id != null
          ? await container.deckService.getDeckFormat(deck_id)
          : undefined;

        const result = await container.validationService.validateSection(
          {
            id: sectionId('validate-section-stub'),
            kind: kind as SectionKind,
            html,
          },
          sId,
          format,
        );

        return textResponse(result);
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
