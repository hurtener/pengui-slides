/**
 * MCP Tool: add_comment
 *
 * Agents use this to pin a structured note to a slide / section / element.
 * Typical use: "I couldn't fit this table on one page — user, please decide
 * whether to split it or shrink the font." Users see the pin in the MCP App
 * and can act on it.
 *
 * Users drop comments from the app via a separate app-only tool
 * (`add_comment_from_app`) that carries extra UI context; this tool is the
 * model-visible path.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import type { CommentTarget } from '../../types/comment.js';
import { slideId, sectionId } from '../../types/common.js';

const targetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('slide'), slide_id: z.string() }),
  z.object({ kind: z.literal('section'), section_id: z.string() }),
  z.object({
    kind: z.literal('element'),
    container_id: z.string(),
    edit_id: z.string(),
  }),
]);

export function registerAddCommentTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'add_comment',
    {
      title: 'Add Comment',
      description:
        'Pin a structured note to a slide / section / element in a deck. The agent uses this ' +
        'to ask the user a question, flag a decision, or record a note the user should see next ' +
        'time they open the app. Returns the created comment record. Kind drives UI affordance: ' +
        'revision (wants a change), question (needs an answer), approval (sign-off), note (FYI).',
      inputSchema: z.object({
        deck_id: z.string().describe('Deck the comment belongs to. Accepts UUID or slug.'),
        target: targetSchema.describe(
          'What the comment pins to: a slide, a section, or a specific element identified by its data-edit-id within a slide or section.',
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
                  kind: 'element',
                  containerId: target.container_id,
                  editId: target.edit_id,
                };

        const comment = await container.commentService.add({
          deckId: deck_id,
          target: penguTarget,
          author: 'agent',
          kind,
          body,
        });

        return textResponse({
          id: comment.id,
          deck_id: comment.deckId,
          target: comment.target,
          author: comment.author,
          kind: comment.kind,
          body: comment.body,
          created_at: comment.createdAt,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
