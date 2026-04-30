/**
 * MCP Tool: compile_markdown
 *
 * v4.10 — convert markdown into IR `LeafSlideNode[]` and (optionally)
 * insert them straight into a slide or section in one round-trip.
 *
 * Two modes:
 *
 *   1. PREVIEW (no `target`) — returns `{ nodes, warnings }`. Useful for
 *      "what would this look like?" flows where the agent wants to
 *      morph the result before committing, or just show the user.
 *
 *   2. INSERT (with `target`) — server compiles, applies all inserts in
 *      IR space, recompiles + revalidates the slide / section ONCE,
 *      saves, and returns `{ inserted_paths, warnings }`. The agent
 *      never echoes the compiled IR through context — the markdown
 *      goes in, the resulting paths come back.
 *
 * See `src/domain/markdown/compile-markdown.ts` for compiler coverage.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { compileMarkdown } from '../../domain/markdown/compile-markdown.js';

const PATH_STEP = z.union([z.string(), z.number().int().nonnegative()]);
const PATH_SCHEMA = z.array(PATH_STEP);

const TARGET_SCHEMA = z.discriminatedUnion('container_kind', [
  z.object({
    container_kind: z.literal('slide'),
    deck_id: z.string(),
    slide_id: z.string(),
    parent_path: PATH_SCHEMA.default(['body']),
    position: z.number().int().nonnegative().default(0),
  }),
  z.object({
    container_kind: z.literal('section'),
    deck_id: z.string(),
    section_id: z.string(),
    parent_path: PATH_SCHEMA.default(['body']),
    position: z.number().int().nonnegative().default(0),
  }),
]);

export function registerCompileMarkdownTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'compile_markdown',
    {
      title: 'Compile Markdown',
      description:
        'Convert markdown into IR leaf nodes. Without a `target` returns ' +
        '`{nodes, warnings}` for preview / further shaping. With a `target` ' +
        '(slide or section) the server inserts every emitted node into the ' +
        'addressed container in one round-trip and returns `{inserted_paths, ' +
        'warnings}` — the agent does not have to echo the compiled IR back ' +
        'through context. Validation runs ONCE on the final state. ' +
        'Coverage: headings (h1–h6), paragraphs, bullet/numbered/checklist ' +
        'lists, blockquotes, dividers, inline marks (bold/italic/code/strike/' +
        'link), images by asset_id. Unsupported (warning emitted, content ' +
        'dropped): fenced code, tables, raw HTML, images by URL.',
      inputSchema: z.object({
        input: z
          .string()
          .describe(
            'Markdown source. UTF-8 text. CRLF line endings are normalised.',
          ),
        target: TARGET_SCHEMA.optional().describe(
          'When set, compile_markdown inserts the emitted nodes contiguously ' +
            'starting at `target.position` inside `target.parent_path`. ' +
            'Omit to receive nodes for preview / agent-side shaping.',
        ),
      }),
    },
    async ({ input, target }) => {
      try {
        const result = compileMarkdown(input);

        if (!target) {
          return structuredResponse({
            mode: 'preview',
            nodes: result.nodes,
            warnings: result.warnings,
          });
        }

        if (result.nodes.length === 0) {
          // Nothing to insert — surface warnings only so the agent
          // can report what happened. No-op against the deck.
          return structuredResponse({
            mode: 'inserted',
            inserted_paths: [],
            warnings: result.warnings,
          });
        }

        if (target.container_kind === 'slide') {
          const { insertedPaths } = await container.deckService.insertSlideNodesBulk({
            deckId: target.deck_id,
            slideId: target.slide_id,
            parentPath: target.parent_path,
            position: target.position,
            nodes: result.nodes,
          });
          return structuredResponse({
            mode: 'inserted',
            container_kind: 'slide',
            slide_id: target.slide_id,
            inserted_paths: insertedPaths,
            warnings: result.warnings,
          });
        }

        // section
        const { insertedPaths } = await container.documentService.insertSectionNodesBulk({
          deckId: target.deck_id,
          sectionId: target.section_id,
          parentPath: target.parent_path,
          position: target.position,
          nodes: result.nodes,
        });
        return structuredResponse({
          mode: 'inserted',
          container_kind: 'section',
          section_id: target.section_id,
          inserted_paths: insertedPaths,
          warnings: result.warnings,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
