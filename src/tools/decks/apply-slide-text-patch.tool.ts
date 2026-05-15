/**
 * MCP Tool: apply_slide_text_patch
 *
 * v4.22 — surgical text find/replace on a string-typed field of an
 * IR node. Cuts edit-path output token cost for code-heavy slides:
 * instead of re-emitting an entire ~1.5 KB SQL via
 * `apply_slide_field_edit`, the agent emits a small `find` snippet
 * and its `replace` and the server splices it in place.
 *
 * The `field` argument addresses one slot inside the IR node at
 * `path`. Grammar extends the plain `setNodeFieldAtPath` form:
 *   - `"code"`        → a top-level string field on the node.
 *   - `"items[2]"`    → an array slot (must hold a string).
 *   - `"body[0].text"`→ dotted descent into a RichText run's text.
 *
 * Semantics:
 *   - `find` MUST occur exactly once in the field's current value.
 *     Zero matches → SLIDE_TEXT_EDIT_NOT_FOUND. Multiple matches →
 *     INVALID_INPUT (caller must extend the snippet to be unique).
 *   - `replace` is taken verbatim — no regex, no group references.
 *   - The slide goes through the usual recompile + mode-aware lint
 *     pipeline. Schema validation at commit time rejects writes that
 *     would produce malformed IR.
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

export function registerApplySlideTextPatchTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'apply_slide_text_patch',
    {
      title: 'Apply Slide Text Patch',
      description:
        'Find/replace a unique substring inside a string-typed field of an IR node. Use this ' +
        'instead of `apply_slide_field_edit` when only a small portion of a long string ' +
        '(code_block.code, a long prose run, a multi-line SQL) needs to change — saves the LLM ' +
        'from re-emitting the entire value and avoids JSON-escaping mistakes. ' +
        '\n\n' +
        'FIELD GRAMMAR — `"code"` for a top-level string; `"items[2]"` for a string-valued ' +
        'array slot; `"body[0].text"` to patch the `text` of a specific RichText run. ' +
        '\n\n' +
        'SEMANTICS — `find` must occur EXACTLY ONCE in the current value. Zero matches returns ' +
        'SLIDE_TEXT_EDIT_NOT_FOUND; multiple matches returns INVALID_INPUT (extend the snippet). ' +
        '`replace` is taken verbatim (no regex). ' +
        '\n\n' +
        'RETURNS — `{ slide_id, path, field, source_kind, validation, validation_delta }`. The ' +
        'slide is recompiled and re-validated against the deck\'s soul.',
      inputSchema: z.object({
        deck_id: z.string().describe('UUID or slug of the deck containing the slide.'),
        slide_id: z.string().describe('UUID of the slide to edit.'),
        path: PATH_SCHEMA,
        field: z
          .string()
          .min(1)
          .describe(
            'Dotted field path inside the node. `"code"` for code_block.code; `"body[0].text"` ' +
              'for the first RichText run on a callout / hero / prose.',
          ),
        find: z
          .string()
          .min(1)
          .describe('Substring to replace. Must occur exactly once in the current value.'),
        replace: z
          .string()
          .describe('Replacement substring. May be empty (delete). Verbatim — no regex.'),
      }),
    },
    async ({ deck_id, slide_id, path, field, find, replace }) => {
      try {
        const before = await container.deckService.getSlide(slide_id);
        const previousValidation = before.lastValidation ?? null;

        const slide = await container.deckService.applySlideTextPatch({
          deckId: deck_id,
          slideId: slide_id,
          path,
          field,
          find,
          replace,
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
