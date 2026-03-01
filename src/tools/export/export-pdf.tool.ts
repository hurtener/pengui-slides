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
      description: 'Export a deck as a PDF file. Returns the output file path and metadata.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to export.'),
        mode: z.enum(['image', 'direct']).optional().describe('PDF generation mode: "image" renders slides to PNG first, "direct" uses page.pdf(). Defaults to "image".'),
      }),
    },
    async ({ deck_id, mode }) => {
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

        return textResponse({
          file_path: filePath,
          file_size_bytes: result.fileSizeBytes,
          slide_count: result.slideCount,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
