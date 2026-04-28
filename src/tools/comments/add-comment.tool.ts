/**
 * MCP Tool: add_comment
 *
 * Agents use this to pin a structured note to a slide / section / IR node.
 * Typical use: "I couldn't fit this table on one page — user, please decide
 * whether to split it or shrink the font." Users see the pin in the MCP App
 * and can act on it.
 *
 * Users drop comments from the app via a separate app-only tool
 * (`add_comment_from_app`) that carries extra UI context; this tool is the
 * model-visible path.
 *
 * v4.8.5 — element pins use a structural `ir_path` that addresses a node
 * inside the slide / section IR. Same shape `apply_slide_node_edit` accepts,
 * so the agent's "act on this pin" flow is a one-liner: read the pin's
 * `target.ir_path`, build a replacement `new_node`, call apply_*_node_edit.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { ServiceContainer } from '../../container.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import type { CommentTarget } from '../../types/comment.js';
import { slideId, sectionId } from '../../types/common.js';
import { formatComment } from './_format.js';

const irPathSchema = z
  .array(z.union([z.string(), z.number().int().nonnegative()]))
  .min(2)
  .describe(
    'Structural IR path inside the slide / section. Same shape ' +
      '`apply_slide_node_edit` / `apply_section_node_edit` accept. Examples: ' +
      '["body", 0]; ["body", 2, "left", 1]; ["body", 3, "cells", 0, 1].',
  );

const targetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('slide'), slide_id: z.string() }),
  z.object({ kind: z.literal('section'), section_id: z.string() }),
  z.object({
    kind: z.literal('ir_node'),
    container_id: z.string(),
    ir_path: irPathSchema,
    preview: z.string().optional(),
  }),
]);

export function registerAddCommentTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'add_comment',
    {
      title: 'Add Comment',
      description:
        'Pin a structured note to a slide / section / IR node in a deck. The agent uses this ' +
        'to ask the user a question, flag a decision, or record a note the user should see next ' +
        'time they open the app. Returns the created comment record. Kind drives UI affordance: ' +
        'revision (wants a change), question (needs an answer), approval (sign-off), note (FYI). ' +
        '\n\n' +
        'TARGETING — `target.kind="slide"|"section"` pins to a whole slide/section. ' +
        '`target.kind="ir_node"` pins to a specific IR node by its structural path; pair with ' +
        '`apply_slide_node_edit` / `apply_section_node_edit` to act on the pin without re-emitting ' +
        'the surrounding IR.',
      inputSchema: z.object({
        deck_id: z.string().describe('Deck the comment belongs to. Accepts UUID or slug.'),
        target: targetSchema.describe(
          'What the comment pins to: a slide, a section, or a specific IR node by structural path.',
        ),
        kind: z
          .enum(['revision', 'question', 'approval', 'note'])
          .describe('Semantic kind of the comment.'),
        body: z.string().describe('Comment body as plain text. HTML tags are stripped.'),
      }),
    },
    async ({ deck_id, target, kind, body }) => {
      try {
        const penguTarget: CommentTarget =
          target.kind === 'slide'
            ? { kind: 'slide', slideId: slideId(target.slide_id) }
            : target.kind === 'section'
              ? { kind: 'section', sectionId: sectionId(target.section_id) }
              : {
                  kind: 'ir_node',
                  containerId: target.container_id,
                  irPath: target.ir_path,
                  ...(target.preview ? { preview: target.preview } : {}),
                };

        const comment = await container.commentService.add({
          deckId: deck_id,
          target: penguTarget,
          author: 'agent',
          kind,
          body,
        });

        return structuredResponse({ comment: formatComment(comment) });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
