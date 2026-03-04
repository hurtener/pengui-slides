import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomInt } from 'node:crypto';

/**
 * Parse an SSE response body into JSON-RPC message objects.
 * The Streamable HTTP transport may respond with text/event-stream.
 */
async function parseSseResponse(res: Response): Promise<unknown[]> {
  const text = await res.text();
  const messages: unknown[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim();
      if (data) {
        messages.push(JSON.parse(data));
      }
    }
  }
  return messages;
}

const PORT = 30000 + randomInt(10000);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const MCP_HEADERS = {
  'Content-Type': 'application/json',
  Accept: 'application/json, text/event-stream',
};

let serverProcess: ChildProcess;

async function waitForServer(url: string, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await fetch(url, { method: 'GET' }).catch(() => null);
      // Server is up if we get any response (even an error)
      const res = await fetch(`${url}/mcp`, {
        method: 'POST',
        headers: MCP_HEADERS,
        body: JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 0 }),
      });
      if (res.status > 0) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

function initializeRequest(id: number = 1) {
  return {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    },
    id,
  };
}

describe('HTTP Transport', () => {
  beforeAll(async () => {
    serverProcess = spawn(
      'node',
      ['build/index.js', '--transport', 'http', '--port', String(PORT)],
      {
        cwd: process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' },
      },
    );

    // Log stderr for debugging
    serverProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) process.stderr.write(`[server] ${msg}\n`);
    });

    await waitForServer(BASE_URL);
  }, 15000);

  afterAll(async () => {
    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      // Wait for process to exit
      await new Promise<void>((resolve) => {
        serverProcess.on('exit', () => resolve());
        setTimeout(resolve, 3000);
      });
    }
  });

  it('POST initialize returns 200 with mcp-session-id header', async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: MCP_HEADERS,
      body: JSON.stringify(initializeRequest()),
    });

    expect(res.status).toBe(200);
    const sessionId = res.headers.get('mcp-session-id');
    expect(sessionId).toBeTruthy();
    expect(typeof sessionId).toBe('string');
  });

  it('POST tools/list with valid session returns tools', async () => {
    // First initialize to get a session
    const initRes = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: MCP_HEADERS,
      body: JSON.stringify(initializeRequest()),
    });
    const sessionId = initRes.headers.get('mcp-session-id')!;

    // Send initialized notification (required by protocol)
    await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        ...MCP_HEADERS,
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });

    // Now list tools
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        ...MCP_HEADERS,
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 2,
      }),
    });

    expect(res.status).toBe(200);
    const contentType = res.headers.get('content-type') ?? '';

    let tools: unknown[];
    if (contentType.includes('text/event-stream')) {
      const messages = await parseSseResponse(res);
      const toolsMsg = messages.find(
        (m: any) => m.result?.tools !== undefined,
      ) as any;
      expect(toolsMsg).toBeDefined();
      tools = toolsMsg.result.tools;
    } else {
      const body = await res.json();
      tools = body.result.tools;
    }

    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
  });

  it('POST without session ID and non-init body returns 400', async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: MCP_HEADERS,
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 99,
      }),
    });

    expect(res.status).toBe(400);
  });

  it('DELETE with valid session terminates it', async () => {
    // Initialize
    const initRes = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: MCP_HEADERS,
      body: JSON.stringify(initializeRequest()),
    });
    const sessionId = initRes.headers.get('mcp-session-id')!;

    // Delete session
    const deleteRes = await fetch(`${BASE_URL}/mcp`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/json, text/event-stream',
        'mcp-session-id': sessionId,
      },
    });

    expect(deleteRes.status).toBe(200);

    // Subsequent POST with that session should fail
    const postRes = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        ...MCP_HEADERS,
        'mcp-session-id': sessionId,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 3,
      }),
    });

    // Should be 400 (session gone from our map) or 404 (from transport)
    expect(postRes.status).toBeGreaterThanOrEqual(400);
  });

  it('POST with invalid session ID returns 400', async () => {
    const res = await fetch(`${BASE_URL}/mcp`, {
      method: 'POST',
      headers: {
        ...MCP_HEADERS,
        'mcp-session-id': 'nonexistent-session-id',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 4,
      }),
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
