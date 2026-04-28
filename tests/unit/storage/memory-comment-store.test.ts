import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryCommentStore } from '../../../src/storage/memory/comment-store.js';
import type { Comment } from '../../../src/types/comment.js';
import type { CommentId, DeckId, SlideId } from '../../../src/types/common.js';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'c1' as CommentId,
    deckId: 'deck-1' as DeckId,
    target: { kind: 'slide', slideId: 's1' as SlideId },
    author: 'user',
    kind: 'revision',
    body: 'please revise',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('InMemoryCommentStore', () => {
  let store: InMemoryCommentStore;

  beforeEach(() => {
    store = new InMemoryCommentStore();
  });

  it('saves and retrieves a comment by id', async () => {
    const c = makeComment();
    await store.save(c);
    const got = await store.get(c.id);
    expect(got).toEqual(c);
  });

  it('returns undefined for an unknown id', async () => {
    expect(await store.get('missing' as CommentId)).toBeUndefined();
  });

  it('lists comments for a deck, oldest first', async () => {
    await store.save(makeComment({ id: 'c1' as CommentId, createdAt: '2026-01-02T00:00:00.000Z' }));
    await store.save(makeComment({ id: 'c2' as CommentId, createdAt: '2026-01-01T00:00:00.000Z' }));
    const out = await store.listByDeck('deck-1' as DeckId);
    expect(out.map((c) => c.id)).toEqual(['c2', 'c1']);
  });

  it('filters by resolution state', async () => {
    await store.save(makeComment({ id: 'c1' as CommentId }));
    await store.save(
      makeComment({
        id: 'c2' as CommentId,
        resolvedAt: '2026-02-01T00:00:00.000Z',
        resolvedBy: 'agent',
      }),
    );
    const open = await store.listByDeck('deck-1' as DeckId, { resolved: false });
    const closed = await store.listByDeck('deck-1' as DeckId, { resolved: true });
    expect(open.map((c) => c.id)).toEqual(['c1']);
    expect(closed.map((c) => c.id)).toEqual(['c2']);
  });

  it('filters by target kind (slide vs ir_node)', async () => {
    await store.save(makeComment({ id: 'c1' as CommentId }));
    await store.save(
      makeComment({
        id: 'c2' as CommentId,
        target: {
          kind: 'ir_node',
          containerId: 's1',
          irPath: ['body', 0, 'left', 1],
          preview: 'Hero title',
        },
      }),
    );
    const onlySlides = await store.listByDeck('deck-1' as DeckId, { targetKind: 'slide' });
    expect(onlySlides.map((c) => c.id)).toEqual(['c1']);

    const onlyIrNode = await store.listByDeck('deck-1' as DeckId, { targetKind: 'ir_node' });
    expect(onlyIrNode.map((c) => c.id)).toEqual(['c2']);
    const c2 = onlyIrNode[0];
    if (c2.target.kind !== 'ir_node') throw new Error('expected ir_node target');
    expect(c2.target.irPath).toEqual(['body', 0, 'left', 1]);
    expect(c2.target.preview).toBe('Hero title');
  });

  it('ignores comments from other decks', async () => {
    await store.save(makeComment({ id: 'c1' as CommentId }));
    await store.save(makeComment({ id: 'c2' as CommentId, deckId: 'deck-2' as DeckId }));
    const out = await store.listByDeck('deck-1' as DeckId);
    expect(out.map((c) => c.id)).toEqual(['c1']);
  });

  it('delete removes the record and returns true; false for unknown', async () => {
    await store.save(makeComment());
    expect(await store.delete('c1' as CommentId)).toBe(true);
    expect(await store.get('c1' as CommentId)).toBeUndefined();
    expect(await store.delete('c1' as CommentId)).toBe(false);
  });

  it('deleteByDeck removes all comments for a deck', async () => {
    await store.save(makeComment({ id: 'c1' as CommentId }));
    await store.save(makeComment({ id: 'c2' as CommentId }));
    await store.save(makeComment({ id: 'c3' as CommentId, deckId: 'deck-2' as DeckId }));
    const n = await store.deleteByDeck('deck-1' as DeckId);
    expect(n).toBe(2);
    expect((await store.listByDeck('deck-1' as DeckId)).length).toBe(0);
    expect((await store.listByDeck('deck-2' as DeckId)).length).toBe(1);
  });

  it('clones on write/read so external mutation does not leak', async () => {
    const c = makeComment();
    await store.save(c);
    c.body = 'MUTATED';
    const got = await store.get(c.id);
    expect(got?.body).toBe('please revise');
  });
});
