/**
 * MCP Tool: list_assets
 *
 * Lists image assets with optional filtering by scope, soul, deck, or role.
 * Returns metadata only — no binary data.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
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
        scope_type: z.enum(['soul', 'deck', 'global']).optional().describe('Filter by scope type.'),
        soul_id: z.string().optional().describe('Filter by soul ID (only returns soul-scoped assets for this soul).'),
        deck_id: z.string().optional().describe('Filter by deck ID (only returns deck-scoped assets for this deck).'),
        role: z.enum(['logo', 'content']).optional().describe('Filter by role.'),
      }),
    },
    async ({ scope_type, soul_id, deck_id, role }) => {
      try {
        const filter: AssetListFilter = {};
        if (scope_type) filter.scope = scope_type;
        if (soul_id) filter.soulId = soulId(soul_id);
        if (deck_id) filter.deckId = deckId(deck_id);
        if (role) filter.role = role;

        const assets = await container.assetService.list(filter);

        return textResponse(
          assets.map((a) => ({
            asset_id: a.id,
            name: a.name,
            filename: a.filename,
            mime_type: a.mimeType,
            scope: a.scope,
            role: a.role,
            ref: AssetService.ref(a.id),
            size_bytes: a.sizeBytes,
          })),
        );
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
