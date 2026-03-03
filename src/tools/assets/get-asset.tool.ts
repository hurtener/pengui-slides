/**
 * MCP Tool: get_asset
 *
 * Retrieves metadata for a single asset by ID.
 * Returns metadata and the ref string — no binary data.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { assetId } from '../../types/common.js';
import { AssetService } from '../../domain/assets/asset-service.js';
import { AssetNotFoundError } from '../../types/errors.js';

export function registerGetAssetTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'get_asset',
    {
      title: 'Get Asset',
      description:
        'Get metadata for a single image asset by ID. Returns the asset ref for use in slide HTML — no binary data.',
      inputSchema: z.object({
        asset_id: z.string().describe('The asset ID to retrieve.'),
      }),
    },
    async ({ asset_id }) => {
      try {
        const id = assetId(asset_id);
        const asset = await container.assetService.get(id);

        if (!asset) {
          throw new AssetNotFoundError(asset_id);
        }

        return textResponse({
          asset_id: asset.id,
          name: asset.name,
          filename: asset.filename,
          mime_type: asset.mimeType,
          scope: asset.scope,
          role: asset.role,
          ref: AssetService.ref(asset.id),
          size_bytes: asset.sizeBytes,
          width: asset.width,
          height: asset.height,
          created_at: asset.createdAt,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
