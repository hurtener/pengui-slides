/**
 * MCP Tool: validate_slide
 *
 * Validates slide HTML against a Design Soul's token constraints.
 * Supports two depths: 'lint' (fast static) and 'full' (Playwright render).
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
      }),
    },
    async ({ html, soul_id, depth }) => {
      try {
        const sId = soulId(soul_id);
        const result = await container.validationService.validateSlide(html, sId, depth ?? 'lint');

        return textResponse(result);
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
