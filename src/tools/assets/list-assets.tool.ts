/**
 * MCP Tool: list_assets
 *
 * Lists image assets with optional filtering by scope, soul, deck, or role.
 * Returns metadata only — no binary data.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { soulId, deckId } from '../../types/common.js';
import { AssetService } from '../../domain/assets/asset-service.js';
import type { AssetListFilter } from '../../storage/interfaces.js';

export function registerListAssetsTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'list_assets',
    {
      title: 'List Assets',
      description:
        'List uploaded image assets. Filter by scope type, soul, deck, or role. Returns metadata and asset refs — no binary data.',
      inputSchema: z.object({
        scope_type: z.enum(['soul', 'deck', 'global']).nullish().describe('Filter by scope type. When set, only assets of this scope are returned.'),
        soul_id: z.string().nullish().describe('Filter soul-scoped assets by this soul ID. Only relevant when scope_type is "soul" or omitted.'),
        deck_id: z.string().nullish().describe('Filter deck-scoped assets by this deck ID. Only relevant when scope_type is "deck" or omitted.'),
        role: z.enum(['logo', 'content']).nullish().describe('Filter by role.'),
      }),
    },
    async ({ scope_type, soul_id, deck_id, role }) => {
      try {
        const filter: AssetListFilter = {};
        if (scope_type) filter.scope = scope_type;
        if (role) filter.role = role;
        // Only pass scope-specific IDs when they match the requested scope
        if (soul_id && scope_type !== 'deck' && scope_type !== 'global') filter.soulId = soulId(soul_id);
        if (deck_id && scope_type !== 'soul' && scope_type !== 'global') filter.deckId = deckId(deck_id);

        const assets = await container.assetService.list(filter);

        return structuredResponse({
          asset_count: assets.length,
          assets: assets.map((a) => ({
            asset_id: a.id,
            name: a.name,
            label: a.name,
            filename: a.filename,
            mime_type: a.mimeType,
            scope: a.scope,
            role: a.role,
            ref: AssetService.ref(a.id),
            size_bytes: a.sizeBytes,
            created_at: a.createdAt,
          })),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
