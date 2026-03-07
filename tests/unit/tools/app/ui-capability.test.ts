import { describe, expect, it } from 'vitest';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { getMcpAppsSupport } from '../../../../src/tools/app/ui-capability.js';

function makeServer(clientCapabilities: unknown) {
  return {
    server: {
      getClientCapabilities: () => clientCapabilities,
    },
  };
}

describe('getMcpAppsSupport', () => {
  it('reports support when the client advertises the MCP Apps MIME type', () => {
    expect(getMcpAppsSupport(makeServer({
      extensions: {
        'io.modelcontextprotocol/ui': {
          mimeTypes: [RESOURCE_MIME_TYPE],
        },
      },
    }) as never)).toEqual({
      supported: true,
      mimeTypes: [RESOURCE_MIME_TYPE],
    });
  });

  it('returns a soft warning when the SDK-stripped capabilities omit extensions', () => {
    expect(getMcpAppsSupport(makeServer({
      extensions: {
        'io.modelcontextprotocol/ui': {
          mimeTypes: ['text/html'],
        },
      },
    }) as never)).toEqual({
      supported: false,
      mimeTypes: ['text/html'],
      warning: 'MCP Apps support could not be confirmed from client capabilities. Some SDK versions omit extensions during initialize parsing, so the app launch will proceed without a hard block.',
    });

    expect(getMcpAppsSupport(makeServer(undefined) as never)).toEqual({
      supported: false,
      mimeTypes: [],
      warning: 'MCP Apps support could not be confirmed from client capabilities. Some SDK versions omit extensions during initialize parsing, so the app launch will proceed without a hard block.',
    });
  });
});
