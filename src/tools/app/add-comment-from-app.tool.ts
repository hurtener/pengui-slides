/**
 * MCP App Tool: add_comment_from_app
 *
 * App-only equivalent of `add_comment`. The MCP App calls this when the
 * user drops a comment pin on a slide, section, or specific element.
 * Author is always `'user'` — the app declares on behalf of the user;
 * the agent gets an `add_comment` call for agent-authored notes.
 *
 * Carries optional UI context (view_uuid, scroll_snapshot) that the
 * app may use to restore position when the comment is opened later.
 * Echoed back in the response; persistence of UI context is a future
 * concern (extend `Comment` shape if it becomes load-bearing).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { ServiceContainer } from '../../container.js';
import type { CommentTarget } from '../../types/comment.js';
import { slideId, sectionId } from '../../types/common.js';
import { DECK_EDITOR_RESOURCE_URI } from '../../resources/app-resources.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { formatComment } from '../comments/_format.js';

const targetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('slide'), slide_id: z.string() }),
  z.object({ kind: z.literal('section'), section_id: z.string() }),
  z.object({
    kind: z.literal('element'),
    container_id: z.string(),
    edit_id: z.string(),
  }),
]);

export function registerAddCommentFromAppTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  registerAppTool(
    server,
    'add_comment_from_app',
    {
      title: 'Add Comment (App)',
      description:
        'Pin a structured comment to a slide, section, or element on behalf of the user. ' +
        'Author is always "user". Optionally carries UI context (view_uuid, scroll_snapshot) ' +
        'so the app can restore scroll position when the comment is re-opened.',
      inputSchema: z.object({
        deck_id: z.string().describe('Deck the comment belongs to. Accepts UUID or slug.'),
        target: targetSchema.describe(
          'What the comment pins to: a slide, a section, or a specific element identified by its data-edit-id.',
        ),
        kind: z
          .enum(['revision', 'question', 'approval', 'note'])
          .describe('Semantic kind of the comment.'),
        body: z.string().describe('Comment body as plain text. HTML tags are stripped.'),
        view_uuid: z
          .string()
          .nullish()
          .describe('Optional UUID of the app view active when the comment was created.'),
        scroll_snapshot: z
          .string()
          .nullish()
          .describe('Optional serialised scroll position snapshot from the app.'),
      }),
      _meta: {
        ui: {
          resourceUri: DECK_EDITOR_RESOURCE_URI,
          visibility: ['app'],
        },
      },
    },
    async ({ deck_id, target, kind, body, view_uuid, scroll_snapshot }) => {
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
          author: 'user',
          kind,
          body,
        });

        const payload: Record<string, unknown> = {
          comment: formatComment(comment),
        };
        if (view_uuid) payload.view_uuid = view_uuid;
        if (scroll_snapshot) payload.scroll_snapshot = scroll_snapshot;

        return structuredResponse(payload, `Comment added by user on ${target.kind}`);
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
