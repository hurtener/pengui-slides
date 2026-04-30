/**
 * MCP Tool: compile_markdown
 *
 * v4.10 — convert a markdown string into a sequence of IR `LeafSlideNode`
 * payloads that can be fed straight into `insert_slide_node` /
 * `insert_section_node`. Pure transformation: no deck / soul / asset
 * lookups (asset_ids referenced in `![alt](id)` syntax must already exist
 * — the agent calls `find_asset_by_slug` upstream if needed).
 *
 * See `src/domain/markdown/compile-markdown.ts` for coverage details.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { compileMarkdown } from '../../domain/markdown/compile-markdown.js';

export function registerCompileMarkdownTool(
  server: McpServer,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _container: ServiceContainer,
): void {
  server.registerTool(
    'compile_markdown',
    {
      title: 'Compile Markdown',
      description:
        'Convert a markdown string into IR leaf nodes ready for ' +
        'insert_slide_node / insert_section_node. Returns the compiled ' +
        'nodes plus per-line warnings for unsupported constructs ' +
        '(fenced code, tables, images by URL, raw HTML). ' +
        'Coverage: headings (h1–h6), paragraphs, bullet/numbered/' +
        'checklist lists, blockquotes, dividers, inline marks ' +
        '(bold/italic/code/strike/link), images by asset_id.',
      inputSchema: z.object({
        input: z
          .string()
          .describe(
            'Markdown source. UTF-8 text. CRLF line endings are normalised.',
          ),
      }),
    },
    async ({ input }) => {
      try {
        const result = compileMarkdown(input);
        return structuredResponse({
          nodes: result.nodes,
          warnings: result.warnings,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
