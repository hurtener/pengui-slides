/**
 * MCP Tool: get_resource
 *
 * Tool wrapper around the MCP resource registry. Fetches the text content
 * of a single pengui:// resource by URI, for clients that don't bind the
 * native resources/read RPC.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { getResourceEntry } from '../../resources/registry.js';
import { ErrorCode, PenguiError } from '../../types/errors.js';

export function registerGetResourceTool(server: McpServer): void {
  server.registerTool(
    'get_resource',
    {
      title: 'Get Documentation Resource',
      description:
        'Fetch the full text content of a single pengui:// resource by URI. Use after ' +
        '`list_resources` to discover URIs. ' +
        '\n\n' +
        'WHY THIS EXISTS — see `list_resources`. Mirrors the native MCP resources/read RPC ' +
        'for clients that only consume tools. ' +
        '\n\n' +
        'INPUT — `uri` (e.g. "pengui://schema/slide-ir"). ' +
        '\n\n' +
        'RETURNS — `{ uri, name, mimeType, text }`. Throws RESOURCE_NOT_FOUND for unknown URIs.',
      inputSchema: z.object({
        uri: z.string().describe('The pengui:// URI to fetch.'),
      }),
    },
    async ({ uri }) => {
      try {
        const entry = getResourceEntry(uri);
        if (!entry) {
          throw new PenguiError(
            ErrorCode.RESOURCE_NOT_FOUND,
            `No registered resource for URI "${uri}". Call list_resources to see available URIs.`,
            { uri },
          );
        }
        return textResponse({
          uri: entry.uri,
          name: entry.name,
          mimeType: entry.mimeType,
          text: entry.getText(),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
