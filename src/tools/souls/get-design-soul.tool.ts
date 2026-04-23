/**
 * get_design_soul MCP tool.
 *
 * Retrieves a single Design Soul by ID, optionally including
 * its layout recipes and style guide.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { ServiceContainer } from '../../container.js';
import { BooleanParamSchema } from '../_shared/schemas.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import type { SoulLayers } from '../../types/design-soul.js';

export function registerGetDesignSoulTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'get_design_soul',
    {
      title: 'Get Design Soul',
      description:
        'Retrieve a Design Soul by its ID. Optionally include the layout recipes ' +
        '(only available for approved souls) and the generated style guide.',
      inputSchema: z.object({
        soul_id: z.string().nullish().describe('The Design Soul to fetch. Accepts UUID or slug. Provide either soul_id or soul_ref.'),
        soul_ref: z.string().nullish().describe('Alias for soul_id — accepts UUID or slug.'),
        include_recipes: BooleanParamSchema
          .describe('Whether to include layout recipes in the response. Defaults to true.'),
        include_style_guide: BooleanParamSchema
          .describe('Whether to include the style guide in the response. Defaults to true.'),
      }),
    },
    async ({ soul_id, soul_ref, include_recipes, include_style_guide }) => {
      try {
        const shouldIncludeRecipes = include_recipes ?? true;
        const ref = soul_id ?? soul_ref;
        if (!ref) {
          throw new Error('Either soul_id or soul_ref is required.');
        }

        const resolvedId = await container.soulService.resolveRefOrThrow(ref);
        const { soul, recipes } = await container.soulService.get(
          resolvedId,
          shouldIncludeRecipes,
        );

        return structuredResponse({
          soul: {
            soul_id: soul.id,
            id: soul.id,
            slug: soul.slug ?? (await container.soulService.slugFor(soul.id)) ?? '',
            name: soul.name,
            description: soul.description,
            status: soul.status,
            // Array-of-{name,tokens} shape for the MCP App UI.
            layers: flattenLayers(soul.layers),
            // Parsed `:root { --foo: bar; }` string → key/value record.
            cssTokens: parseCssTokens(soul.cssTokens),
            cssTokensString: soul.cssTokens,
            utility_css: soul.utilityCss,
            token_names: soul.tokenNames,
            allowed_fonts: soul.allowedFonts,
            recipes: recipes
              ? recipes.map((r) => ({
                  id: r.id,
                  type: r.type,
                  name: r.name,
                  description: r.description,
                  tags: r.tags,
                  source: r.source,
                  medium: r.medium,
                  html: r.html,
                }))
              : [],
            ...(include_style_guide ?? true ? { styleGuide: soul.styleGuide } : {}),
            created_at: soul.createdAt,
            updated_at: soul.updatedAt,
            approved_at: soul.approvedAt ?? null,
          },
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}

/**
 * Flatten the typed `SoulLayers` into the array-of-layers shape the MCP App
 * UI consumes: [{ name: 'color', tokens: { canvas: '#...', ... } }, ...].
 * Values are stringified so the UI can display them uniformly.
 */
function flattenLayers(layers: SoulLayers): Array<{
  name: string;
  tokens: Record<string, string>;
}> {
  return Object.entries(layers).map(([name, layer]) => ({
    name,
    tokens: Object.fromEntries(
      Object.entries(layer as Record<string, unknown>).map(([k, v]) => [
        k,
        Array.isArray(v) ? v.join(', ') : String(v),
      ]),
    ),
  }));
}

/**
 * Parse a CSS token block (`:root { --foo: bar; --baz: qux; }` or the raw
 * declaration list) into a flat `Record<tokenName, value>`.
 */
function parseCssTokens(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    out[m[1]] = m[2].trim();
  }
  return out;
}
