/**
 * MCP Tool: export_pdf
 *
 * Exports a deck as a PDF file.
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

export function registerExportPdfTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'export_pdf',
    {
      title: 'Export PDF',
      description: 'Export a deck as a PDF file. Returns metadata and file path. Set include_data to true to also receive the binary content as base64.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to export.'),
        mode: z.enum(['image', 'direct']).nullish().describe('PDF generation mode: "image" renders slides to PNG first, "direct" uses page.pdf(). Defaults to "image".'),
        include_data: BooleanParamSchema.describe('If true, include the PDF binary as a base64 embedded resource in the response. Defaults to false.'),
      }),
    },
    async ({ deck_id, mode, include_data }) => {
      try {
        // Get deck info and all slides
        const summary = await container.deckService.getDeckSummary(deck_id);
        const slides = await Promise.all(
          summary.slides.map((s) => container.deckService.getSlide(s.id as string)),
        );
        await validateSlidesForExport(container, deck_id, summary.soulId as string, slides);

        const result = await container.renderService.exportPdf(
          slides,
          summary.title,
          mode ?? undefined,
          summary.format,
        );

        // Write to output directory
        const outputDir = container.config.outputDir;
        fs.mkdirSync(outputDir, { recursive: true });
        const filePath = path.join(outputDir, result.filename);
        fs.writeFileSync(filePath, result.data);

        // Surface page-chrome metadata and any warnings from the export
        const metadata: {
          file_path: string;
          filename: string;
          file_size_bytes: number;
          slide_count: number;
          mime_type: string;
          page_chrome_applied: boolean;
          page_chrome_mode: string;
          warnings?: string[];
        } = {
          file_path: filePath,
          filename: result.filename,
          file_size_bytes: result.fileSizeBytes,
          slide_count: result.slideCount,
          mime_type: result.mimeType,
          page_chrome_applied: result.pageChromeApplied,
          page_chrome_mode: result.pageChromeMode,
        };

        if (result.warnings.length > 0) {
          metadata.warnings = result.warnings;
        }

        // Surface malformed @page-chrome JSON as a dedicated warning key
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
