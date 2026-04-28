/**
 * Comment / Marker type for v4.
 *
 * Structured pin attached to a slide, section, or specific IR node.
 * Authored by either the user (via the MCP App) or the agent (via
 * `add_comment`). The agent reads unresolved comments on each turn via
 * `list_comments`; that's the between-turn feedback channel — no
 * streaming, no inline chat, no mid-turn interruption.
 *
 * v4.8.5: element-targeted pins point at an IR node by structural
 * `irPath` (the same shape `replaceNodeAtPath` accepts), not the v4.4-era
 * `data-edit-id`. The compiler emits `data-ir-path="body,N,…"` on every
 * node root; the App reads that on click and stores the parsed array.
 * The agent gets `ir_path` back in the wire format and feeds it
 * straight into `apply_slide_node_edit` / `apply_section_node_edit`.
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
import type { IRPath } from '../domain/ir/operations/replace-node.js';

export type CommentKind = 'revision' | 'question' | 'approval' | 'note';
export type CommentAuthor = 'user' | 'agent';

export type CommentTarget =
  | { kind: 'slide'; slideId: SlideId }
  | { kind: 'section'; sectionId: SectionId }
  | {
      kind: 'ir_node';
      /** The slide or section that contains the targeted node. */
      containerId: string;
      /**
       * Structural pointer into the slide / section IR — the same shape
       * `replaceNodeAtPath` accepts. e.g. `["body", 2, "left", 1]` or
       * `["body", 3, "cells", 0, 1]`. Round-trips through the compiled
       * `data-ir-path` attribute on the rendered node root.
       */
      irPath: IRPath;
      /**
       * Optional human-readable preview captured at pin time (e.g. the
       * pinned element's first line of innerText). Drives UI hints in
       * the comment list; not load-bearing for the agent's edit flow.
       */
      preview?: string;
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
