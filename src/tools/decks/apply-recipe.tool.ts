/**
 * MCP Tool: apply_recipe
 *
 * v4.6: instantiate a stored layout recipe as a new slide on the
 * given deck. Equivalent to copying the recipe's IR and feeding it to
 * `add_slide`. Only works for recipes that carry an `ir` field —
 * pre-v4.6 HTML-only recipes (built-in recipes from the legacy
 * generator) cannot be instantiated this way and the tool returns
 * RECIPE_NOT_INSTANTIABLE so the agent knows to author from scratch.
 *
 * The recipe IR is the starting point; the agent typically follows up
 * with `apply_slide_node_edit` to swap the placeholder text/images for
 * the deck's actual content.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { soulId } from '../../types/common.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { PenguiError, ErrorCode } from '../../types/errors.js';
import { SlideIRSchema } from '../../domain/ir/index.js';
import {
  buildValidationDelta,
  buildValidationPresentation,
} from '../../domain/validation/validation-presentation.js';

export function registerApplyRecipeTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'apply_recipe',
    {
      title: 'Apply Recipe',
      description:
        'Instantiate a stored layout recipe as a new slide on `deck_id`. The recipe must ' +
        'carry IR — built-in recipes from before v4.6 are HTML-only and return ' +
        'RECIPE_NOT_INSTANTIABLE. ' +
        '\n\n' +
        'WORKFLOW — list recipes via `get_design_soul { include_recipes: true }`, pick one ' +
        'whose `ir` field is present, call this tool. The slide is added with the recipe\'s ' +
        'placeholder content; follow up with `apply_slide_node_edit` to swap individual ' +
        'nodes for the deck\'s real content. ' +
        '\n\n' +
        'INPUT — `deck_id` and `recipe_id`. Optionally `metadata` to override the auto-' +
        'generated title/type/narrative; if omitted, the recipe\'s name + description seed ' +
        'them. Optional `position` controls insertion (defaults to end). ' +
        '\n\n' +
        'RETURNS — `{ slide_id, position, slide_count, source_kind: "authored_ir", ' +
        'validation }` — same shape as add_slide.',
      inputSchema: z.object({
        deck_id: z.string().describe('UUID or slug of the slide-mode deck.'),
        recipe_id: z.string().describe('Recipe ID from the soul\'s recipe catalogue.'),
        metadata: z
          .object({
            title: z.string().nullish(),
            type: z.string().nullish(),
            narrative: z.string().nullish(),
          })
          .nullish()
          .describe('Optional metadata overrides; defaults pull from the recipe.'),
        position: z.number().int().nonnegative().nullish().describe('Insertion position; appends if omitted.'),
      }),
    },
    async ({ deck_id, recipe_id, metadata, position }) => {
      try {
        const summary = await container.deckService.getDeckSummary(deck_id);
        const sId = soulId(summary.soulId as string);

        const { recipes } = await container.soulService.get(sId, true);
        const recipe = (recipes ?? []).find((r) => r.id === recipe_id);
        if (!recipe) {
          throw new PenguiError(
            ErrorCode.INVALID_INPUT,
            `Recipe "${recipe_id}" not found on soul "${sId}".`,
            { recipe_id, soul_id: sId },
          );
        }
        if (!recipe.ir) {
          throw new PenguiError(
            ErrorCode.INVALID_INPUT,
            `Recipe "${recipe.name}" is HTML-only (pre-v4.6). It cannot be instantiated via apply_recipe; use it as a visual reference and author the slide IR yourself.`,
            { recipe_id, recipe_name: recipe.name, code: 'RECIPE_NOT_INSTANTIABLE' },
          );
        }

        const irParse = SlideIRSchema.safeParse(recipe.ir);
        if (!irParse.success) {
          throw new PenguiError(
            ErrorCode.INVALID_INPUT,
            `Recipe "${recipe.name}" has malformed IR; cannot instantiate.`,
            { recipe_id, issues: irParse.error.issues },
          );
        }

        const slide = await container.deckService.addSlide({
          deckId: deck_id,
          ir: irParse.data,
          metadata: {
            title: metadata?.title ?? recipe.name,
            type: metadata?.type ?? recipe.type,
            narrative: metadata?.narrative ?? recipe.description,
          },
          position: position ?? undefined,
        });

        const refreshed = await container.deckService.getDeckSummary(deck_id);
        const validation = await container.validationService.validateSlide(
          slide.html,
          sId,
          'lint',
          refreshed.format,
        );
        await container.deckService.updateSlide({
          deckId: deck_id,
          slideId: slide.id as string,
          lastValidation: validation,
        });

        const validationDelta = buildValidationDelta(validation, null);
        const validationPresentation = buildValidationPresentation(validationDelta);

        return textResponse({
          slide_id: slide.id,
          position: slide.position,
          slide_count: refreshed.slideCount,
          recipe_id: recipe.id,
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
