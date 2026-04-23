/**
 * MCP Tool: list_comments
 *
 * Returns comments on a deck — the between-turn feedback channel.
 * Users drop pins on slides / sections / elements in the MCP App;
 * the agent reads them here and responds by editing + resolving, or
 * by replying with `add_comment` (author='agent').
 *
 * Default filter is `resolved: false` — the agent almost always wants
 * the open queue. Pass `resolved: 'all'` for history.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { ServiceContainer } from '../../container.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { formatComment } from './_format.js';

export function registerListCommentsTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'list_comments',
    {
      title: 'List Comments',
      description:
        'List comments on a deck. Default returns UNRESOLVED comments — the agent\'s ' +
        'between-turn work queue. Pass resolved="all" for history, or resolved="resolved" ' +
        'to see already-closed items. Each comment has a target (slide/section/element), a ' +
        'kind (revision/question/approval/note), an author (user/agent), and a body. ' +
        'Agents SHOULD call this before starting significant work on a deck, and after any ' +
        'user-driven mutation, to pick up feedback left between turns.',
      inputSchema: z.object({
        deck_id: z.string().describe('Deck to list comments for. Accepts UUID or slug.'),
        resolved: z
          .enum(['unresolved', 'resolved', 'all'])
          .nullish()
          .describe('Filter by resolution state. Defaults to "unresolved".'),
        target_kind: z
          .enum(['slide', 'section', 'element'])
          .nullish()
          .describe('Filter by target kind. Omit for all targets.'),
      }),
    },
    async ({ deck_id, resolved, target_kind }) => {
      try {
        const filter: { resolved?: boolean; targetKind?: 'slide' | 'section' | 'element' } = {};
        const r = resolved ?? 'unresolved';
        if (r === 'unresolved') filter.resolved = false;
        else if (r === 'resolved') filter.resolved = true;
        if (target_kind) filter.targetKind = target_kind;

        const comments = await container.commentService.listByDeck(deck_id, filter);
        return structuredResponse({
          deck_id,
          comment_count: comments.length,
          comments: comments.map(formatComment),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
