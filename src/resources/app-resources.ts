import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import {
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from '@modelcontextprotocol/ext-apps/server';

export const DECK_EDITOR_RESOURCE_URI = 'ui://deck-editor/index.html';
const APP_BUNDLE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../build/app/index.html',
);

const FALLBACK_APP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Pengui Slides Editor</title>
  <style>
    body {
      margin: 0;
      font-family: system-ui, sans-serif;
      background: #f5efe6;
      color: #2b241f;
      display: grid;
      place-items: center;
      min-height: 100vh;
      padding: 32px;
    }
    main {
      max-width: 560px;
      background: #fffaf4;
      border: 1px solid #dbcab8;
      border-radius: 20px;
      padding: 24px;
      box-shadow: 0 16px 40px rgba(63, 41, 24, 0.12);
    }
    h1 { margin-top: 0; }
    code {
      background: rgba(43, 36, 31, 0.08);
      padding: 2px 6px;
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <main>
    <h1>Deck editor asset missing</h1>
    <p>The MCP App bundle was not found at <code>build/app/index.html</code>.</p>
    <p>Run <code>npm run build:app</code> or <code>npm run build</code>, then reopen the editor.</p>
  </main>
</body>
</html>`;

export function registerAppResources(server: McpServer): void {
  registerAppResource(
    server,
    'Deck Editor',
    DECK_EDITOR_RESOURCE_URI,
    {
      description: 'Interactive deck editor for previewing slides and editing text content.',
    },
    async (): Promise<ReadResourceResult> => {
      const text = await readAppHtml(APP_BUNDLE_PATH);

      return {
        contents: [{
          uri: DECK_EDITOR_RESOURCE_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text,
          _meta: {
            ui: {
              prefersBorder: true,
            },
          },
        }],
      };
    },
  );
}

async function readAppHtml(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return FALLBACK_APP_HTML;
  }
}
