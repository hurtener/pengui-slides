/**
 * Resource registry — single source of truth for the pengui:// resources
 * the server exposes.
 *
 * Two consumers:
 *   1. `registerAllResources` (server.ts wires this on startup) — surfaces
 *      every entry as a native MCP resource, fetchable via the standard
 *      `resources/read` RPC.
 *   2. `list_resources` / `get_resource` MCP tools — surface the same set
 *      to clients whose runtimes only consume tools (some agentic SDKs
 *      do not bind MCP resources). Without this, those clients see the
 *      pengui://schema/slide-ir reference in tool descriptions but have
 *      no way to actually fetch it.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export interface ResourceEntry {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  /** Lazy — invoked once per fetch so dynamic resources (build_info,
   *  schema regenerated from Zod) stay current. */
  getText: () => string;
}

const REGISTRY = new Map<string, ResourceEntry>();

/** Register a resource on the McpServer AND in the registry that backs
 *  list_resources / get_resource. Use this in place of
 *  `server.registerResource(...)` directly. */
export function registerResourceEntry(server: McpServer, entry: ResourceEntry): void {
  REGISTRY.set(entry.uri, entry);
  server.registerResource(
    entry.name,
    entry.uri,
    { description: entry.description, mimeType: entry.mimeType },
    () => ({
      contents: [{ uri: entry.uri, mimeType: entry.mimeType, text: entry.getText() }],
    }),
  );
}

export function listResourceEntries(): ResourceEntry[] {
  return Array.from(REGISTRY.values()).sort((a, b) => a.uri.localeCompare(b.uri));
}

export function getResourceEntry(uri: string): ResourceEntry | null {
  return REGISTRY.get(uri) ?? null;
}
