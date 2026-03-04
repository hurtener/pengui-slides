/**
 * MCP Tool: upload_asset
 *
 * Uploads an image asset (logo or content image) and returns
 * a lightweight ref for use in slide HTML.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { soulId, deckId } from '../../types/common.js';
import type { AssetScope, AssetMimeType } from '../../types/asset.js';
import { AssetService } from '../../domain/assets/asset-service.js';

export function registerUploadAssetTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'upload_asset',
    {
      title: 'Upload Asset',
      description:
        'Upload an image asset (logo or content image). Returns an asset ref like "asset://UUID" — use this ref as the src attribute in <img> tags within slide HTML. The LLM should never handle raw base64 data after upload.',
      inputSchema: z.object({
        name: z.string().min(1).max(200).describe('Human-readable label (e.g. "Company Logo", "Hero Photo").'),
        filename: z.string().min(1).describe('Original filename (e.g. "logo.png").'),
        mime_type: z.enum(['image/png', 'image/svg+xml', 'image/jpeg']).describe('Image MIME type.'),
        scope_type: z.enum(['soul', 'deck', 'global']).describe(
          'Scope: "soul" for logos tied to a design soul, "deck" for deck-specific content images, "global" for images available everywhere.',
        ),
        soul_id: z.string().optional().describe('Required when scope_type is "soul".'),
        deck_id: z.string().optional().describe('Required when scope_type is "deck".'),
        role: z.enum(['logo', 'content']).describe('"logo" for branding marks, "content" for slide imagery.'),
        data_base64: z.string().min(1).describe('Base64-encoded image data.'),
      }),
    },
    async ({ name, filename, mime_type, scope_type, soul_id, deck_id, role, data_base64 }) => {
      try {
        const scope = buildScope(scope_type, soul_id, deck_id);

        const asset = await container.assetService.upload({
          name,
          filename,
          mimeType: mime_type as AssetMimeType,
          scope,
          role,
          dataBase64: data_base64,
        });

        return textResponse({
          asset_id: asset.id,
          name: asset.name,
          mime_type: asset.mimeType,
          size_bytes: asset.sizeBytes,
          ref: AssetService.ref(asset.id),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}

function buildScope(scopeType: string, soulIdStr?: string, deckIdStr?: string): AssetScope {
  switch (scopeType) {
    case 'soul':
      if (!soulIdStr) throw new Error('soul_id is required when scope_type is "soul"');
      return { type: 'soul', soulId: soulId(soulIdStr) };
    case 'deck':
      if (!deckIdStr) throw new Error('deck_id is required when scope_type is "deck"');
      return { type: 'deck', deckId: deckId(deckIdStr) };
    default:
      return { type: 'global' };
  }
}
