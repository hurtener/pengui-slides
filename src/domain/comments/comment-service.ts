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
import type { IRPath } from '../ir/index.js';

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

  /**
   * Apply a path-rewrite to every `ir_node` comment whose container
   * matches `containerId` (slide id or section id). Returning `null`
   * from the rewriter orphans the comment — its target downgrades to
   * the slide / section as a whole so the body text stays visible.
   *
   * Called by the structural-op MCP tools after the underlying IR
   * mutation so pinned comments follow shifted siblings or moved
   * subtrees instead of silently pointing at the wrong node.
   */
  async migrateIrPathsForContainer(
    deckRef: string,
    containerId: string,
    rewrite: (path: IRPath) => IRPath | null,
  ): Promise<{ rewrittenCount: number; orphanedCount: number }> {
    const did = await this.deckService.resolveRefOrThrow(deckRef);
    const all = await this.store.listByDeck(did);
    let rewritten = 0;
    let orphaned = 0;
    for (const c of all) {
      if (c.target.kind !== 'ir_node') continue;
      if (c.target.containerId !== containerId) continue;
      const next = rewrite(c.target.irPath);
      if (next === null) {
        // Orphan: degrade target so the comment stays visible. The slide
        // id is the containerId — keep the body, drop the path.
        const updated: Comment = {
          ...c,
          target: { kind: 'slide', slideId: containerId as never },
        };
        await this.store.save(updated);
        orphaned += 1;
      } else if (!samePath(next, c.target.irPath)) {
        const updated: Comment = {
          ...c,
          target: { ...c.target, irPath: next },
        };
        await this.store.save(updated);
        rewritten += 1;
      }
    }
    if (rewritten > 0 || orphaned > 0) {
      this.logger.info('Migrated comment ir_paths for container', {
        containerId,
        rewrittenCount: rewritten,
        orphanedCount: orphaned,
      });
    }
    return { rewrittenCount: rewritten, orphanedCount: orphaned };
  }
}

function samePath(a: IRPath, b: IRPath): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
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
