#!/usr/bin/env node

/**
 * Pengui Slides MCP Server - Entry Point
 *
 * Bootstraps the MCP server with stdio transport.
 * Supports --persist-dir <path> CLI flag and PENGUI_PERSIST_DIR env var
 * for file-based state persistence.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { logger } from './infrastructure/index.js';
import type { PenguiConfig } from './config.js';

function parseArgs(): Partial<PenguiConfig> {
  const args = process.argv.slice(2);
  const overrides: Partial<PenguiConfig> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--persist-dir' && args[i + 1]) {
      overrides.persistDir = args[i + 1];
      i++;
    }
  }

  // Fall back to environment variable
  if (!overrides.persistDir && process.env.PENGUI_PERSIST_DIR) {
    overrides.persistDir = process.env.PENGUI_PERSIST_DIR;
  }

  return overrides;
}

async function main(): Promise<void> {
  const overrides = parseArgs();
  const server = createServer(overrides);
  const transport = new StdioServerTransport();

  logger.info('Starting Pengui Slides MCP Server');
  if (overrides.persistDir) {
    logger.info(`Persistence enabled at: ${overrides.persistDir}`);
  }
  await server.connect(transport);
  logger.info('Pengui Slides MCP Server running on stdio');
}

main().catch((error: unknown) => {
  logger.error('Fatal error in main()', { error: String(error) });
  process.exit(1);
});
