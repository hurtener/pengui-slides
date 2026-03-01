#!/usr/bin/env node

/**
 * Pengui Slides MCP Server - Entry Point
 *
 * Bootstraps the MCP server with stdio transport.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { logger } from './infrastructure/index.js';

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  logger.info('Starting Pengui Slides MCP Server');
  await server.connect(transport);
  logger.info('Pengui Slides MCP Server running on stdio');
}

main().catch((error: unknown) => {
  logger.error('Fatal error in main()', { error: String(error) });
  process.exit(1);
});
