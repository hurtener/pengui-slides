/**
 * Comment Service — between-turn feedback channel for v4.
 *
 * Users drop pins on slides / sections / specific elements via the MCP App;
 * agents read them via `list_comments` on the next turn and respond by either
 * making the change and calling `resolve_comment`, or leaving a counter-note
 * via `add_comment` (author='agent').
 *
 * Comments are structured objects, not free-form chat. No streaming, no
 * mid-turn interruption. The agent queries when it's ready to listen.
 */

import type { CommentId, DeckId } from '../../types/common.js';
import { commentId as brandCommentId } from '../../types/common.js';
import type {
  Comment,
  AddCommentInput,
  ResolveCommentInput,
  ListCommentsFilter,
} from '../../types/comment.js';
import type { ICommentStore } from '../../storage/interfaces.js';
import {
  CommentNotFoundError,
  CommentAlreadyResolvedError,
} from '../../types/errors.js';
import { generateCommentId, type Clock } from '../../infrastructure/index.js';
import type { Logger } from '../../infrastructure/index.js';
import type { DeckService } from '../decks/deck-service.js';

export class CommentService {
  constructor(
    private readonly store: ICommentStore,
    private readonly deckService: DeckService,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /** Add a new comment. Deck ref may be UUID or slug. */
  async add(input: AddCommentInput): Promise<Comment> {
    const did = await this.deckService.resolveRefOrThrow(input.deckId);
    const now = this.clock.now();
    const comment: Comment = {
      id: generateCommentId(),
      deckId: did,
      target: input.target,
      author: input.author,
      kind: input.kind,
      body: sanitiseBody(input.body),
      createdAt: now,
    };
    await this.store.save(comment);
    this.logger.info('Comment added', {
      commentId: comment.id,
      deckId: did,
      author: input.author,
      kind: input.kind,
      target: input.target.kind,
    });
    return comment;
  }

  /** List comments for a deck, ordered oldest-first. */
  async listByDeck(deckRef: string, filter?: ListCommentsFilter): Promise<Comment[]> {
    const did = await this.deckService.resolveRefOrThrow(deckRef);
    return this.store.listByDeck(did, filter);
  }

  /** Get a single comment by id. */
  async get(id: CommentId): Promise<Comment> {
    const c = await this.store.get(id);
    if (!c) throw new CommentNotFoundError(id as string);
    return c;
  }

  /** Mark a comment resolved. Throws if already resolved. */
  async resolve(input: ResolveCommentInput): Promise<Comment> {
    const id = brandCommentId(input.commentId);
    const existing = await this.store.get(id);
    if (!existing) throw new CommentNotFoundError(input.commentId);
    if (existing.resolvedAt) throw new CommentAlreadyResolvedError(input.commentId);
    const now = this.clock.now();
    const updated: Comment = {
      ...existing,
      resolvedAt: now,
      resolvedBy: input.resolvedBy,
      ...(input.resolutionNote ? { resolutionNote: sanitiseBody(input.resolutionNote) } : {}),
    };
    await this.store.save(updated);
    this.logger.info('Comment resolved', {
      commentId: id,
      resolvedBy: input.resolvedBy,
    });
    return updated;
  }

  /** Cleanup hook — called when a deck is deleted. */
  async deleteByDeck(deckId: DeckId): Promise<number> {
    return this.store.deleteByDeck(deckId);
  }
}

/**
 * Sanitise comment body / resolution note — strip HTML tags, collapse
 * whitespace, cap at 4 KB. Comments are rendered as plain text in the UI.
 */
function sanitiseBody(input: string): string {
  const stripped = input.replace(/<\/?[a-z][\s\S]*?>/gi, '');
  const trimmed = stripped.trim();
  return trimmed.length > 4096 ? trimmed.slice(0, 4096) : trimmed;
}
