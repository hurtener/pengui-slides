/**
 * MCP Tool: export_pdf
 *
 * Exports a deck as a PDF file. The pipeline branches on the deck's
 * authoring model:
 *
 *   - 'slides'   → legacy per-slide export (slides_16_9 + legacy print).
 *                  Uses the per-slide Stage 1/2 validator and the
 *                  PdfExporter's image/direct modes.
 *   - 'document' → v3 continuous-document export. Composes the full
 *                  document once and runs the Document Stage 2 validator
 *                  (split-keep-together, orphan-heading) against the
 *                  composed HTML.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { BooleanParamSchema } from '../_shared/schemas.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { deckId, soulId } from '../../types/common.js';
import {
  validateSlidesForExport,
  validateSectionsForExport,
} from './export-validation.js';
import { DeckNotFoundError } from '../../types/errors.js';

export function registerExportPdfTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'export_pdf',
    {
      title: 'Export PDF',
      description:
        'Export a deck as a PDF file. Routes by authoring model: slides decks run the per-slide pipeline (mode="image"|"direct"), document decks run the continuous-document composer + Chromium paginator (mode is ignored). Returns metadata and file path. Set include_data to true to also receive the binary content as base64.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to export.'),
        mode: z.enum(['image', 'direct']).nullish().describe('PDF generation mode for slide-model decks: "image" renders slides to PNG first, "direct" uses page.pdf(). Ignored for document-model decks. Defaults to "image".'),
        include_data: BooleanParamSchema.describe('If true, include the PDF binary as a base64 embedded resource in the response. Defaults to false.'),
      }),
    },
    async ({ deck_id, mode, include_data }) => {
      try {
        const summary = await container.deckService.getDeckSummary(deck_id);

        let result: Awaited<ReturnType<typeof container.renderService.exportPdf>>;

        if (summary.authoringModel === 'document') {
          // ── Document (v3) path ────────────────────────────────────
          const deck = await container.deckStore.get(deckId(deck_id));
          if (!deck) throw new DeckNotFoundError(deck_id);

          const sections = await container.sectionStore.getByDeck(deck.id);
          sections.sort((a, b) => a.position - b.position);

          await validateSectionsForExport(container, deck, summary.soulId as string, sections);

          const soul = await container.soulStore.get(soulId(summary.soulId as string));
          if (!soul) throw new Error(`soul not found: ${summary.soulId}`);

          result = await container.renderService.exportDocumentPdf({
            sections,
            deck,
            soul,
            deckTitle: summary.title,
            documentMeta: deck.documentMeta ?? {},
          });
        } else {
          // ── Slide (v2 / legacy) path ──────────────────────────────
          const slides = await Promise.all(
            summary.slides.map((s) => container.deckService.getSlide(s.id as string)),
          );
          await validateSlidesForExport(container, deck_id, summary.soulId as string, slides);

          result = await container.renderService.exportPdf(
            slides,
            summary.title,
            mode ?? undefined,
            summary.format,
          );
        }

        // Write to output directory.
        const outputDir = container.config.outputDir;
        fs.mkdirSync(outputDir, { recursive: true });
        const filePath = path.join(outputDir, result.filename);
        fs.writeFileSync(filePath, result.data);

        const metadata: {
          file_path: string;
          filename: string;
          file_size_bytes: number;
          slide_count: number;
          mime_type: string;
          authoring_model: 'slides' | 'document';
          page_chrome_applied: boolean;
          page_chrome_mode: string;
          warnings?: string[];
        } = {
          file_path: filePath,
          filename: result.filename,
          file_size_bytes: result.fileSizeBytes,
          slide_count: result.slideCount,
          mime_type: result.mimeType,
          authoring_model: summary.authoringModel,
          page_chrome_applied: result.pageChromeApplied,
          page_chrome_mode: result.pageChromeMode,
        };

        if (result.warnings.length > 0) {
          metadata.warnings = result.warnings;
        }

        const invalidJsonWarnings = result.warnings.filter((w) =>
          w.includes('@page-chrome JSON is malformed'),
        );
        const responseObject: Record<string, unknown> = { ...metadata };
        if (invalidJsonWarnings.length > 0) {
          responseObject.page_chrome_invalid_json = invalidJsonWarnings;
        }

        if (include_data) {
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify(responseObject, null, 2) },
              {
                type: 'resource' as const,
                resource: {
                  uri: `pengui://exports/${result.filename}`,
                  mimeType: result.mimeType,
                  blob: result.data.toString('base64'),
                },
              },
            ],
          };
        }

        return textResponse(responseObject);
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
