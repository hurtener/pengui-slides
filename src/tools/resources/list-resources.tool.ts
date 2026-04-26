/**
 * MCP Tool: list_resources
 *
 * Tool wrapper around the MCP resource registry. Some agentic clients
 * only consume tools and never bind MCP resources, so they can't fetch
 * the pengui:// URIs referenced from tool descriptions. This tool gives
 * those clients first-class access to the same content.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { listResourceEntries } from '../../resources/registry.js';

export function registerListResourcesTool(server: McpServer): void {
  server.registerTool(
    'list_resources',
    {
      title: 'List Documentation Resources',
      description:
        'List every pengui:// resource the server publishes (docs, schemas, guides) with its ' +
        'URI, name, description, and MIME type. Pair with `get_resource({uri})` to fetch the ' +
        'content. ' +
        '\n\n' +
        'WHY THIS EXISTS — pengui:// resources (e.g. `pengui://schema/slide-ir`, ' +
        '`pengui://docs/document-mode`) are referenced from tool descriptions but native MCP ' +
        'resource access requires the client to bind the resources/read RPC. Some agentic ' +
        'runtimes only forward tools, so without these wrapper tools the agent sees the URIs ' +
        'mentioned but cannot actually fetch them. ' +
        '\n\n' +
        'INPUT — none. ' +
        '\n\n' +
        'RETURNS — `{ resources: [{ uri, name, description, mimeType }] }`.',
      inputSchema: z.object({}).strict(),
    },
    async () => {
      try {
        const resources = listResourceEntries().map((r) => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
          mimeType: r.mimeType,
        }));
        return textResponse({ resources });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
