/**
 * Shared formatter that maps a domain `Comment` to the snake_case shape
 * used across every comment-related MCP tool output.
 *
 * Exists so list/add/resolve/add_from_app all agree on the exact wire shape,
 * including the structured `target` object (slide/section/element variants).
 */

import type { Comment } from '../../types/comment.js';

export interface CommentWireShape {
  id: string;
  deck_id: string;
  target:
    | { kind: 'slide'; slide_id: string }
    | { kind: 'section'; section_id: string }
    | { kind: 'element'; container_id: string; edit_id: string };
  author: 'user' | 'agent';
  kind: string;
  body: string;
  created_at: string;
  resolved_at?: string;
  resolved_by?: 'user' | 'agent';
  resolution_note?: string;
}

export function formatComment(c: Comment): CommentWireShape {
  const target: CommentWireShape['target'] =
    c.target.kind === 'slide'
      ? { kind: 'slide', slide_id: c.target.slideId as string }
      : c.target.kind === 'section'
        ? { kind: 'section', section_id: c.target.sectionId as string }
        : {
            kind: 'element',
            container_id: c.target.containerId,
            edit_id: c.target.editId,
          };

  return {
    id: c.id as string,
    deck_id: c.deckId as string,
    target,
    author: c.author,
    kind: c.kind,
    body: c.body,
    created_at: c.createdAt,
    ...(c.resolvedAt ? { resolved_at: c.resolvedAt } : {}),
    ...(c.resolvedBy ? { resolved_by: c.resolvedBy } : {}),
    ...(c.resolutionNote ? { resolution_note: c.resolutionNote } : {}),
  };
}
