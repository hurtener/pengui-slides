/**
 * MCP Resource: pengui://docs/charts-and-diagrams
 *
 * Exposes the charts-and-diagrams authoring guide as a retrievable MCP
 * resource. The markdown file is read once at server startup (synchronously,
 * to fail fast if the file is missing) and served from memory thereafter.
 *
 * URI: pengui://docs/charts-and-diagrams
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerResourceEntry } from './registry.js';

const RESOURCE_URI = 'pengui://docs/charts-and-diagrams';

const DOCS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../docs/charts-and-diagrams.md',
);

// Read once at module load — fails fast at startup if the file is absent.
const CONTENT = fs.readFileSync(DOCS_PATH, 'utf-8');

export function registerChartsAndDiagramsResource(server: McpServer): void {
  registerResourceEntry(server, {
    uri: RESOURCE_URI,
    name: 'charts-and-diagrams',
    mimeType: 'text/markdown',
    description:
      'Complete SVG authoring templates for every diagram and chart type supported ' +
      'in Pengui Slides print mode: tree/mind-map (flagship), flow diagram, vertical ' +
      'bar chart, horizontal bar chart, line chart, pie chart, comparison matrix ' +
      '(HTML table), and horizontal timeline. All templates use soul CSS tokens ' +
      'exclusively — no literal hex or px values. Copy-paste ready.',
    getText: () => CONTENT,
  });
}
