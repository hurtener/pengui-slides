/**
 * MCP Tool: export_pptx
 *
 * Exports a deck as a PowerPoint (.pptx) file.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerExportPptxTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'export_pptx',
    {
      title: 'Export PPTX',
      description: 'Export a deck as a PowerPoint (.pptx) file. Returns the output file path and metadata.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to export.'),
        resolution: z.enum(['1080p', '4k']).optional().describe('Slide resolution. Defaults to "1080p".'),
        image_format: z.enum(['png', 'jpeg']).optional().describe('Image format for slides. Defaults to "png".'),
        jpeg_quality: z.number().optional().describe('JPEG quality (1-100). Only used when image_format is "jpeg". Defaults to 90.'),
      }),
    },
    async ({ deck_id, resolution, image_format, jpeg_quality }) => {
      try {
        // Get deck info and all slides
        const summary = await container.deckService.getDeckSummary(deck_id);
        const slides = await Promise.all(
          summary.slides.map((s) => container.deckService.getSlide(s.id as string)),
        );

        // Build export options
        const options: { resolution?: '1080p' | '4k'; imageFormat?: 'png' | 'jpeg'; jpegQuality?: number } = {};
        if (resolution !== undefined) options.resolution = resolution;
        if (image_format !== undefined) options.imageFormat = image_format;
        if (jpeg_quality !== undefined) options.jpegQuality = jpeg_quality;

        const result = await container.renderService.exportPptx(slides, summary.title, options);

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
