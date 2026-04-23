/**
 * Comment / Marker type for v4.
 *
 * Structured pin attached to a slide, section, or specific element
 * (by `data-edit-id`). Authored by either the user (via the MCP App)
 * or the agent (via `add_comment`). The agent reads unresolved comments
 * on each turn via `list_comments`; that's the between-turn feedback
 * channel — no streaming, no inline chat, no mid-turn interruption.
 *
 * Kind semantics (drives UI affordance and agent priority):
 *   revision  — user wants a change ("make this bolder", "fix typo")
 *   question  — user is asking for clarification from the agent
 *   approval  — user signing off on a slide/section
 *   note      — freeform observation; no agent action required
 */

import type {
  CommentId,
  DeckId,
  SlideId,
  SectionId,
  ISOTimestamp,
} from './common.js';

export type CommentKind = 'revision' | 'question' | 'approval' | 'note';
export type CommentAuthor = 'user' | 'agent';

export type CommentTarget =
  | { kind: 'slide'; slideId: SlideId }
  | { kind: 'section'; sectionId: SectionId }
  | {
      kind: 'element';
      /** The slide or section that contains the element. */
      containerId: string;
      /** The `data-edit-id` of the specific element. */
      editId: string;
    };

export interface Comment {
  id: CommentId;
  deckId: DeckId;
  target: CommentTarget;
  author: CommentAuthor;
  kind: CommentKind;
  /** Plain text. Stored as-is; rendered through a markdown-lite escaper in the UI. */
  body: string;
  createdAt: ISOTimestamp;
  resolvedAt?: ISOTimestamp;
  resolvedBy?: CommentAuthor;
  /**
   * Optional reply supplied by whoever resolved the comment.
   * Plain text, same sanitation rules as `body`.
   */
  resolutionNote?: string;
}

export interface AddCommentInput {
  deckId: string;
  target: CommentTarget;
  author: CommentAuthor;
  kind: CommentKind;
  body: string;
}

export interface ResolveCommentInput {
  commentId: string;
  resolvedBy: CommentAuthor;
  resolutionNote?: string;
}

export interface ListCommentsFilter {
  /** If set, return only unresolved (true) or only resolved (false). */
  resolved?: boolean;
  /** Filter by target kind. */
  targetKind?: CommentTarget['kind'];
}
