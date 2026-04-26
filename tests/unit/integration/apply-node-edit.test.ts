/**
 * v4.6: apply_slide_node_edit / apply_section_node_edit replace a single
 * IR node by structural path, recompile, and re-validate. Tests cover
 * the integration through deck-service / document-service to make sure
 * IR mutation, HTML recompile, and validation all wire together.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createContainer } from '../../../src/container.js';
import { loadConfig } from '../../../src/config.js';
import { sampleSoulInput } from '../../helpers/fixtures.js';
import { rt } from '../../../src/domain/ir/rich-text.js';
import type { SlideIR, SectionIR, SlideNode } from '../../../src/domain/ir/index.js';

describe('apply_node_edit (v4.6)', () => {
  let container: ReturnType<typeof createContainer>;
  let soulId: string;

  beforeEach(async () => {
    container = createContainer(loadConfig({ logLevel: 'error' }));
    const soul = await container.soulService.register(sampleSoulInput);
    await container.soulService.approve(soul.id);
    soulId = soul.id as string;
  });

  describe('slides', () => {
    it('replaces body[0] and recompiles, refreshes revisionHash', async () => {
      const deck = await container.deckService.createDeck({ soulId, title: 'D' });
      const ir: SlideIR = {
        body: [
          { type: 'hero', title: rt('Original heading') },
          { type: 'prose', body: rt('Some body text') },
        ],
      };
      const slide = await container.deckService.addSlide({
        deckId: deck.id as string,
        ir,
        metadata: { title: 'X', type: 'content', narrative: 'n' },
      });
      const beforeHash = slide.metadata.revisionHash;

      const next: SlideNode = { type: 'hero', title: rt('Refreshed heading') };
      const updated = await container.deckService.applySlideNodeEdit({
        deckId: deck.id as string,
        slideId: slide.id as string,
        path: ['body', 0],
        newNode: next,
      });

      expect(updated.html).toContain('Refreshed heading');
      expect(updated.html).not.toContain('Original heading');
      // Other nodes preserved.
      expect(updated.html).toContain('Some body text');
      expect(updated.metadata.revisionHash).not.toBe(beforeHash);
      expect(updated.sourceKind).toBe('authored_ir');
      // IR mutation persisted
      expect(updated.ir.body[0]).toEqual(next);
    });

    it('replaces a node inside two_column.right[0]', async () => {
      const deck = await container.deckService.createDeck({ soulId, title: 'D' });
      const ir: SlideIR = {
        body: [
          {
            type: 'two_column',
            left: [{ type: 'prose', body: rt('left side') }],
            right: [{ type: 'prose', body: rt('right side') }],
          },
        ],
      };
      const slide = await container.deckService.addSlide({
        deckId: deck.id as string,
        ir,
        metadata: { title: 'X', type: 'content', narrative: 'n' },
      });

      const next: SlideNode = { type: 'callout', kind: 'tip', body: rt('updated callout') };
      const updated = await container.deckService.applySlideNodeEdit({
        deckId: deck.id as string,
        slideId: slide.id as string,
        path: ['body', 0, 'right', 0],
        newNode: next,
      });

      expect(updated.html).toContain('updated callout');
      expect(updated.html).toContain('left side');
      expect(updated.html).not.toContain('right side');
    });

    it('rejects nested two_column inside a two_column branch', async () => {
      const deck = await container.deckService.createDeck({ soulId, title: 'D' });
      const ir: SlideIR = {
        body: [
          {
            type: 'two_column',
            left: [{ type: 'prose', body: rt('a') }],
            right: [{ type: 'prose', body: rt('b') }],
          },
        ],
      };
      const slide = await container.deckService.addSlide({
        deckId: deck.id as string,
        ir,
        metadata: { title: 'X', type: 'content', narrative: 'n' },
      });

      const nested: SlideNode = {
        type: 'two_column',
        left: [{ type: 'prose', body: rt('nested') }],
        right: [{ type: 'prose', body: rt('nested') }],
      };
      await expect(
        container.deckService.applySlideNodeEdit({
          deckId: deck.id as string,
          slideId: slide.id as string,
          path: ['body', 0, 'left', 0],
          newNode: nested,
        }),
      ).rejects.toThrow(/leaf node/);
    });
  });

  describe('sections', () => {
    it('replaces body[0] and recompiles section HTML + revisionHash', async () => {
      const deck = await container.deckService.createDeck({
        soulId,
        title: 'D',
        format: 'print_a4_portrait',
      });
      const ir: SectionIR = {
        body: [{ type: 'prose', body: rt('Original section body') }],
      };
      const { section } = await container.documentService.addSection({
        deckId: deck.id as string,
        kind: 'prose',
        ir,
        metadata: { title: 'S', narrative: 'n' },
      });
      const beforeHash = section.metadata.revisionHash;

      const next: SlideNode = { type: 'prose', body: rt('Refreshed section body') };
      const updated = await container.documentService.applySectionNodeEdit({
        deckId: deck.id as string,
        sectionId: section.id as string,
        path: ['body', 0],
        newNode: next,
      });

      expect(updated.html).toContain('Refreshed section body');
      expect(updated.html).not.toContain('Original section body');
      expect(updated.metadata.revisionHash).not.toBe(beforeHash);
      expect(updated.ir.body[0]).toEqual(next);
    });
  });
});
