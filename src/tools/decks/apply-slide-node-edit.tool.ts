/**
 * MCP Tool: apply_slide_node_edit
 *
 * v4.6: replace a single node inside a slide's IR tree without
 * resubmitting the whole body. Path-addressed — the caller passes a
 * sequence of structural keys ("body", number, optionally
 * "left"/"right", number). Cheaper than re-emitting `slide_ir` for
 * targeted edits.
 *
 * Example: change the title of the second hero in a slide:
 *   { slide_id, path: ["body", 1], new_node: { type: "hero", title: ... } }
 *
 * Example: change the right column's first node in a two-column layout:
 *   { slide_id, path: ["body", 0, "right", 0], new_node: { ... } }
 *
 * Example: change the second cell's first node in a grid (v4.8):
 *   { slide_id, path: ["body", 2, "cells", 1, 0], new_node: { ... } }
 *
 * After the replacement the slide's IR is committed via update_slide,
 * so HTML recompiles and validation re-runs. Errors flow through the
 * standard tool error path. Mode-aware lint runs at update_slide time —
 * inserting a doc-only node (toc / bibliography / page_break) into a
 * slide IR is rejected with INVALID_INPUT.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { soulId } from '../../types/common.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { SlideNodeSchema } from '../../domain/ir/index.js';
import {
  buildValidationDelta,
  buildValidationPresentation,
} from '../../domain/validation/validation-presentation.js';

const PATH_STEP = z.union([z.string(), z.number().int().nonnegative()]);
const PATH_SCHEMA = z
  .array(PATH_STEP)
  .min(2)
  .describe(
    'Structural path into the IR tree. Starts with "body" then a numeric index; ' +
      'two_column nodes accept "left"/"right" + numeric index; grid nodes accept ' +
      '"cells" + row index + cell index. Examples: ["body", 0]; ' +
      '["body", 2, "right", 1]; ["body", 3, "cells", 1, 0].',
  );

export function registerApplySlideNodeEditTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'apply_slide_node_edit',
    {
      title: 'Apply Slide Node Edit',
      description:
        'Replace a single IR node inside a slide at the given path. Cheaper than ' +
        'resubmitting the full slide_ir for targeted edits (e.g. swapping a hero title or ' +
        'fixing one prose block). The slide must be IR-authored (sourceKind="authored_ir"). ' +
        '\n\n' +
        'INPUT — `path` is an array of structural steps. Start with "body" then a numeric ' +
        'index. To descend into a two_column, append "left" or "right" plus an index; into ' +
        'a grid, append "cells" + row index + cell index. ' +
        '`new_node` is one of the IR node types in `pengui://schema/slide-ir`. Inside ' +
        'two_column.left/right and grid.cells[i] the replacement must be a LEAF node (no ' +
        'nested two_column / grid). Doc-only nodes (toc, bibliography, page_break) are ' +
        'rejected by the slide-mode lint at update_slide time. ' +
        '\n\n' +
        'RETURNS — `{ slide_id, path, source_kind, validation, validation_delta }`. The ' +
        'slide is recompiled and re-validated against the deck\'s soul.',
      inputSchema: z.object({
        deck_id: z.string().describe('UUID or slug of the deck containing the slide.'),
        slide_id: z.string().describe('UUID of the slide to edit.'),
        path: PATH_SCHEMA,
        new_node: SlideNodeSchema.describe('Replacement node (any IR node type).'),
      }),
    },
    async ({ deck_id, slide_id, path, new_node }) => {
      try {
        const before = await container.deckService.getSlide(slide_id);
        const previousValidation = before.lastValidation ?? null;

        const slide = await container.deckService.applySlideNodeEdit({
          deckId: deck_id,
          slideId: slide_id,
          path,
          newNode: new_node,
        });

        const summary = await container.deckService.getDeckSummary(deck_id);
        const validation = await container.validationService.validateSlide(
          slide.html,
          soulId(summary.soulId as string),
          'lint',
          summary.format,
        );
        await container.deckService.updateSlide({
          deckId: deck_id,
          slideId: slide_id,
          lastValidation: validation,
        });

        const validationDelta = buildValidationDelta(validation, previousValidation);
        const validationPresentation = buildValidationPresentation(validationDelta);

        return textResponse({
          slide_id: slide.id,
          path,
          source_kind: slide.sourceKind,
          validation,
          validation_delta: validationDelta,
          validation_presentation: validationPresentation,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
