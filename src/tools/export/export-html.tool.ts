/**
 * MCP Tool: export_html
 *
 * Exports a deck as a self-contained HTML file.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { BooleanParamSchema } from '../_shared/schemas.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { validateSlidesForExport } from './export-validation.js';

export function registerExportHtmlTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'export_html',
    {
      title: 'Export HTML',
      description:
        'Export a deck as a self-contained HTML file. Slide-model decks render as a single ' +
        'page with optional navigation; document-model decks (v4.18+) render as the ' +
        'continuous A4/Letter HTML the PDF exporter consumes — same composer, same fonts, ' +
        'same chrome, no Playwright needed. Set include_data to also receive the HTML content ' +
        'in the response.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to export.'),
        include_navigation: BooleanParamSchema.describe('Whether to include slide navigation controls. Slide-model only — ignored for document-model decks. Defaults to false.'),
        include_data: BooleanParamSchema.describe('If true, include the full HTML content as an embedded resource in the response. Defaults to false.'),
      }),
    },
    async ({ deck_id, include_navigation, include_data }) => {
      try {
        // Get deck info and all slides
        const summary = await container.deckService.getDeckSummary(deck_id);
        let result;
        if (summary.authoringModel === 'document') {
          // v4.18 — document-mode HTML export. Route through DocumentComposer
          // (the same path used for PDF) so cards / flow / decoration / fonts /
          // bg classes all flow through with full parity.
          const deckId = await container.deckService.resolveRefOrThrow(deck_id);
          const deck = (await container.deckStore.get(deckId))!;
          const sectionIds = deck.sectionIds ?? [];
          const sections = await Promise.all(
            sectionIds.map((sid) => container.sectionStore.get(sid)),
          );
          const validSections = sections.filter((s): s is NonNullable<typeof s> => Boolean(s));
          const { soul } = await container.soulService.get(deck.soulId);
          const documentMeta = deck.documentMeta ?? {};
          result = await container.renderService.exportDocumentHtml({
            sections: validSections,
            deck,
            soul,
            deckTitle: summary.title,
            documentMeta,
          });
        } else {
          const slides = await Promise.all(
            summary.slides.map((s) => container.deckService.getSlide(s.id as string)),
          );
          await validateSlidesForExport(container, deck_id, summary.soulId as string, slides);

          result = await container.renderService.exportHtml(
            slides,
            summary.title,
            include_navigation ?? false,
            summary.format,
          );
        }

        // Write to output directory
        const outputDir = container.config.outputDir;
        fs.mkdirSync(outputDir, { recursive: true });
        const filePath = path.join(outputDir, result.filename);
        fs.writeFileSync(filePath, result.data);

        const metadata = {
          file_path: filePath,
          filename: result.filename,
          file_size_bytes: result.fileSizeBytes,
          slide_count: result.slideCount,
          mime_type: result.mimeType,
        };

        if (include_data) {
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify(metadata, null, 2) },
              {
                type: 'resource' as const,
                resource: {
                  uri: `pengui://exports/${result.filename}`,
                  mimeType: result.mimeType,
                  text: result.data.toString('utf-8'),
                },
              },
            ],
          };
        }

        return textResponse(metadata);
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
