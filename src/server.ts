/**
 * MCP Server factory.
 *
 * Creates and configures the McpServer instance with all tools registered.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { loadConfig, type PenguiConfig } from './config.js';
import { createContainer } from './container.js';
import { registerAllTools } from './tools/index.js';

export function createServer(overrides?: Partial<PenguiConfig>): McpServer {
  const config = loadConfig(overrides);

  const server = new McpServer({
    name: config.serverName,
    version: config.version,
  });

  const container = createContainer(config);
  registerAllTools(server, container);

  return server;
}
