/**
 * MCP Tool: delete_asset
 *
 * Deletes an image asset by ID (both metadata and binary data).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { assetId } from '../../types/common.js';
import { AssetNotFoundError } from '../../types/errors.js';

export function registerDeleteAssetTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'delete_asset',
    {
      title: 'Delete Asset',
      description: 'Delete an image asset by ID. Removes both metadata and binary data.',
      inputSchema: z.object({
        asset_id: z.string().describe('The asset ID to delete.'),
      }),
    },
    async ({ asset_id }) => {
      try {
        const id = assetId(asset_id);
        const deleted = await container.assetService.delete(id);

        if (!deleted) {
          throw new AssetNotFoundError(asset_id);
        }

        return textResponse({ deleted: true });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
