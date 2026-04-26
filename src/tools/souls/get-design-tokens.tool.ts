/**
 * MCP Tool: get_design_tokens
 *
 * Lightweight counterpart to `get_design_soul`: returns only the flat list
 * of CSS custom properties (`{ name, value, layer }`) the soul declares.
 * Strips recipes, utility CSS, style guide, parsed-tokens map, and full
 * layer dumps — payload is ~5x smaller, suitable for tool-driven inspection
 * of the soul's color/spacing/typography palette.
 *
 * Use this instead of `get_design_soul` when:
 *   - You want to enumerate the soul's available tokens before composing IR
 *     that references them by semantic role (background: "accent", etc.).
 *   - You need just the token catalogue, not the full design surface.
 *
 * Use `get_design_soul` when you also need recipes, the style guide, or
 * the utility CSS class library.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { ServiceContainer } from '../../container.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

type TokenLayer =
  | 'color'
  | 'category'
  | 'typography'
  | 'spacing'
  | 'shape'
  | 'depth'
  | 'components'
  | 'motion'
  | 'other';

interface TokenEntry {
  name: string;
  value: string;
  layer: TokenLayer;
}

export function registerGetDesignTokensTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'get_design_tokens',
    {
      title: 'Get Design Tokens (Lightweight)',
      description:
        'Return ONLY the soul\'s flat CSS-custom-property catalogue as ' +
        '`{ tokens: [{ name, value, layer }] }`. Strips recipes, utility CSS, ' +
        'style guide, parsed-tokens record, and the full nested layer dump that ' +
        '`get_design_soul` returns — payload is roughly 5× smaller. ' +
        '\n\n' +
        'WHEN TO CALL — at the start of an authoring session to inspect the soul\'s ' +
        'color/spacing/typography palette. Tokens are referenced from IR by SEMANTIC ' +
        'role (e.g. background: "accent" → `--color-accent-primary`); this tool lets ' +
        'you see the underlying values for design intent. Cache the result for the rest ' +
        'of the session; tokens don\'t change between add_slide / add_section calls. ' +
        '\n\n' +
        'WHEN TO USE `get_design_soul` INSTEAD — when you also need layout recipes, ' +
        'the style guide narrative, or the utility-CSS class library. This tool is ' +
        'strictly the token catalogue, nothing else. ' +
        '\n\n' +
        'OUTPUT — `{ soul_id, soul_slug, token_count, tokens: [{ name, value, layer }] }`. ' +
        'Layers: "color", "category" (derived diagram-category palette), "typography", ' +
        '"spacing", "shape", "depth", "components", "motion". Token names are CSS custom ' +
        'property names (with leading `--`). Values are stringified px/hex/etc.',
      inputSchema: z.object({
        soul_id: z
          .string()
          .nullish()
          .describe('The Design Soul to fetch tokens for. Accepts UUID or slug. Provide either soul_id or soul_ref.'),
        soul_ref: z
          .string()
          .nullish()
          .describe('Alias for soul_id — accepts UUID or slug.'),
      }),
    },
    async ({ soul_id, soul_ref }) => {
      try {
        const ref = soul_id ?? soul_ref;
        if (!ref) {
          throw new Error('Either soul_id or soul_ref is required.');
        }

        const resolvedId = await container.soulService.resolveRefOrThrow(ref);
        const { soul } = await container.soulService.get(resolvedId, false);

        const tokens = parseTokens(soul.cssTokens);

        return structuredResponse({
          soul_id: soul.id as string,
          soul_slug:
            soul.slug ?? (await container.soulService.slugFor(soul.id)) ?? '',
          token_count: tokens.length,
          tokens,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}

/**
 * Parse the soul's `:root { --foo: bar; }` block into typed entries.
 *
 * Scoped to the `:root {}` block only — print-mode overrides
 * (`[data-pengui-medium="print"] {}`) are intentionally skipped because
 * they are derived from the same soul and would double-list the same
 * conceptual tokens with different values.
 */
function parseTokens(css: string): TokenEntry[] {
  const rootMatch = css.match(/:root\s*\{([\s\S]*?)\}/);
  const block = rootMatch ? rootMatch[1] : css;

  const entries: TokenEntry[] = [];
  const re = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const name = `--${m[1]}`;
    const value = m[2].trim();
    entries.push({ name, value, layer: classifyLayer(m[1]) });
  }
  return entries;
}

function classifyLayer(tokenStem: string): TokenLayer {
  if (tokenStem.startsWith('color-category-')) return 'category';
  if (tokenStem.startsWith('color-')) return 'color';
  if (
    tokenStem.startsWith('font-') ||
    tokenStem.startsWith('text-') ||
    tokenStem.startsWith('weight-') ||
    tokenStem.startsWith('line-height-') ||
    tokenStem.startsWith('letter-spacing-') ||
    tokenStem.startsWith('leading-')
  ) {
    return 'typography';
  }
  if (tokenStem.startsWith('space-')) return 'spacing';
  if (tokenStem.startsWith('radius-')) return 'shape';
  if (tokenStem.startsWith('shadow-') || tokenStem.startsWith('border-')) return 'depth';
  if (
    tokenStem.startsWith('card-') ||
    tokenStem.startsWith('button-') ||
    tokenStem.startsWith('input-') ||
    tokenStem.startsWith('badge-')
  ) {
    return 'components';
  }
  if (tokenStem.startsWith('duration-') || tokenStem.startsWith('easing-')) return 'motion';
  return 'other';
}
