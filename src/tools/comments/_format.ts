/**
 * Shared formatter that maps a domain `Comment` to the snake_case shape
 * used across every comment-related MCP tool output.
 *
 * Exists so list/add/resolve/add_from_app all agree on the exact wire shape,
 * including the structured `target` object (slide/section/ir_node variants).
 *
 * v4.8.5 — element pins surface as `kind: "ir_node"` carrying
 * `ir_path: ["body", N, …]`. The agent feeds that array straight into
 * `apply_slide_node_edit` / `apply_section_node_edit` to patch the
 * targeted node without re-emitting the whole slide / section IR.
 */

import type { Comment } from '../../types/comment.js';

export interface CommentWireShape {
  id: string;
  deck_id: string;
  target:
    | { kind: 'slide'; slide_id: string }
    | { kind: 'section'; section_id: string }
    | {
        kind: 'ir_node';
        container_id: string;
        ir_path: ReadonlyArray<string | number>;
        preview?: string;
      };
  author: 'user' | 'agent';
  kind: string;
  body: string;
  created_at: string;
  resolved_at?: string;
  resolved_by?: 'user' | 'agent';
  resolution_note?: string;
}

export function formatComment(c: Comment): CommentWireShape {
  return {
    id: c.id as string,
    deck_id: c.deckId as string,
    target: formatTarget(c.target),
    author: c.author,
    kind: c.kind,
    body: c.body,
    created_at: c.createdAt,
    ...(c.resolvedAt ? { resolved_at: c.resolvedAt } : {}),
    ...(c.resolvedBy ? { resolved_by: c.resolvedBy } : {}),
    ...(c.resolutionNote ? { resolution_note: c.resolutionNote } : {}),
  };
}

function formatTarget(target: Comment['target']): CommentWireShape['target'] {
  // Runtime narrowing — the discriminator may not match the v4.8.5 union
  // for records persisted by an earlier server version (notably the v4.4
  // `kind: 'element'` shape with `editId`). Gracefully degrade those to
  // a slide-level target so the body stays visible instead of crashing
  // downstream consumers.
  const kind = (target as { kind?: string }).kind;
  if (kind === 'slide') {
    return { kind: 'slide', slide_id: (target as { slideId: string }).slideId };
  }
  if (kind === 'section') {
    return { kind: 'section', section_id: (target as { sectionId: string }).sectionId };
  }
  if (kind === 'ir_node') {
    const t = target as { containerId: string; irPath: ReadonlyArray<string | number>; preview?: string };
    return {
      kind: 'ir_node',
      container_id: t.containerId,
      ir_path: t.irPath,
      ...(t.preview ? { preview: t.preview } : {}),
    };
  }
  // Legacy v4.4 element comment — degrade to its container slide so the
  // wire shape stays valid for downstream consumers.
  if (kind === 'element') {
    const containerId = (target as { containerId?: string }).containerId;
    if (typeof containerId === 'string' && containerId.length > 0) {
      return { kind: 'slide', slide_id: containerId };
    }
  }
  // Truly unknown shape — surface as a slide target with the deck-level
  // hint so the caller can still see / resolve it. Empty slide_id is the
  // best we can do; the comment service that produced this record is
  // responsible for never persisting an unkeyed target.
  return { kind: 'slide', slide_id: '' };
}
