/**
 * MCP Tool: render_section_preview
 *
 * Renders a single section of a document-mode deck to a base64-encoded
 * PNG. Composes the section through DocumentComposer with the deck's
 * soul + recipe CSS, so the preview matches what the section will look
 * like in the final exported PDF (modulo Stage 2 pagination effects, which
 * only manifest in the multi-section context).
 *
 * Counterpart to `render_preview` (slides-only). For document decks the
 * agent has no per-section visual feedback before export — this tool
 * closes that gap so an agent can do a "does it look right?" check after
 * each add_section instead of stacking 22 sections blind.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { getFormat } from '../../domain/formats/format-registry.js';
import {
  DeckNotFoundError,
  FormatNotExportableError,
  PenguiError,
  ErrorCode,
  SoulNotFoundError,
} from '../../types/errors.js';
import { DocumentComposer } from '../../domain/rendering/document-composer.js';
import type { DocumentMeta } from '../../types/deck.js';

const DEFAULT_SCALE = 1;

export function registerRenderSectionPreviewTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'render_section_preview',
    {
      title: 'Render Section Preview',
      description:
        'Render a single section of a document-mode deck to a base64-encoded PNG, composed with the deck\'s ' +
        'soul + recipe CSS. Counterpart to `render_preview` (which is slides-only). ' +
        '\n\n' +
        'WHEN TO CALL — after `add_section` / `update_section` / `promote_section_root` / `wrap_section_root`, ' +
        'when the structural validation passes but you want a visual sanity check before stacking more ' +
        'sections. Especially useful for kinds where token-correct content can still look wrong (cover, ' +
        'figure, table layouts). ' +
        '\n\n' +
        'INPUT — `deck_id` + `section_id` (required); optional `scale` (0.25–2.0, default 1.0) trades ' +
        'image size for clarity. The screenshot uses fullPage capture so tall sections (long bibliographies, ' +
        'extended prose) are not clipped at the page boundary. ' +
        '\n\n' +
        'OUTPUT — `{ section_id, kind, image_base64, format: "png", width, height, render_time_ms, warnings[] }`. ' +
        '`warnings` carries any composer-level issues (recipe missing, asset unresolvable). ' +
        '\n\n' +
        'FAILURE MODES — `WRONG_AUTHORING_MODEL` if the deck is slides-mode (use `render_preview` there); ' +
        '`DECK_NOT_FOUND` if the deck is missing; `SECTION_NOT_FOUND` if the section doesn\'t belong to the ' +
        'deck. Stage 2 pagination/keep-together checks are NOT run by this tool — they require the full ' +
        'composed document and only run at `export_pdf` (or a future `preview_document`).',
      inputSchema: z.object({
        deck_id: z.string().describe('UUID or slug of the document-mode deck.'),
        section_id: z.string().describe('UUID of the section to preview.'),
        scale: z
          .number()
          .min(0.25)
          .max(2.0)
          .nullish()
          .describe(
            'Multiplier on the deck\'s native page width. 1.0 (default) renders at native A4/Letter ' +
              'pixel dimensions; 0.5 produces a thumbnail; 2.0 produces a hi-DPI capture for closer ' +
              'inspection. Height scales proportionally with content.',
          ),
      }),
    },
    async ({ deck_id, section_id, scale }) => {
      try {
        const summary = await container.deckService.getDeckSummary(deck_id);
        if (summary.authoringModel !== 'document') {
          throw new FormatNotExportableError(
            summary.format,
            'render_section_preview',
            'render_preview',
          );
        }

        const section = await container.documentService.getSection(section_id);
        if ((section.deckId as string) !== (summary.id as string)) {
          throw new PenguiError(
            ErrorCode.SECTION_NOT_FOUND,
            `Section ${section_id} does not belong to deck ${deck_id}.`,
            { deckId: deck_id, sectionId: section_id },
          );
        }

        const deck = await container.deckStore.get(summary.id);
        if (!deck) throw new DeckNotFoundError(deck_id);

        const soulRecord = await container.soulStore.get(summary.soulId);
        if (!soulRecord) throw new SoulNotFoundError(summary.soulId as string);

        const format = getFormat(summary.format);
        const geometry = format.geometry;
        const documentMeta: DocumentMeta = deck.documentMeta ?? {};

        // Compose just this one section so the preview shows it the way
        // the document composer would assemble it: with soul tokens,
        // recipe CSS, chrome scoping, and break attributes. The composer
        // does not require multi-section context for single-section
        // composition — TOC bodies will be empty, but other kinds render
        // normally.
        const composer = new DocumentComposer(container.logger.child('section-preview'));
        const composed = await composer.compose({
          sections: [section],
          deck,
          soul: soulRecord,
          geometry,
          documentMeta,
          resolveAssets: true,
          assetService: container.assetService,
        });

        const requestedScale = scale ?? DEFAULT_SCALE;
        const viewportWidth = Math.round(geometry.widthPx * requestedScale);
        const viewportHeight = Math.round(geometry.heightPx * requestedScale);

        const result = await container.renderService.renderSlideHtml(
          composed.html,
          section.id as string,
          {
            width: viewportWidth,
            height: viewportHeight,
            deviceScaleFactor: requestedScale >= 1 ? 1 : 1,
            format: 'png',
            fullPage: true,
          },
        );

        return textResponse({
          section_id: section.id,
          kind: section.kind,
          image_base64: result.imageData.toString('base64'),
          format: result.format,
          width: result.width,
          height: result.height,
          render_time_ms: result.renderTimeMs,
          warnings: composed.warnings,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
