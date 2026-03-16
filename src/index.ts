#!/usr/bin/env node

/**
 * Pengui Slides MCP Server - Entry Point
 *
 * Bootstraps the MCP server with either stdio or Streamable HTTP transport.
 * Transport mode is selected via --transport flag (default: stdio).
 */

import { randomUUID } from 'node:crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import cors from 'cors';
import { createServer } from './server.js';
import { logger } from './infrastructure/index.js';
import type { PenguiConfig } from './config.js';
import type { Server } from 'node:http';

function parseArgs(): Partial<PenguiConfig> {
  const args = process.argv.slice(2);
  const overrides: Partial<PenguiConfig> = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--persist-dir' && args[i + 1]) {
      overrides.persistDir = args[i + 1];
      i++;
    } else if (args[i] === '--transport' && args[i + 1]) {
      const val = args[i + 1];
      if (val === 'stdio' || val === 'http') {
        overrides.transport = val;
      }
      i++;
    } else if (args[i] === '--port' && args[i + 1]) {
      overrides.httpPort = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--host' && args[i + 1]) {
      overrides.httpHost = args[i + 1];
      i++;
    }
  }

  // Fall back to environment variables
  if (!overrides.persistDir && process.env.PENGUI_PERSIST_DIR) {
    overrides.persistDir = process.env.PENGUI_PERSIST_DIR;
  }
  if (!overrides.transport && process.env.PENGUI_TRANSPORT) {
    const val = process.env.PENGUI_TRANSPORT;
    if (val === 'stdio' || val === 'http') {
      overrides.transport = val;
    }
  }
  if (overrides.httpPort === undefined && process.env.PENGUI_PORT) {
    overrides.httpPort = parseInt(process.env.PENGUI_PORT, 10);
  }
  if (!overrides.httpHost && process.env.PENGUI_HOST) {
    overrides.httpHost = process.env.PENGUI_HOST;
  }
  if (!overrides.googleAccessToken && process.env.PENGUI_GOOGLE_ACCESS_TOKEN) {
    overrides.googleAccessToken = process.env.PENGUI_GOOGLE_ACCESS_TOKEN;
  }
  if (!overrides.googleClientEmail && process.env.PENGUI_GOOGLE_CLIENT_EMAIL) {
    overrides.googleClientEmail = process.env.PENGUI_GOOGLE_CLIENT_EMAIL;
  }
  if (!overrides.googlePrivateKey && process.env.PENGUI_GOOGLE_PRIVATE_KEY) {
    overrides.googlePrivateKey = process.env.PENGUI_GOOGLE_PRIVATE_KEY;
  }

  return overrides;
}

async function startStdio(overrides: Partial<PenguiConfig>): Promise<void> {
  const server = createServer(overrides);
  const transport = new StdioServerTransport();

  logger.info('Starting Pengui Slides MCP Server');
  if (overrides.persistDir) {
    logger.info(`Persistence enabled at: ${overrides.persistDir}`);
  }
  await server.connect(transport);
  logger.info('Pengui Slides MCP Server running on stdio');
}

async function startHttp(overrides: Partial<PenguiConfig>): Promise<void> {
  const { loadConfig } = await import('./config.js');
  const config = loadConfig(overrides);
  const { httpHost, httpPort } = config;

  const app = createMcpExpressApp({ host: httpHost });
  app.use(cors());

  const transports = new Map<string, StreamableHTTPServerTransport>();

  // POST /mcp — initialize or route to existing session
  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    try {
      if (sessionId && transports.has(sessionId)) {
        const transport = transports.get(sessionId)!;
        await transport.handleRequest(req, res, req.body);
        return;
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid: string) => {
            transports.set(sid, transport);
            logger.info(`HTTP session initialized: ${sid}`);
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) {
            transports.delete(sid);
            logger.info(`HTTP session closed: ${sid}`);
          }
        };

        const server = createServer(overrides);
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
    } catch (error) {
      logger.error('Error handling MCP POST', { error: String(error) });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // GET /mcp — SSE stream for server-initiated messages
  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  // DELETE /mcp — session termination
  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  const httpServer: Server = app.listen(httpPort, httpHost, () => {
    logger.info(`Pengui Slides MCP Server listening on http://${httpHost}:${httpPort}/mcp`);
    if (overrides.persistDir) {
      logger.info(`Persistence enabled at: ${overrides.persistDir}`);
    }
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down HTTP server...');
    for (const [sid, transport] of transports) {
      try {
        await transport.close();
        logger.info(`Closed session ${sid}`);
      } catch (error) {
        logger.error(`Error closing session ${sid}`, { error: String(error) });
      }
    }
    transports.clear();
    httpServer.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function main(): Promise<void> {
  const overrides = parseArgs();

  if (overrides.transport === 'http') {
    await startHttp(overrides);
  } else {
    await startStdio(overrides);
  }
}

main().catch((error: unknown) => {
  logger.error('Fatal error in main()', { error: String(error) });
  process.exit(1);
});
