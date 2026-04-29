/**
 * Round-trip: structural slide ops + comment ir_path migration.
 *
 * The migrator lives in `CommentService.migrateIrPathsForContainer` and is
 * called from each structural-op MCP tool. These tests bypass the tool
 * layer and invoke `DeckService.{removeSlideNode,duplicateSlideNode,
 * insertSlideNode,moveSlideNode}` followed by the migrator with the
 * matching `migratePathAfter*` rewriter — exactly the pipeline the tools
 * orchestrate. This locks the v4.9 pin-survival contract in place.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createContainer } from '../../../../src/container.js';
import { loadConfig } from '../../../../src/config.js';
import { sampleSoulInput } from '../../../helpers/fixtures.js';
import { rt } from '../../../../src/domain/ir/rich-text.js';
import {
  migratePathAfterRemove,
  migratePathAfterInsert,
  migratePathAfterDuplicate,
  migratePathAfterMove,
} from '../../../../src/domain/ir/index.js';
import type { SlideIR } from '../../../../src/domain/ir/index.js';
import type { Comment } from '../../../../src/types/comment.js';

function makeMultiBodyIR(): SlideIR {
  return {
    body: [
      { type: 'hero', title: rt({ text: 'A' }) },
      { type: 'prose', body: rt({ text: 'B' }) },
      { type: 'prose', body: rt({ text: 'C' }) },
    ],
  };
}

describe('Comment ir_path migration after structural slide ops', () => {
  let container: ReturnType<typeof createContainer>;
  let deckId: string;
  let slideId: string;

  beforeEach(async () => {
    container = createContainer(loadConfig({ logLevel: 'error' }));
    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({
      soulId: soul.id as string,
      title: 'Pin Migration Deck',
    });
    deckId = deck.id as string;
    const slide = await container.deckService.addSlide({
      deckId,
      ir: makeMultiBodyIR(),
      metadata: {
        title: 'Pin slide',
        type: 'content',
        narrative: '',
      },
    });
    slideId = slide.id as string;
  });

  async function findComment(id: string): Promise<Comment | undefined> {
    const all = await container.commentService.listByDeck(deckId);
    return all.find((c) => c.id === id);
  }

  it('removeSlideNode + migratePathAfterRemove decrements paths after the removed sibling', async () => {
    // Pin a comment to body[2] (the third item).
    const pinned = await container.commentService.add({
      deckId,
      target: {
        kind: 'ir_node',
        containerId: slideId as never,
        irPath: ['body', 2],
        preview: 'C',
      },
      author: 'user',
      kind: 'note',
      body: 'hold on to me',
    });

    // Remove body[0]; body[2] shifts to body[1].
    await container.deckService.removeSlideNode({
      deckId,
      slideId,
      path: ['body', 0],
    });
    await container.commentService.migrateIrPathsForContainer(deckId, slideId, (p) =>
      migratePathAfterRemove(p, ['body', 0]),
    );

    const after = await findComment(pinned.id);
    expect(after?.target).toMatchObject({
      kind: 'ir_node',
      irPath: ['body', 1],
    });
  });

  it('removeSlideNode orphans pins that lived inside the removed subtree', async () => {
    // Pin a comment to body[1] itself, then remove body[1].
    const pinned = await container.commentService.add({
      deckId,
      target: {
        kind: 'ir_node',
        containerId: slideId as never,
        irPath: ['body', 1],
        preview: 'B',
      },
      author: 'user',
      kind: 'revision',
      body: 'rewrite the second block',
    });

    await container.deckService.removeSlideNode({
      deckId,
      slideId,
      path: ['body', 1],
    });
    const result = await container.commentService.migrateIrPathsForContainer(
      deckId,
      slideId,
      (p) => migratePathAfterRemove(p, ['body', 1]),
    );

    expect(result.orphanedCount).toBe(1);
    const after = await findComment(pinned.id);
    // Orphaned comments degrade target to slide so the body stays visible.
    expect(after?.target).toMatchObject({ kind: 'slide' });
  });

  it('insertSlideNode shifts pins at and after the insertion position', async () => {
    const before = await container.commentService.add({
      deckId,
      target: { kind: 'ir_node', containerId: slideId as never, irPath: ['body', 0] },
      author: 'user',
      kind: 'note',
      body: 'unaffected — at the head',
    });
    const shifted = await container.commentService.add({
      deckId,
      target: { kind: 'ir_node', containerId: slideId as never, irPath: ['body', 2] },
      author: 'user',
      kind: 'note',
      body: 'should slide right by one',
    });

    // Insert a new prose at body[1].
    await container.deckService.insertSlideNode({
      deckId,
      slideId,
      parentPath: ['body'],
      position: 1,
      newNode: { type: 'prose', body: rt({ text: 'inserted' }) },
    });
    await container.commentService.migrateIrPathsForContainer(deckId, slideId, (p) =>
      migratePathAfterInsert(p, ['body'], 1),
    );

    const a = await findComment(before.id);
    const b = await findComment(shifted.id);
    expect(a?.target).toMatchObject({ irPath: ['body', 0] });
    expect(b?.target).toMatchObject({ irPath: ['body', 3] });
  });

  it('moveSlideNode re-roots pins inside the moved subtree (forward reorder)', async () => {
    const moved = await container.commentService.add({
      deckId,
      target: { kind: 'ir_node', containerId: slideId as never, irPath: ['body', 0] },
      author: 'user',
      kind: 'note',
      body: 'follows the moved hero',
    });

    // Move body[0] forward to position 2. Same-container forward moves
    // decrement the destination by 1 to honor "drop after the sibling
    // currently at index N" semantics, so the moved node lands at
    // body[1] (between the original B and C).
    const moveResult = await container.deckService.moveSlideNode({
      deckId,
      slideId,
      fromPath: ['body', 0],
      toParentPath: ['body'],
      toPosition: 2,
    });
    expect(moveResult.newPath).toEqual(['body', 1]);
    await container.commentService.migrateIrPathsForContainer(deckId, slideId, (p) =>
      migratePathAfterMove(p, ['body', 0], ['body'], 2),
    );

    const after = await findComment(moved.id);
    expect(after?.target).toMatchObject({ irPath: ['body', 1] });
  });

  it('duplicateSlideNode does not change the source pin path', async () => {
    const pinned = await container.commentService.add({
      deckId,
      target: { kind: 'ir_node', containerId: slideId as never, irPath: ['body', 1] },
      author: 'user',
      kind: 'note',
      body: 'original',
    });

    await container.deckService.duplicateSlideNode({
      deckId,
      slideId,
      path: ['body', 1],
    });
    await container.commentService.migrateIrPathsForContainer(deckId, slideId, (p) =>
      migratePathAfterDuplicate(p, ['body', 1], 2),
    );

    const after = await findComment(pinned.id);
    // Source stays put — the clone gets inserted after it without
    // shifting the original's index.
    expect(after?.target).toMatchObject({ irPath: ['body', 1] });
  });
});
