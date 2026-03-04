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
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerExportPdfTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'export_pdf',
    {
      title: 'Export PDF',
      description: 'Export a deck as a PDF file. Returns metadata and file path. Set include_data to true to also return the binary content as base64.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to export.'),
        mode: z.enum(['image', 'direct']).optional().describe('PDF generation mode: "image" renders slides to PNG first, "direct" uses page.pdf(). Defaults to "image".'),
        include_data: z.boolean().optional().describe('If true, include the PDF binary as a base64 embedded resource in the response. Defaults to false.'),
      }),
    },
    async ({ deck_id, mode, include_data }) => {
      try {
        // Get deck info and all slides
        const summary = await container.deckService.getDeckSummary(deck_id);
        const slides = await Promise.all(
          summary.slides.map((s) => container.deckService.getSlide(s.id as string)),
        );

        const result = await container.renderService.exportPdf(slides, summary.title, mode);

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
                  blob: result.data.toString('base64'),
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
