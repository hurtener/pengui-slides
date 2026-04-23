/**
 * MCP Tool: add_section
 *
 * Appends a section (content block) to a continuous-document print deck.
 * Sections are HTML FRAGMENTS, not full documents — the DocumentComposer
 * concatenates them at export time and lets Chromium paginate.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { ALL_SECTION_KINDS } from '../../types/section.js';

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
    reset_page_counter: z.boolean().nullish().describe('Reset the page counter at this section (e.g. Part II restarts at 1).'),
  })
  .nullish();

const metadataSchema = z.object({
  title: z.string().describe('Section title.'),
  narrative: z.string().describe('Narrative description of the section.'),
  key_points: z.array(z.string()).nullish().describe('Key points covered in this section.'),
  tags: z.array(z.string()).nullish().describe('Tags for categorisation.'),
  sources: z.array(sourceSchema).nullish().describe('Source attributions.'),
  chrome_overrides: chromeOverridesSchema.describe('Per-section chrome overrides (hide, running title, page-counter reset).'),
});

const breakHintsSchema = z
  .object({
    break_before: z.enum(['auto', 'page', 'avoid']).nullish().describe('Force a page break before this section.'),
    break_after: z.enum(['auto', 'page', 'avoid']).nullish().describe('Force a page break after this section.'),
    keep_together: z.boolean().nullish().describe('Prevent splitting across pages.'),
    full_page: z.boolean().nullish().describe('Render as a full-page block (min-height 100vh + break-after page).'),
  })
  .nullish();

export function registerAddSectionTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'add_section',
    {
      title: 'Add Section',
      description:
        'Add a section (content block) to a continuous-document print deck. Sections are HTML FRAGMENTS — no DOCTYPE, no <html>/<head>/<body>, no standalone <style> blocks, no :root custom properties, no fixed page-shaped dimensions. Root element MUST be `<section class="pengui-section pengui-{kind}">`. Wrap keep-together content in canonical classes (.pengui-figure, .pengui-chart, .pengui-diagram, .pengui-callout, .pengui-quote, .pengui-image) so universal break rules apply. See pengui://docs/document-mode for the authoring guide.',
      inputSchema: z.object({
        deck_id: z.string().describe('The document-mode deck to add the section to.'),
        kind: z
          .enum(ALL_SECTION_KINDS as [string, ...string[]])
          .describe('Section kind (drives break defaults and structural validation).'),
        html: z.string().describe('The section HTML fragment.'),
        metadata: metadataSchema.describe('Section metadata.'),
        break_hints: breakHintsSchema.describe('Per-section pagination overrides.'),
        position: z.number().nullish().describe('Zero-based position to insert the section. Appends to end if omitted.'),
      }),
    },
    async ({ deck_id, kind, html, metadata, break_hints, position }) => {
      try {
        const chromeOverrides = metadata.chrome_overrides
          ? {
              ...(metadata.chrome_overrides.hide != null
                ? { hide: metadata.chrome_overrides.hide }
                : {}),
              ...(metadata.chrome_overrides.running_title != null
                ? { runningTitle: metadata.chrome_overrides.running_title }
                : {}),
              ...(metadata.chrome_overrides.reset_page_counter != null
                ? { resetPageCounter: metadata.chrome_overrides.reset_page_counter }
                : {}),
            }
          : undefined;

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

        const section = await container.documentService.addSection({
          deckId: deck_id,
          kind: kind as Parameters<typeof container.documentService.addSection>[0]['kind'],
          html,
          metadata: {
            title: metadata.title,
            narrative: metadata.narrative,
            ...(metadata.key_points != null ? { keyPoints: metadata.key_points } : {}),
            ...(metadata.tags != null ? { tags: metadata.tags } : {}),
            ...(metadata.sources != null ? { sources: metadata.sources } : {}),
            ...(chromeOverrides ? { chromeOverrides } : {}),
          },
          ...(breakHints ? { breakHints } : {}),
          ...(position != null ? { position } : {}),
        });

        const deck = await container.deckService.getDeckSummary(deck_id);

        return textResponse({
          section_id: section.id,
          position: section.position,
          kind: section.kind,
          section_count: deck.sectionCount,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
