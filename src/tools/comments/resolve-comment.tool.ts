/**
 * MCP Tool: resolve_comment
 *
 * Close a comment once the work it asked for is done. The agent typically
 * calls this after applying the requested change. A short resolution note
 * can be attached (e.g. "shrunk caption font by 2pt; fits now").
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerResolveCommentTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'resolve_comment',
    {
      title: 'Resolve Comment',
      description:
        'Mark a comment resolved. The agent calls this after addressing the pinned item ' +
        '(applying the edit, answering the question, etc.). Attach an optional resolution_note ' +
        'describing what was done — the user sees it in the MCP App comment drawer. Throws ' +
        'COMMENT_ALREADY_RESOLVED if the comment was already closed.',
      inputSchema: z.object({
        comment_id: z.string().describe('The comment to resolve.'),
        resolution_note: z
          .string()
          .nullish()
          .describe('Optional short note about how the comment was addressed.'),
      }),
    },
    async ({ comment_id, resolution_note }) => {
      try {
        const updated = await container.commentService.resolve({
          commentId: comment_id,
          resolvedBy: 'agent',
          ...(resolution_note ? { resolutionNote: resolution_note } : {}),
        });
        return textResponse({
          id: updated.id,
          deck_id: updated.deckId,
          resolved_at: updated.resolvedAt,
          resolved_by: updated.resolvedBy,
          ...(updated.resolutionNote ? { resolution_note: updated.resolutionNote } : {}),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
