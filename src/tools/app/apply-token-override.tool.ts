/**
 * MCP App Tool: apply_token_override
 *
 * App-only tool (visibility: ['app']). Lets the MCP App live-edit individual
 * design token values on a soul without going through the full re-register flow.
 *
 * v4.6: After updating the soul, automatically recompiles every IR-authored
 * slide in every deck linked to that soul. The compiled HTML stored on each
 * slide is refreshed with the new token values, so the App preview and
 * downstream exports pick up the change without manual `update_slide` calls.
 *
 * Sections are NOT recompiled here. Section HTML uses `var(--*)` references
 * that the document composer resolves against the current soul at render
 * time, so a token change is automatically visible at next preview/export.
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
        'regenerated. ' +
        '\n\n' +
        'v4.6: every IR-authored slide in every deck linked to this soul is automatically ' +
        'recompiled against the new tokens, so the App preview and downstream exports pick up ' +
        'the change without follow-up `update_slide` calls. Pre-v4.5 slides ' +
        '(sourceKind != "authored_ir") are skipped — call update_slide manually if you need ' +
        'them refreshed. Sections are not recompiled (the document composer resolves ' +
        'var() references against the current soul at render time). ' +
        '\n\n' +
        'Returns the updated soul summary plus `recompile: { slides_updated, slides_skipped, ' +
        'failures[] }`.',
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

        // v4.6: cascade-recompile every IR slide that uses this soul so
        // the stored compiled HTML reflects the new token value.
        const slideRecompile = await container.deckService.recompileSlidesForSoul(soulId);

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
            recompile: {
              slides_updated: slideRecompile.recompiledCount,
              slides_skipped: slideRecompile.skippedCount,
              failures: slideRecompile.failures,
            },
          },
          `Token "${layer}.${token_name}" updated; recompiled ${slideRecompile.recompiledCount} slide(s)`,
        );
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
