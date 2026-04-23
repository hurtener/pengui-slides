/**
 * File-based implementation of ICommentStore.
 *
 * Layout:
 *   <baseDir>/comments/<commentId>.json
 */

import fs from 'node:fs';
import path from 'node:path';
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

export class FileCommentStore implements ICommentStore {
  private readonly dir: string;

  constructor(baseDir: string) {
    this.dir = path.join(baseDir, 'comments');
  }

  private ensureDir(): void {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private commentPath(id: CommentId): string {
    return path.join(this.dir, `${id}.json`);
  }

  async save(comment: Comment): Promise<void> {
    this.ensureDir();
    fs.writeFileSync(
      this.commentPath(comment.id),
      JSON.stringify(clone(comment), null, 2),
      'utf-8',
    );
  }

  async get(id: CommentId): Promise<Comment | undefined> {
    const file = this.commentPath(id);
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Comment;
  }

  async listByDeck(deckId: DeckId, filter?: ListCommentsFilter): Promise<Comment[]> {
    this.ensureDir();
    const out: Comment[] = [];
    for (const file of fs.readdirSync(this.dir)) {
      if (!file.endsWith('.json')) continue;
      const c = JSON.parse(fs.readFileSync(path.join(this.dir, file), 'utf-8')) as Comment;
      if (c.deckId !== deckId) continue;
      if (!matches(c, filter)) continue;
      out.push(c);
    }
    out.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return out;
  }

  async delete(id: CommentId): Promise<boolean> {
    const file = this.commentPath(id);
    if (!fs.existsSync(file)) return false;
    fs.unlinkSync(file);
    return true;
  }

  async deleteByDeck(deckId: DeckId): Promise<number> {
    this.ensureDir();
    let n = 0;
    for (const file of fs.readdirSync(this.dir)) {
      if (!file.endsWith('.json')) continue;
      const fullPath = path.join(this.dir, file);
      const c = JSON.parse(fs.readFileSync(fullPath, 'utf-8')) as Comment;
      if (c.deckId === deckId) {
        fs.unlinkSync(fullPath);
        n++;
      }
    }
    return n;
  }
}
