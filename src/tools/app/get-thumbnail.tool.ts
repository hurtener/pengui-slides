/**
 * MCP App Tool: get_thumbnail
 *
 * App-only tool (visibility: ['app']). Renders a PNG thumbnail for a single
 * slide or section and returns it as base64-encoded data alongside a revision
 * hash so the app can detect when to invalidate the cached image.
 *
 * Exactly one of `slide_id` or `section_id` must be set.
 * Sections are not yet directly renderable (they are fragments), so the
 * section thumbnail is synthesized from the section HTML rendered as a slide.
 */

import { z } from 'zod';
import { createHash } from 'node:crypto';
import type { ServiceContainer } from '../../container.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { DECK_EDITOR_RESOURCE_URI } from '../../resources/app-resources.js';
import { handleToolError } from '../_shared/error-handler.js';
import { structuredResponse } from '../_shared/responses.js';
import { PenguiError, ErrorCode } from '../../types/errors.js';
import { getFormat } from '../../domain/formats/format-registry.js';

const THUMB_SHORT_EDGE = 270;

export function registerGetThumbnailTool(server: McpServer, container: ServiceContainer): void {
  registerAppTool(
    server,
    'get_thumbnail',
    {
      title: 'Get Thumbnail',
      description:
        'Render a PNG thumbnail for a slide or section and return it as base64. ' +
        'Exactly one of slide_id or section_id must be set. ' +
        'The revision_hash field lets the app detect stale cached images.',
      inputSchema: z.object({
        deck_ref: z.string().describe('Deck UUID or slug.'),
        slide_id: z.string().optional().describe('Slide ID (for slide-model decks).'),
        section_id: z.string().optional().describe('Section ID (for document-model decks).'),
      }),
      _meta: {
        ui: {
          resourceUri: DECK_EDITOR_RESOURCE_URI,
          visibility: ['app'],
        },
      },
    },
    async ({ deck_ref, slide_id, section_id }) => {
      try {
        // Exactly one must be set
        if (!slide_id && !section_id) {
          throw new PenguiError(
            ErrorCode.INVALID_INPUT,
            'Exactly one of slide_id or section_id must be set.',
          );
        }
        if (slide_id && section_id) {
          throw new PenguiError(
            ErrorCode.INVALID_INPUT,
            'Only one of slide_id or section_id may be set, not both.',
          );
        }

        const summary = await container.deckService.getDeckSummary(deck_ref);
        const format = getFormat(summary.format);
        const { widthPx, heightPx, thumbnailAspect } = format.geometry;
        const thumbHeight = THUMB_SHORT_EDGE;
        const thumbWidth = Math.round(THUMB_SHORT_EDGE * thumbnailAspect);

        if (slide_id) {
          const slide = await container.deckService.getSlide(slide_id);
          const previews = await container.renderService.renderPreview(
            [slide],
            { width: thumbWidth, height: thumbHeight, nativeWidth: widthPx, nativeHeight: heightPx },
            summary.format,
          );
          const preview = previews[0];
          return structuredResponse(
            {
              png_base64: preview?.imageBase64 ?? '',
              revision_hash: slide.metadata.revisionHash,
              format: summary.format,
            },
            `Thumbnail rendered for slide "${slide.metadata.title}"`,
          );
        }

        // section_id branch
        const section = await container.documentService.getSection(section_id!);
        const revisionHash = createHash('sha256').update(section.html).digest('hex');

        // Wrap section HTML as a minimal slide for the renderer
        const wrappedHtml = `<section class="slide">${section.html}</section>`;
        const fakeSlide = {
          id: section.id,
          deckId: section.deckId,
          position: section.position,
          html: wrappedHtml,
          metadata: {
            title: section.metadata.title,
            type: 'content' as const,
            revisionHash,
            generatedAt: section.createdAt as string,
            soulId: section.metadata.soulId,
            deckId: section.metadata.deckId,
            position: section.position,
            metaVersion: '2.0' as const,
          },
          sourceKind: 'legacy_html' as const,
          translationIssues: [],
          createdAt: section.createdAt,
          updatedAt: section.updatedAt,
        };

        const previews = await container.renderService.renderPreview(
          [fakeSlide as unknown as Parameters<typeof container.renderService.renderPreview>[0][0]],
          { width: thumbWidth, height: thumbHeight, nativeWidth: widthPx, nativeHeight: heightPx },
          summary.format,
        );
        const preview = previews[0];
        return structuredResponse(
          {
            png_base64: preview?.imageBase64 ?? '',
            revision_hash: revisionHash,
            format: summary.format,
          },
          `Thumbnail rendered for section "${section.metadata.title}"`,
        );
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
