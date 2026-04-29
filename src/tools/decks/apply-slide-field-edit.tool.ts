/**
 * MCP Tool: apply_slide_field_edit
 *
 * v4.9c — patch one named field of an IR node inside a slide. The MCP
 * App calls this when the user finishes editing a `[data-ir-rt-field]`
 * element inline (rich-text field commit). It also works fine for
 * agent-side field tweaks where re-emitting the whole node would be
 * overkill.
 *
 * The `field` argument addresses one slot inside the IR node at
 * `path`. Grammar:
 *   - `"title"`        → top-level field (any IR node).
 *   - `"items[2]"`     → array slot inside a named field.
 *
 * Schema validation runs at the underlying `update_slide` step, so a
 * write that produces a malformed node (e.g. setting `title` to a
 * non-RichText value) surfaces as INVALID_INPUT with the underlying
 * Zod issue list. Mode-aware lint runs the same way structural ops
 * run it — doc-only nodes can still be rejected at commit time.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { soulId } from '../../types/common.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import {
  buildValidationDelta,
  buildValidationPresentation,
} from '../../domain/validation/validation-presentation.js';

const PATH_STEP = z.union([z.string(), z.number().int().nonnegative()]);
const PATH_SCHEMA = z
  .array(PATH_STEP)
  .min(2)
  .describe(
    'Path to the parent IR node (the one carrying the addressed field). ' +
      'Examples: ["body", 0]; ["body", 2, "left", 1].',
  );

export function registerApplySlideFieldEditTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'apply_slide_field_edit',
    {
      title: 'Apply Slide Field Edit',
      description:
        'Patch one named field of an IR node inside a slide. Cheaper than re-emitting the whole ' +
        'node when only one field changes (typical case: rich-text body or title edit from the App). ' +
        'Field grammar: `"title"` for a top-level field; `"items[N]"` for an array slot. ' +
        '`value` is JSON — typically a RichText body (`[{ text, bold?, italic?, … }]`).',
      inputSchema: z.object({
        deck_id: z.string(),
        slide_id: z.string(),
        path: PATH_SCHEMA,
        field: z.string().min(1),
        value: z.unknown(),
      }),
    },
    async ({ deck_id, slide_id, path, field, value }) => {
      try {
        const before = await container.deckService.getSlide(slide_id);
        const previousValidation = before.lastValidation ?? null;

        const slide = await container.deckService.applySlideFieldEdit({
          deckId: deck_id,
          slideId: slide_id,
          path,
          field,
          value,
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
          field,
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
