/**
 * MCP Tool: validate_slide
 *
 * Validates slide HTML against a Design Soul's token constraints.
 * Supports two depths: 'lint' (fast static) and 'full' (Playwright render).
 * When deck_id is provided the deck's format geometry is threaded into
 * the validation context so dimension checks match the deck's canvas size.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { soulId } from '../../types/common.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerValidateSlideTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'validate_slide',
    {
      title: 'Validate Slide',
      description: 'Validate slide HTML against a Design Soul. Returns issues, style score, and pass/fail status.',
      inputSchema: z.object({
        html: z.string().describe('The slide HTML to validate.'),
        soul_id: z.string().describe('The Design Soul to validate against.'),
        depth: z.enum(['lint', 'full']).nullish().describe('Validation depth: "lint" for fast static checks, "full" for Playwright render analysis. Defaults to "lint".'),
        deck_id: z.string().nullish().describe('The deck this slide belongs to. When provided, validation uses the deck\'s format geometry (canvas size, safe-area inset) instead of the slides_16_9 default.'),
      }),
    },
    async ({ html, soul_id, depth, deck_id }) => {
      try {
        const sId = soulId(soul_id);

        const format = deck_id != null
          ? await container.deckService.getDeckFormat(deck_id)
          : undefined;

        const result = await container.validationService.validateSlide(
          html,
          sId,
          depth ?? 'lint',
          format,
        );

        return textResponse(result);
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
