import { describe, expect, it } from 'vitest';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server';
import { DECK_EDITOR_RESOURCE_URI, registerAppResources } from '../../../src/resources/app-resources.js';

describe('registerAppResources', () => {
  it('registers the deck editor resource with MCP Apps metadata', async () => {
    let readCallback:
      | (() => Promise<{
          contents: Array<{
            uri: string;
            mimeType: string;
            text: string;
            _meta?: {
              ui?: {
                prefersBorder?: boolean;
              };
            };
          }>;
        }>)
      | undefined;

    const server = {
      registerResource: (_name: string, _uri: string, _config: unknown, callback: typeof readCallback) => {
        readCallback = callback;
        return {} as never;
      },
    };

    registerAppResources(server as never);

    expect(readCallback).toBeTypeOf('function');
    const result = await readCallback!();
    const resource = result.contents[0];

    expect(resource.uri).toBe(DECK_EDITOR_RESOURCE_URI);
    expect(resource.mimeType).toBe(RESOURCE_MIME_TYPE);
    expect(resource.text.toLowerCase()).toContain('<!doctype html>');
    expect(resource.text).toContain('<div id="app"></div>');
    expect(resource._meta?.ui?.prefersBorder).toBe(true);
    expect(resource._meta?.ui?.csp).toBeUndefined();
  });
});
