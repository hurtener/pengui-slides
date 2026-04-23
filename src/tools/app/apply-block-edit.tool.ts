/**
 * MCP App Tool: apply_block_edit
 *
 * App-only tool (visibility: ['app']). Three kinds of structural block edits
 * that the MCP App can issue directly without going through the LLM transcript:
 *
 *   - section_kind   — change a section's SectionKind
 *   - break_hints    — update a section's pagination break hints
 *   - chrome_config  — update the deck-level PageChromeDirective
 */

import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { DECK_EDITOR_RESOURCE_URI } from '../../resources/app-resources.js';
import { handleToolError } from '../_shared/error-handler.js';
import { structuredResponse } from '../_shared/responses.js';
import { ALL_SECTION_KINDS } from '../../types/section.js';

const sectionKindSchema = z.enum(ALL_SECTION_KINDS as [string, ...string[]]);

const editSchema = z.discriminatedUnion('kind', [
  // ── section_kind ───────────────────────────────────────────────
  z.object({
    kind: z.literal('section_kind'),
    deck_ref: z.string().describe('Deck UUID or slug.'),
    section_id: z.string().describe('The section to update.'),
    new_kind: sectionKindSchema.describe('The new SectionKind value.'),
  }),

  // ── break_hints ────────────────────────────────────────────────
  z.object({
    kind: z.literal('break_hints'),
    deck_ref: z.string().describe('Deck UUID or slug.'),
    section_id: z.string().describe('The section to update.'),
    hints: z.object({
      break_before: z.enum(['auto', 'page', 'avoid']).optional(),
      break_after: z.enum(['auto', 'page', 'avoid']).optional(),
      keep_together: z.boolean().optional(),
      full_page: z.boolean().optional(),
    }).describe('Partial break-hint overrides. Unset fields are left unchanged.'),
  }),

  // ── chrome_config ──────────────────────────────────────────────
  z.object({
    kind: z.literal('chrome_config'),
    deck_ref: z.string().describe('Deck UUID or slug.'),
    chrome: z.record(z.string(), z.unknown()).describe('Partial PageChromeDirective shape to merge into the deck.'),
  }),
]);

export function registerApplyBlockEditTool(server: McpServer, container: ServiceContainer): void {
  registerAppTool(
    server,
    'apply_block_edit',
    {
      title: 'Apply Block Edit',
      description:
        'Apply a structural block-level edit to a document deck. Three kinds: ' +
        '"section_kind" changes a section\'s kind; "break_hints" updates pagination hints; ' +
        '"chrome_config" merges a PageChromeDirective into the deck-level document meta. ' +
        'Returns the refreshed deck summary plus a "section" field for section edits.',
      inputSchema: editSchema,
      _meta: {
        ui: {
          resourceUri: DECK_EDITOR_RESOURCE_URI,
          visibility: ['app'],
        },
      },
    },
    async (input) => {
      try {
        switch (input.kind) {
          case 'section_kind': {
            const section = await container.documentService.updateSection({
              deckId: input.deck_ref,
              sectionId: input.section_id,
              kind: input.new_kind as import('../../types/section.js').SectionKind,
            });
            const summary = await container.deckService.getDeckSummary(input.deck_ref);
            return structuredResponse(
              { deck: summary, section },
              `Section kind updated to "${input.new_kind}"`,
            );
          }

          case 'break_hints': {
            const { hints } = input;
            const section = await container.documentService.updateSection({
              deckId: input.deck_ref,
              sectionId: input.section_id,
              breakHints: {
                ...(hints.break_before !== undefined ? { breakBefore: hints.break_before } : {}),
                ...(hints.break_after !== undefined ? { breakAfter: hints.break_after } : {}),
                ...(hints.keep_together !== undefined ? { keepTogether: hints.keep_together } : {}),
                ...(hints.full_page !== undefined ? { fullPage: hints.full_page } : {}),
              },
            });
            const summary = await container.deckService.getDeckSummary(input.deck_ref);
            return structuredResponse(
              { deck: summary, section },
              `Break hints updated for section "${section.metadata.title}"`,
            );
          }

          case 'chrome_config': {
            await container.documentService.updateDocumentMeta(input.deck_ref, {
              chrome: input.chrome,
            });
            const summary = await container.deckService.getDeckSummary(input.deck_ref);
            return structuredResponse(
              { deck: summary },
              'Document chrome config updated',
            );
          }
        }
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
