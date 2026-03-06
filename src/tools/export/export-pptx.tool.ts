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
import { BooleanParamSchema } from '../_shared/schemas.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { validateSlidesForExport } from './export-validation.js';

export function registerExportPptxTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'export_pptx',
    {
      title: 'Export PPTX',
      description: 'Export a deck as a PowerPoint (.pptx) file. Returns metadata and file path. Set include_data to true to also receive the binary content as base64.',
      inputSchema: z.object({
        deck_id: z.string().describe('The deck to export.'),
        resolution: z.enum(['1080p', '4k']).nullish().describe('Slide resolution. Defaults to "1080p".'),
        image_format: z.enum(['png', 'jpeg']).nullish().describe('Image format for slides. Defaults to "png".'),
        jpeg_quality: z.number().nullish().describe('JPEG quality (1-100). Only used when image_format is "jpeg". Defaults to 90.'),
        include_data: BooleanParamSchema.describe('If true, include the PPTX binary as a base64 embedded resource in the response. Defaults to false.'),
      }),
    },
    async ({ deck_id, resolution, image_format, jpeg_quality, include_data }) => {
      try {
        // Get deck info and all slides
        const summary = await container.deckService.getDeckSummary(deck_id);
        const slides = await Promise.all(
          summary.slides.map((s) => container.deckService.getSlide(s.id as string)),
        );
        await validateSlidesForExport(container, deck_id, summary.soulId as string, slides);

        // Build export options
        const options: { resolution?: '1080p' | '4k'; imageFormat?: 'png' | 'jpeg'; jpegQuality?: number } = {};
        if (resolution != null) options.resolution = resolution;
        if (image_format != null) options.imageFormat = image_format;
        if (jpeg_quality != null) options.jpegQuality = jpeg_quality;

        const result = await container.renderService.exportPptx(slides, summary.title, options);

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
