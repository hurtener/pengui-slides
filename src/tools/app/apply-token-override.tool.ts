/**
 * MCP App Tool: apply_token_override
 *
 * App-only tool (visibility: ['app']). Lets the MCP App live-edit individual
 * design token values on a soul without going through the full re-register flow.
 *
 * The soul is updated in place; if it is already approved, recipes are also
 * regenerated so that NEW slides / sections pick up the change. Existing
 * slides retain their compiled HTML (with the old soul tokens baked into
 * the embedded `:root` block); they need an `update_slide` (with the
 * unchanged IR) to recompile against the new token values. v4.6+ will add
 * automatic recompile-on-token-override for IR slides.
 */

import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { DECK_EDITOR_RESOURCE_URI } from '../../resources/app-resources.js';
import { handleToolError } from '../_shared/error-handler.js';
import { structuredResponse } from '../_shared/responses.js';

export function registerApplyTokenOverrideTool(server: McpServer, container: ServiceContainer): void {
  registerAppTool(
    server,
    'apply_token_override',
    {
      title: 'Apply Token Override',
      description:
        'Live-edit a single design token on a soul. Regenerates CSS tokens, utility CSS, ' +
        'and the style guide immediately. If the soul is approved, layout recipes are also ' +
        'regenerated so NEW slides pick up the change. Existing slides keep their compiled ' +
        'HTML (with the old soul tokens baked in); call update_slide with the unchanged IR ' +
        'to recompile against the new tokens. Returns the updated soul summary.',
      inputSchema: z.object({
        soul_ref: z.string().describe('Soul UUID or slug.'),
        layer: z
          .enum(['color', 'typography', 'spacing', 'shape', 'depth', 'components', 'motion'])
          .describe('Which layer the token belongs to.'),
        token_name: z.string().min(1).describe('The camelCase token name, e.g. "accentPrimary" or "sizeH1".'),
        value: z
          .union([z.string(), z.number()])
          .describe('New value for the token. Use the same type as the original (string for CSS values, number for numeric tokens).'),
      }),
      _meta: {
        ui: {
          resourceUri: DECK_EDITOR_RESOURCE_URI,
          visibility: ['app'],
        },
      },
    },
    async ({ soul_ref, layer, token_name, value }) => {
      try {
        const soulId = await container.soulService.resolveRefOrThrow(soul_ref);
        const updated = await container.soulService.applyTokenOverride(
          soulId,
          layer,
          token_name,
          value,
        );

        return structuredResponse(
          {
            soul_id: updated.id,
            slug: updated.slug,
            name: updated.name,
            status: updated.status,
            layer,
            token_name,
            new_value: value,
            css_tokens_preview: updated.cssTokens.slice(0, 500),
            allowed_fonts: updated.allowedFonts,
            updated_at: updated.updatedAt,
          },
          `Token "${layer}.${token_name}" updated on soul "${updated.name}"`,
        );
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
