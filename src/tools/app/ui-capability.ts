import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getUiCapability, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';

export interface McpAppsSupportStatus {
  supported: boolean;
  mimeTypes: string[];
  warning?: string;
}

export function getMcpAppsSupport(server: McpServer): McpAppsSupportStatus {
  const capability = getUiCapability(server.server.getClientCapabilities());
  const mimeTypes = capability?.mimeTypes ?? [];
  const supported = mimeTypes.includes(RESOURCE_MIME_TYPE);

  if (supported) {
    return { supported, mimeTypes };
  }

  return {
    supported: false,
    mimeTypes,
    warning: 'MCP Apps support could not be confirmed from client capabilities. Some SDK versions omit extensions during initialize parsing, so the app launch will proceed without a hard block.',
  };
}
