/**
 * In-memory implementation of ICommentStore.
 */

import type { CommentId, DeckId } from '../../types/common.js';
import type { Comment, ListCommentsFilter } from '../../types/comment.js';
import type { ICommentStore } from '../interfaces.js';

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function matches(comment: Comment, filter?: ListCommentsFilter): boolean {
  if (!filter) return true;
  if (filter.resolved === true && !comment.resolvedAt) return false;
  if (filter.resolved === false && comment.resolvedAt) return false;
  if (filter.targetKind && comment.target.kind !== filter.targetKind) return false;
  return true;
}

export class InMemoryCommentStore implements ICommentStore {
  private readonly byId = new Map<string, Comment>();

  async save(comment: Comment): Promise<void> {
    this.byId.set(comment.id, clone(comment));
  }

  async get(id: CommentId): Promise<Comment | undefined> {
    const c = this.byId.get(id);
    return c ? clone(c) : undefined;
  }

  async listByDeck(deckId: DeckId, filter?: ListCommentsFilter): Promise<Comment[]> {
    const out: Comment[] = [];
    for (const c of this.byId.values()) {
      if (c.deckId !== deckId) continue;
      if (!matches(c, filter)) continue;
      out.push(clone(c));
    }
    // Oldest first — comments are a conversation log.
    out.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return out;
  }

  async delete(id: CommentId): Promise<boolean> {
    return this.byId.delete(id);
  }

  async deleteByDeck(deckId: DeckId): Promise<number> {
    let n = 0;
    for (const [id, c] of this.byId) {
      if (c.deckId === deckId) {
        this.byId.delete(id);
        n++;
      }
    }
    return n;
  }
}
