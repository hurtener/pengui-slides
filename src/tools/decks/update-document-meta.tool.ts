/**
 * MCP Tool: update_document_meta
 *
 * Sets chrome / page margins / TOC config on a document-mode deck.
 * Shallow-merges into existing DocumentMeta.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { ALL_SECTION_KINDS, type SectionKind } from '../../types/section.js';
import type { DocumentMeta } from '../../types/deck.js';

const chromeSchema = z
  .object({
    running_title: z.string().nullish().describe('Running title rendered in the header strip. Defaults to deck.title.'),
    page_number: z.boolean().nullish().describe('Whether to render page numbers in the footer.'),
    footer_align: z.enum(['left', 'center', 'right']).nullish().describe('Footer text alignment.'),
    hide: z.boolean().nullish().describe('Suppress chrome entirely.'),
  })
  .nullish();

const pageMarginSchema = z
  .object({
    top: z.string().describe('Top margin (CSS unit, e.g. "18mm").'),
    right: z.string().describe('Right margin.'),
    bottom: z.string().describe('Bottom margin.'),
    left: z.string().describe('Left margin.'),
  })
  .nullish();

const tocSchema = z
  .object({
    max_depth: z.number().nullish().describe('Maximum heading depth to include in the TOC.'),
    include_kinds: z
      .array(z.enum(ALL_SECTION_KINDS as [string, ...string[]]))
      .nullish()
      .describe('Section kinds to include in the auto-generated TOC.'),
  })
  .nullish();

export function registerUpdateDocumentMetaTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'update_document_meta',
    {
      title: 'Update Document Meta',
      description:
        'Set deck-level chrome (running title, page numbers), page margins, and TOC config on a document-mode deck. Merges into existing documentMeta. Top-level fields (chrome, page_margin, toc) you OMIT keep their previous values. Inside chrome and toc the merge goes one level deeper — omitted sub-fields (e.g. runningTitle, footerAlign) also keep their previous values. page_margin is ATOMIC: providing it replaces all four sides at once (the schema requires top/right/bottom/left together).',
      inputSchema: z.object({
        deck_id: z.string().describe('The document-mode deck to configure.'),
        meta: z
          .object({
            chrome: chromeSchema.describe('Running chrome (header/footer + page numbers).'),
            page_margin: pageMarginSchema.describe('Page-box margins as CSS strings.'),
            toc: tocSchema.describe('TOC auto-generation config.'),
          })
          .describe('Document meta fields to merge.'),
      }),
    },
    async ({ deck_id, meta }) => {
      try {
        const partial: Partial<DocumentMeta> = {};

        if (meta.chrome !== undefined && meta.chrome !== null) {
          partial.chrome = {
            ...(meta.chrome.running_title != null
              ? { runningTitle: meta.chrome.running_title }
              : {}),
            ...(meta.chrome.page_number != null
              ? { pageNumber: meta.chrome.page_number }
              : {}),
            ...(meta.chrome.footer_align != null
              ? { footerAlign: meta.chrome.footer_align }
              : {}),
            ...(meta.chrome.hide != null ? { hide: meta.chrome.hide } : {}),
          };
        }

        if (meta.page_margin !== undefined && meta.page_margin !== null) {
          partial.pageMargin = {
            top: meta.page_margin.top,
            right: meta.page_margin.right,
            bottom: meta.page_margin.bottom,
            left: meta.page_margin.left,
          };
        }

        if (meta.toc !== undefined && meta.toc !== null) {
          partial.toc = {
            ...(meta.toc.max_depth != null ? { maxDepth: meta.toc.max_depth } : {}),
            ...(meta.toc.include_kinds != null
              ? { includeKinds: meta.toc.include_kinds as SectionKind[] }
              : {}),
          };
        }

        const deck = await container.documentService.updateDocumentMeta(deck_id, partial);

        return structuredResponse({
          deck_id: deck.id as string,
          document_meta: deck.documentMeta ?? {},
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
