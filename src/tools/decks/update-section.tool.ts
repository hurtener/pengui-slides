/**
 * MCP Tool: update_section
 *
 * Mutates a section's HTML, kind, break hints, and/or metadata.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { ALL_SECTION_KINDS } from '../../types/section.js';
import { soulId } from '../../types/common.js';

const sourceSchema = z.object({
  url: z.string().optional().describe('Source URL.'),
  title: z.string().optional().describe('Source title.'),
  quoteSpan: z.string().optional().describe('Quoted text span from the source.'),
  confidence: z.number().optional().describe('Confidence score (0-1).'),
  retrievedAt: z.string().optional().describe('ISO timestamp of when the source was retrieved.'),
});

const chromeOverridesSchema = z
  .object({
    hide: z.boolean().nullish().describe('Suppress running chrome on pages this section occupies.'),
    running_title: z.string().nullish().describe('Running title to show while this section is on the page.'),
    reset_page_counter: z.boolean().nullish().describe('Reset the page counter at this section.'),
  })
  .nullish();

const partialMetadataSchema = z
  .object({
    title: z.string().nullish().describe('Section title.'),
    narrative: z.string().nullish().describe('Narrative description.'),
    key_points: z.array(z.string()).nullish().describe('Key points.'),
    tags: z.array(z.string()).nullish().describe('Tags.'),
    sources: z.array(sourceSchema).nullish().describe('Source attributions.'),
    chrome_overrides: chromeOverridesSchema.describe('Per-section chrome overrides.'),
  })
  .nullish();

const breakHintsSchema = z
  .object({
    break_before: z.enum(['auto', 'page', 'avoid']).nullish().describe('Force a page break before this section.'),
    break_after: z.enum(['auto', 'page', 'avoid']).nullish().describe('Force a page break after this section.'),
    keep_together: z.boolean().nullish().describe('Prevent splitting across pages.'),
    full_page: z.boolean().nullish().describe('Render as a full-page block.'),
  })
  .nullish();

export function registerUpdateSectionTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'update_section',
    {
      title: 'Update Section',
      description:
        'Update any combination of a section\'s HTML, kind, break hints, or metadata. ' +
        'Only valid for document-model decks. All fields are optional — pass only what you want to change. ' +
        '\n\n' +
        'FRAGMENT CONTRACT — when replacing `html`, the same rules as `add_section` apply: one ' +
        '`<section class="pengui-section pengui-{kind}">` root, no DOCTYPE/html/head/body/script/style, ' +
        'no `:root { }`, no fixed page dimensions. Do NOT emit `<!-- @section-meta -->` — the server ' +
        'always re-injects it from the current metadata struct, including when you change `metadata` ' +
        'without touching `html`. ' +
        '\n\n' +
        'KIND CHANGES — if you only pass `kind` (without `html`), the stored HTML keeps its old ' +
        '`pengui-{old-kind}` class. Call `promote_section_root` afterwards to normalize the class ' +
        'list, or resubmit `html` with the new kind class. ' +
        '\n\n' +
        'VALIDATION — response includes a `validation` block. Repair tools: `promote_section_root` ' +
        '(single non-`<section>` root), `wrap_section_root` (multiple top-level nodes). ' +
        '\n\n' +
        'See `pengui://docs/document-mode`.',
      inputSchema: z.object({
        deck_id: z.string().describe('UUID or slug of the deck containing the section.'),
        section_id: z.string().describe('UUID of the section to update.'),
        html: z
          .string()
          .nullish()
          .describe(
            'New HTML fragment. Same contract as `add_section.html`: one `<section>` root, no ' +
              'DOCTYPE/document-level tags, no @section-meta comment (server re-injects it).',
          ),
        kind: z
          .enum(ALL_SECTION_KINDS as [string, ...string[]])
          .nullish()
          .describe(
            'New SectionKind. Changes break defaults and kind-specific shape checks. If you do not ' +
              'also resubmit `html`, the stored wrapper may still carry the old pengui-{kind} class — ' +
              'call `promote_section_root` after to resync.',
          ),
        break_hints: breakHintsSchema.describe(
          'Per-section pagination overrides to MERGE (not replace) onto the section\'s current hints. ' +
            'Pass null for a field to leave it unchanged.',
        ),
        metadata: partialMetadataSchema.describe(
          'Partial metadata fields to update. Any field you pass overwrites the current value; omitted ' +
            'fields are left unchanged. Re-embedding the @section-meta comment happens automatically.',
        ),
      }),
    },
    async ({ deck_id, section_id, html, kind, break_hints, metadata }) => {
      try {
        const breakHints = break_hints
          ? {
              ...(break_hints.break_before != null
                ? { breakBefore: break_hints.break_before }
                : {}),
              ...(break_hints.break_after != null
                ? { breakAfter: break_hints.break_after }
                : {}),
              ...(break_hints.keep_together != null
                ? { keepTogether: break_hints.keep_together }
                : {}),
              ...(break_hints.full_page != null
                ? { fullPage: break_hints.full_page }
                : {}),
            }
          : undefined;

        const mappedMetadata = metadata
          ? {
              ...(metadata.title != null ? { title: metadata.title } : {}),
              ...(metadata.narrative != null ? { narrative: metadata.narrative } : {}),
              ...(metadata.key_points != null ? { keyPoints: metadata.key_points } : {}),
              ...(metadata.tags != null ? { tags: metadata.tags } : {}),
              ...(metadata.sources != null ? { sources: metadata.sources } : {}),
              ...(metadata.chrome_overrides != null
                ? {
                    chromeOverrides: {
                      ...(metadata.chrome_overrides.hide != null
                        ? { hide: metadata.chrome_overrides.hide }
                        : {}),
                      ...(metadata.chrome_overrides.running_title != null
                        ? { runningTitle: metadata.chrome_overrides.running_title }
                        : {}),
                      ...(metadata.chrome_overrides.reset_page_counter != null
                        ? { resetPageCounter: metadata.chrome_overrides.reset_page_counter }
                        : {}),
                    },
                  }
                : {}),
            }
          : undefined;

        const section = await container.documentService.updateSection({
          deckId: deck_id,
          sectionId: section_id,
          ...(html != null ? { html } : {}),
          ...(kind != null
            ? { kind: kind as Parameters<typeof container.documentService.updateSection>[0]['kind'] }
            : {}),
          ...(breakHints ? { breakHints } : {}),
          ...(mappedMetadata ? { metadata: mappedMetadata } : {}),
        });

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
          title: section.metadata.title,
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
