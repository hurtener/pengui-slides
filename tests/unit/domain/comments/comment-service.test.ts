import { describe, it, expect, beforeEach } from 'vitest';
import { createContainer } from '../../../../src/container.js';
import { loadConfig } from '../../../../src/config.js';
import { sampleSoulInput } from '../../../helpers/fixtures.js';

describe('CommentService (integration via container)', () => {
  let container: ReturnType<typeof createContainer>;
  let deckIdStr: string;

  beforeEach(async () => {
    container = createContainer(loadConfig({ logLevel: 'error' }));
    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({
      soulId: soul.id as string,
      title: 'Comment Deck',
    });
    deckIdStr = deck.id as string;
  });

  it('adds a comment by deck UUID and retrieves it by slug', async () => {
    const added = await container.commentService.add({
      deckId: deckIdStr,
      target: { kind: 'slide', slideId: 'slide-xyz' as unknown as never },
      author: 'user',
      kind: 'revision',
      body: 'Make the title larger please.',
    });
    expect(added.kind).toBe('revision');
    expect(added.author).toBe('user');
    expect(added.resolvedAt).toBeUndefined();

    const summary = await container.deckService.getDeckSummary(deckIdStr);
    const viaSlug = await container.commentService.listByDeck(summary.slug);
    expect(viaSlug.map((c) => c.id)).toContain(added.id);
  });

  it('strips HTML from the body and clamps long input', async () => {
    const added = await container.commentService.add({
      deckId: deckIdStr,
      target: { kind: 'slide', slideId: 'slide-1' as unknown as never },
      author: 'user',
      kind: 'note',
      body: '  <script>alert(1)</script>keep this <b>text</b>  ',
    });
    expect(added.body).toBe('alert(1)keep this text');
  });

  it('lists only unresolved by default when asked via filter', async () => {
    const a = await container.commentService.add({
      deckId: deckIdStr,
      target: { kind: 'slide', slideId: 'slide-1' as unknown as never },
      author: 'user',
      kind: 'revision',
      body: 'Open item',
    });
    const b = await container.commentService.add({
      deckId: deckIdStr,
      target: { kind: 'slide', slideId: 'slide-1' as unknown as never },
      author: 'user',
      kind: 'note',
      body: 'Closed item',
    });
    await container.commentService.resolve({
      commentId: b.id,
      resolvedBy: 'agent',
      resolutionNote: 'done',
    });

    const unresolved = await container.commentService.listByDeck(deckIdStr, { resolved: false });
    expect(unresolved.map((c) => c.id)).toEqual([a.id]);

    const resolved = await container.commentService.listByDeck(deckIdStr, { resolved: true });
    expect(resolved.map((c) => c.id)).toEqual([b.id]);
  });

  it('resolve attaches a resolution note + stamps resolvedBy', async () => {
    const c = await container.commentService.add({
      deckId: deckIdStr,
      target: { kind: 'slide', slideId: 'slide-1' as unknown as never },
      author: 'user',
      kind: 'question',
      body: 'Is this on brand?',
    });
    const updated = await container.commentService.resolve({
      commentId: c.id,
      resolvedBy: 'agent',
      resolutionNote: 'Yes — confirmed against the soul.',
    });
    expect(updated.resolvedAt).toBeDefined();
    expect(updated.resolvedBy).toBe('agent');
    expect(updated.resolutionNote).toBe('Yes — confirmed against the soul.');
  });

  it('throws COMMENT_ALREADY_RESOLVED when resolving twice', async () => {
    const c = await container.commentService.add({
      deckId: deckIdStr,
      target: { kind: 'slide', slideId: 'slide-1' as unknown as never },
      author: 'user',
      kind: 'revision',
      body: 'x',
    });
    await container.commentService.resolve({ commentId: c.id, resolvedBy: 'agent' });
    await expect(
      container.commentService.resolve({ commentId: c.id, resolvedBy: 'agent' }),
    ).rejects.toMatchObject({ code: 'COMMENT_ALREADY_RESOLVED' });
  });

  it('throws COMMENT_NOT_FOUND for unknown ids', async () => {
    await expect(
      container.commentService.resolve({
        commentId: 'does-not-exist',
        resolvedBy: 'agent',
      }),
    ).rejects.toMatchObject({ code: 'COMMENT_NOT_FOUND' });
  });

  it('throws DECK_NOT_FOUND when adding to an unknown deck', async () => {
    await expect(
      container.commentService.add({
        deckId: 'no-such-deck',
        target: { kind: 'slide', slideId: 'slide-1' as unknown as never },
        author: 'user',
        kind: 'note',
        body: 'stranded',
      }),
    ).rejects.toMatchObject({ code: 'DECK_NOT_FOUND' });
  });
});
