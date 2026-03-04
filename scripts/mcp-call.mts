#!/usr/bin/env npx tsx
/**
 * Lightweight MCP tool caller. Usage:
 *   npx tsx scripts/mcp-call.mts <tool_name> '<json_args>'
 *
 * Connects to the server, calls the tool, prints the result, and exits.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const [toolName, argsJson] = process.argv.slice(2);

if (!toolName) {
  console.error('Usage: npx tsx scripts/mcp-call.mts <tool_name> [json_args]');
  process.exit(1);
}

const args = argsJson ? JSON.parse(argsJson) : {};

const PERSIST_DIR = './data';

const transport = new StdioClientTransport({
  command: 'node',
  args: ['build/index.js', '--persist-dir', PERSIST_DIR],
  cwd: '/Users/santiagobenvenuto/Repos/pengui-slides',
});

const client = new Client({ name: 'mcp-caller', version: '1.0.0' });

try {
  await client.connect(transport);

  if (toolName === '--list') {
    const tools = await client.listTools();
    console.log(JSON.stringify(tools.tools.map(t => ({ name: t.name, description: t.description?.slice(0, 80) })), null, 2));
  } else {
    const result = await client.callTool({ name: toolName, arguments: args });
    const text = (result as any).content?.[0]?.text;
    if (text) {
      try { console.log(JSON.stringify(JSON.parse(text), null, 2)); }
      catch { console.log(text); }
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  }
} catch (err: any) {
  console.error('ERROR:', err.message || err);
  process.exit(1);
} finally {
  await client.close();
  process.exit(0);
}
