import { describe, it, expect, beforeEach } from 'vitest';
import { DeckService } from '../../../../src/domain/decks/deck-service.js';
import { InMemoryDeckStore } from '../../../../src/storage/memory/deck-store.js';
import { InMemorySlideStore } from '../../../../src/storage/memory/slide-store.js';
import { InMemorySectionStore } from '../../../../src/storage/memory/section-store.js';
import { InMemorySoulStore } from '../../../../src/storage/memory/soul-store.js';
import { FixedClock } from '../../../../src/infrastructure/clock.js';
import { Logger } from '../../../../src/infrastructure/logger.js';
import { SoulService } from '../../../../src/domain/souls/soul-service.js';
import { sampleSoulInput, makeSlideIR } from '../../../helpers/fixtures.js';
import { rt } from '../../../../src/domain/ir/rich-text.js';
import {
  DeckNotFoundError,
  SlideNotFoundError,
  SoulNotFoundError,
  WrongAuthoringModelError,
} from '../../../../src/types/errors.js';
import type { SoulId } from '../../../../src/types/common.js';

describe('DeckService', () => {
  let deckService: DeckService;
  let soulService: SoulService;
  let soulStore: InMemorySoulStore;
  let deckStore: InMemoryDeckStore;
  let slideStore: InMemorySlideStore;
  let sectionStore: InMemorySectionStore;
  let clock: FixedClock;
  let logger: Logger;
  let approvedSoulId: string;

  beforeEach(async () => {
    soulStore = new InMemorySoulStore();
    deckStore = new InMemoryDeckStore();
    slideStore = new InMemorySlideStore();
    sectionStore = new InMemorySectionStore();
    clock = new FixedClock('2026-01-15T12:00:00.000Z');
    logger = new Logger('test', 'error');

    soulService = new SoulService(soulStore, slideStore, clock, logger);
    deckService = new DeckService(deckStore, slideStore, sectionStore, soulStore, soulService, clock, logger);

    // Create and approve a soul for deck creation
    const soul = await soulService.register(sampleSoulInput);
    await soulService.approve(soul.id);
    approvedSoulId = soul.id as string;
  });

  describe('createDeck', () => {
    it('creates a deck linked to a soul', async () => {
      const deck = await deckService.createDeck({ soulId: approvedSoulId });

      expect(deck.soulId).toBe(approvedSoulId);
      expect(deck.slideIds).toEqual([]);
      expect(deck.title).toBe('Untitled Deck');
    });

    it('uses custom title and author when provided', async () => {
      const deck = await deckService.createDeck({
        soulId: approvedSoulId,
        title: 'My Deck',
        author: 'John Doe',
      });

      expect(deck.title).toBe('My Deck');
      expect(deck.author).toBe('John Doe');
    });

    it('throws SoulNotFoundError for non-existent soul', async () => {
      await expect(
        deckService.createDeck({ soulId: 'non-existent' }),
      ).rejects.toThrow(SoulNotFoundError);
    });

    it('defaults authoringModel to "slides" for slides_16_9', async () => {
      const deck = await deckService.createDeck({ soulId: approvedSoulId });
      expect(deck.authoringModel).toBe('slides');
      expect(deck.sectionIds).toEqual([]);
    });

    it('defaults authoringModel to "document" for print_a4_portrait', async () => {
      const deck = await deckService.createDeck({
        soulId: approvedSoulId,
        format: 'print_a4_portrait',
      });
      expect(deck.authoringModel).toBe('document');
    });

    it('respects explicit authoringModel override for print formats (legacy opt-in)', async () => {
      const deck = await deckService.createDeck({
        soulId: approvedSoulId,
        format: 'print_a4_portrait',
        authoringModel: 'slides',
      });
      expect(deck.authoringModel).toBe('slides');
    });
  });

  describe('authoring-model guards', () => {
    it('addSlide throws WrongAuthoringModelError on document-mode decks', async () => {
      const deck = await deckService.createDeck({
        soulId: approvedSoulId,
        format: 'print_a4_portrait',
      });
      await expect(
        deckService.addSlide({
          deckId: deck.id as string,
          ir: makeSlideIR(),
          metadata: { title: 't', type: 'content', narrative: '' },
        }),
      ).rejects.toThrow(WrongAuthoringModelError);
    });

    it('updateSlide throws on document-mode decks', async () => {
      const deck = await deckService.createDeck({
        soulId: approvedSoulId,
        format: 'print_a4_portrait',
      });
      await expect(
        deckService.updateSlide({
          deckId: deck.id as string,
          slideId: 'nope',
          ir: makeSlideIR(),
        }),
      ).rejects.toThrow(WrongAuthoringModelError);
    });

    it('reorderSlides throws on document-mode decks', async () => {
      const deck = await deckService.createDeck({
        soulId: approvedSoulId,
        format: 'print_a4_portrait',
      });
      await expect(
        deckService.reorderSlides(deck.id as string, []),
      ).rejects.toThrow(WrongAuthoringModelError);
    });

    it('WrongAuthoringModelError names the suggested tool in the message', async () => {
      const deck = await deckService.createDeck({
        soulId: approvedSoulId,
        format: 'print_a4_portrait',
      });
      try {
        await deckService.addSlide({
          deckId: deck.id as string,
          ir: makeSlideIR(),
          metadata: { title: 't', type: 'content', narrative: '' },
        });
        expect.fail('expected WrongAuthoringModelError');
      } catch (err) {
        expect((err as Error).message).toContain('add_section');
        expect((err as Error).message).toContain('document-mode');
      }
    });

    it('persists the deck to the store', async () => {
      const deck = await deckService.createDeck({ soulId: approvedSoulId });

      const retrieved = await deckStore.get(deck.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.title).toBe('Untitled Deck');
    });

    it('creates a revision entry', async () => {
      const deck = await deckService.createDeck({ soulId: approvedSoulId });

      const revisions = await deckStore.getRevisions(deck.id);
      expect(revisions).toHaveLength(1);
      expect(revisions[0].type).toBe('deck_created');
    });
  });

  describe('addSlide', () => {
    it('adds a slide to a deck', async () => {
      const deck = await deckService.createDeck({ soulId: approvedSoulId });

      const slide = await deckService.addSlide({
        deckId: deck.id as string,
        ir: makeSlideIR(),
        metadata: {
          title: 'Intro Slide',
          type: 'title',
          narrative: 'Introduction to the topic',
        },
      });

      expect(slide.deckId).toBe(deck.id);
      expect(slide.position).toBe(0);
      expect(slide.metadata.title).toBe('Intro Slide');
    });

    it('auto-fills provenance metadata', async () => {
      const deck = await deckService.createDeck({ soulId: approvedSoulId });

      const slide = await deckService.addSlide({
        deckId: deck.id as string,
        ir: makeSlideIR(),
        metadata: {
          title: 'Test',
          type: 'content',
          narrative: 'Narrative',
        },
      });

      expect(slide.metadata.generatedAt).toBe('2026-01-15T12:00:00.000Z');
      expect(slide.metadata.soulId).toBe(approvedSoulId);
      expect(slide.metadata.deckId).toBe(deck.id as string);
      expect(slide.metadata.metaVersion).toBe('1.0');
      expect(slide.metadata.revisionHash).toBeDefined();
    });

    it('increments position for subsequent slides', async () => {
      const deck = await deckService.createDeck({ soulId: approvedSoulId });
      const deckId = deck.id as string;

      const slide1 = await deckService.addSlide({
        deckId,
        ir: makeSlideIR(),
        metadata: { title: 'First', type: 'content', narrative: '' },
      });

      const slide2 = await deckService.addSlide({
        deckId,
        ir: makeSlideIR(),
        metadata: { title: 'Second', type: 'content', narrative: '' },
      });

      expect(slide1.position).toBe(0);
      expect(slide2.position).toBe(1);
    });

    it('updates the deck slideIds', async () => {
      const deck = await deckService.createDeck({ soulId: approvedSoulId });
      const deckId = deck.id as string;

      const slide = await deckService.addSlide({
        deckId,
        ir: makeSlideIR(),
        metadata: { title: 'First', type: 'content', narrative: '' },
      });

      const updatedDeck = await deckStore.get(deck.id);
      expect(updatedDeck!.slideIds).toContain(slide.id);
    });

    it('throws DeckNotFoundError for non-existent deck', async () => {
      await expect(
        deckService.addSlide({
          deckId: 'non-existent',
          ir: makeSlideIR(),
          metadata: { title: 'Test', type: 'content', narrative: '' },
        }),
      ).rejects.toThrow(DeckNotFoundError);
    });

    it('creates a revision entry', async () => {
      const deck = await deckService.createDeck({ soulId: approvedSoulId });

      await deckService.addSlide({
        deckId: deck.id as string,
        ir: makeSlideIR(),
        metadata: { title: 'First', type: 'content', narrative: '' },
      });

      const revisions = await deckStore.getRevisions(deck.id);
      // First revision is deck_created, second is slide_added
      expect(revisions).toHaveLength(2);
      const slideRevision = revisions.find((r) => r.type === 'slide_added');
      expect(slideRevision).toBeDefined();
    });
  });

  describe('updateSlide', () => {
    it('updates slide IR and recompiles HTML', async () => {
      const deck = await deckService.createDeck({ soulId: approvedSoulId });
      const slide = await deckService.addSlide({
        deckId: deck.id as string,
        ir: makeSlideIR('original'),
        metadata: { title: 'Slide', type: 'content', narrative: '' },
      });

      const originalHtml = slide.html;
      const updated = await deckService.updateSlide({
        deckId: deck.id as string,
        slideId: slide.id as string,
        ir: { body: [{ type: 'hero', title: rt('updated heading') }] },
      });

      expect(updated.html).not.toBe(originalHtml);
      expect(updated.html).toContain('updated heading');
      expect(updated.ir).toBeDefined();
    });

    it('updates slide metadata', async () => {
      const deck = await deckService.createDeck({ soulId: approvedSoulId });
      const slide = await deckService.addSlide({
        deckId: deck.id as string,
        ir: makeSlideIR(),
        metadata: { title: 'Original Title', type: 'content', narrative: '' },
      });

      const updated = await deckService.updateSlide({
        deckId: deck.id as string,
        slideId: slide.id as string,
        metadata: { title: 'New Title' },
      });

      expect(updated.metadata.title).toBe('New Title');
    });

    it('throws DeckNotFoundError for non-existent deck', async () => {
      await expect(
        deckService.updateSlide({
          deckId: 'non-existent',
          slideId: 'slide-1',
        }),
      ).rejects.toThrow(DeckNotFoundError);
    });

    it('throws SlideNotFoundError for non-existent slide', async () => {
      const deck = await deckService.createDeck({ soulId: approvedSoulId });

      await expect(
        deckService.updateSlide({
          deckId: deck.id as string,
          slideId: 'non-existent',
        }),
      ).rejects.toThrow(SlideNotFoundError);
    });
  });

  describe('removeSlide', () => {
    it('removes a slide from a deck', async () => {
      const deck = await deckService.createDeck({ soulId: approvedSoulId });
      const slide = await deckService.addSlide({
        deckId: deck.id as string,
        ir: makeSlideIR(),
        metadata: { title: 'First', type: 'content', narrative: '' },
      });

      await deckService.removeSlide(deck.id as string, slide.id as string);

      const updatedDeck = await deckStore.get(deck.id);
      expect(updatedDeck!.slideIds).not.toContain(slide.id);
    });

    it('reindexes remaining slide positions after removal', async () => {
      const deck = await deckService.createDeck({ soulId: approvedSoulId });
      const deckId = deck.id as string;

      const slide1 = await deckService.addSlide({
        deckId,
        ir: makeSlideIR(),
        metadata: { title: 'First', type: 'content', narrative: '' },
      });
      const slide2 = await deckService.addSlide({
        deckId,
        ir: makeSlideIR(),
        metadata: { title: 'Second', type: 'content', narrative: '' },
      });
      const slide3 = await deckService.addSlide({
        deckId,
        ir: makeSlideIR(),
        metadata: { title: 'Third', type: 'content', narrative: '' },
      });

      // Remove the first slide
      await deckService.removeSlide(deckId, slide1.id as string);

      const s2 = await slideStore.get(slide2.id);
      const s3 = await slideStore.get(slide3.id);

      expect(s2!.position).toBe(0);
      expect(s3!.position).toBe(1);
    });

    it('throws DeckNotFoundError for non-existent deck', async () => {
      await expect(
        deckService.removeSlide('non-existent', 'slide-1'),
      ).rejects.toThrow(DeckNotFoundError);
    });

    it('throws SlideNotFoundError for non-existent slide', async () => {
      const deck = await deckService.createDeck({ soulId: approvedSoulId });

      await expect(
        deckService.removeSlide(deck.id as string, 'non-existent'),
      ).rejects.toThrow(SlideNotFoundError);
    });
  });

  describe('reorderSlides', () => {
    it('changes slide positions', async () => {
      const deck = await deckService.createDeck({ soulId: approvedSoulId });
      const deckId = deck.id as string;

      const slide1 = await deckService.addSlide({
        deckId,
        ir: makeSlideIR(),
        metadata: { title: 'First', type: 'content', narrative: '' },
      });
      const slide2 = await deckService.addSlide({
        deckId,
        ir: makeSlideIR(),
        metadata: { title: 'Second', type: 'content', narrative: '' },
      });

      // Reverse order
      const updated = await deckService.reorderSlides(deckId, [
        slide2.id as string,
        slide1.id as string,
      ]);

      expect(updated.slideIds[0]).toBe(slide2.id);
      expect(updated.slideIds[1]).toBe(slide1.id);

      // Check positions are updated in store
      const s1 = await slideStore.get(slide1.id);
      const s2 = await slideStore.get(slide2.id);
      expect(s2!.position).toBe(0);
      expect(s1!.position).toBe(1);
    });

    it('throws DeckNotFoundError for non-existent deck', async () => {
      await expect(
        deckService.reorderSlides('non-existent', []),
      ).rejects.toThrow(DeckNotFoundError);
    });
  });

  describe('getDeckSummary', () => {
    it('returns correct summary with slide info', async () => {
      const deck = await deckService.createDeck({
        soulId: approvedSoulId,
        title: 'Summary Test',
        author: 'Author',
      });
      const deckId = deck.id as string;

      await deckService.addSlide({
        deckId,
        ir: makeSlideIR(),
        metadata: { title: 'First Slide', type: 'title', narrative: 'Intro' },
      });
      await deckService.addSlide({
        deckId,
        ir: makeSlideIR(),
        metadata: { title: 'Second Slide', type: 'content', narrative: 'Main' },
      });

      const summary = await deckService.getDeckSummary(deckId);

      expect(summary.title).toBe('Summary Test');
      expect(summary.author).toBe('Author');
      expect(summary.slideCount).toBe(2);
      expect(summary.slides).toHaveLength(2);
      expect(summary.slides[0].title).toBe('First Slide');
      expect(summary.slides[0].type).toBe('title');
      expect(summary.slides[0].position).toBe(0);
      expect(summary.slides[0].isValid).toBe(false);
      expect(summary.slides[1].title).toBe('Second Slide');
      expect(summary.slides[1].position).toBe(1);
      expect(summary.slides[1].isValid).toBe(false);
      expect(summary.revisionCount).toBeGreaterThan(0);
    });

    it('throws DeckNotFoundError for non-existent deck', async () => {
      await expect(
        deckService.getDeckSummary('non-existent'),
      ).rejects.toThrow(DeckNotFoundError);
    });
  });
});
