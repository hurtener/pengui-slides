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
      description: 'Export a deck as a self-contained HTML file with optional slide navigation. Set include_data to true to also receive the HTML content in the response.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to export.'),
        include_navigation: BooleanParamSchema.describe('Whether to include slide navigation controls. Defaults to false.'),
        include_data: BooleanParamSchema.describe('If true, include the full HTML content as an embedded resource in the response. Defaults to false.'),
      }),
    },
    async ({ deck_id, include_navigation, include_data }) => {
      try {
        // Get deck info and all slides
        const summary = await container.deckService.getDeckSummary(deck_id);
        const slides = await Promise.all(
          summary.slides.map((s) => container.deckService.getSlide(s.id as string)),
        );
        await validateSlidesForExport(container, deck_id, summary.soulId as string, slides);

        const result = await container.renderService.exportHtml(
          slides,
          summary.title,
          include_navigation ?? false,
          summary.format,
        );

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
