/**
 * v4.10: bulk-insert paths used by `compile_markdown` when called with
 * a target. Exercises the new `insertSlideNodesBulk` /
 * `insertSectionNodesBulk` service methods + the markdown→IR pipeline
 * end-to-end so the cost-saving path stays correct.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { createContainer } from '../../../../src/container.js';
import { loadConfig } from '../../../../src/config.js';
import { sampleSoulInput } from '../../../helpers/fixtures.js';
import { rt } from '../../../../src/domain/ir/rich-text.js';
import { compileMarkdown } from '../../../../src/domain/markdown/compile-markdown.js';

describe('insertSlideNodesBulk + compile_markdown round-trip', () => {
  let container: ReturnType<typeof createContainer>;
  let deckId: string;
  let slideId: string;

  beforeEach(async () => {
    container = createContainer(loadConfig({ logLevel: 'error' }));
    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({
      soulId: soul.id as string,
      title: 'Bulk Insert Deck',
    });
    deckId = deck.id as string;
    const slide = await container.deckService.addSlide({
      deckId,
      ir: { body: [{ type: 'prose', body: rt({ text: 'existing' }) }] },
      metadata: { title: 'Bulk', type: 'content', narrative: '' },
    });
    slideId = slide.id as string;
  });

  it('lands every compiled markdown node contiguously into body', async () => {
    const md = '# Title\n\nA paragraph.\n\n- one\n- two\n\n> wisdom';
    const { nodes } = compileMarkdown(md);
    expect(nodes.map((n) => n.type)).toEqual([
      'heading',
      'prose',
      'list',
      'quote',
    ]);

    const { slide, insertedPaths } = await container.deckService.insertSlideNodesBulk({
      deckId,
      slideId,
      parentPath: ['body'],
      position: 1, // after the existing prose
      nodes,
    });

    expect(insertedPaths).toEqual([
      ['body', 1],
      ['body', 2],
      ['body', 3],
      ['body', 4],
    ]);
    // Final body has the original prose at index 0 plus the four new
    // markdown-derived nodes in order.
    expect(slide.ir!.body.map((n) => n.type)).toEqual([
      'prose',
      'heading',
      'prose',
      'list',
      'quote',
    ]);
  });

  it('lands all four headings + final IR validates', async () => {
    const md = '# A\n\n# B\n\n# C\n\n# D';
    const { nodes } = compileMarkdown(md);

    await container.deckService.insertSlideNodesBulk({
      deckId,
      slideId,
      parentPath: ['body'],
      position: 1,
      nodes,
    });

    const after = await container.deckService.getSlide(slideId);
    expect(after.ir!.body).toHaveLength(5);
    expect(after.ir!.body.slice(1).map((n) => n.type)).toEqual([
      'heading',
      'heading',
      'heading',
      'heading',
    ]);
  });

  it('empty node list is a no-op (validates, no-op rev)', async () => {
    const before = await container.deckService.getSlide(slideId);
    const { slide, insertedPaths } = await container.deckService.insertSlideNodesBulk({
      deckId,
      slideId,
      parentPath: ['body'],
      position: 0,
      nodes: [],
    });
    expect(insertedPaths).toEqual([]);
    expect(slide.ir!.body).toHaveLength(before.ir!.body.length);
  });
});

describe('insertSectionNodesBulk + compile_markdown round-trip', () => {
  let container: ReturnType<typeof createContainer>;
  let deckId: string;
  let sectionId: string;

  beforeEach(async () => {
    container = createContainer(loadConfig({ logLevel: 'error' }));
    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    const deck = await container.deckService.createDeck({
      soulId: soul.id as string,
      title: 'Bulk Section Deck',
      format: 'print_a4_portrait',
    });
    deckId = deck.id as string;
    const { section } = await container.documentService.addSection({
      deckId,
      kind: 'prose',
      ir: {
        kind: 'prose',
        body: [{ type: 'prose', body: rt({ text: 'existing' }) }],
      },
      metadata: { title: 'S', narrative: '' },
    });
    sectionId = section.id as string;
  });

  it('lands compiled markdown into a section in one round-trip', async () => {
    const md = '## Subhead\n\n- a\n- b';
    const { nodes } = compileMarkdown(md);

    const { section, insertedPaths } =
      await container.documentService.insertSectionNodesBulk({
        deckId,
        sectionId,
        parentPath: ['body'],
        position: 1,
        nodes,
      });

    expect(insertedPaths).toEqual([
      ['body', 1],
      ['body', 2],
    ]);
    expect(section.ir.body.map((n) => n.type)).toEqual([
      'prose',
      'heading',
      'list',
    ]);
  });
});
