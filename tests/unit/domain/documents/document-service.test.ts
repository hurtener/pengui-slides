import { describe, it, expect, beforeEach } from 'vitest';
import { DocumentService } from '../../../../src/domain/documents/document-service.js';
import { DeckService } from '../../../../src/domain/decks/deck-service.js';
import { InMemoryDeckStore } from '../../../../src/storage/memory/deck-store.js';
import { InMemorySlideStore } from '../../../../src/storage/memory/slide-store.js';
import { InMemorySectionStore } from '../../../../src/storage/memory/section-store.js';
import { InMemorySoulStore } from '../../../../src/storage/memory/soul-store.js';
import { FixedClock } from '../../../../src/infrastructure/clock.js';
import { Logger } from '../../../../src/infrastructure/logger.js';
import { SoulService } from '../../../../src/domain/souls/soul-service.js';
import { sampleSoulInput } from '../../../helpers/fixtures.js';
import {
  DeckNotFoundError,
  SectionNotFoundError,
  WrongAuthoringModelError,
} from '../../../../src/types/errors.js';

describe('DocumentService', () => {
  let documentService: DocumentService;
  let deckService: DeckService;
  let soulService: SoulService;
  let soulStore: InMemorySoulStore;
  let deckStore: InMemoryDeckStore;
  let slideStore: InMemorySlideStore;
  let sectionStore: InMemorySectionStore;
  let clock: FixedClock;
  let logger: Logger;
  let approvedSoulId: string;
  let documentDeckId: string;
  let slidesDeckId: string;

  beforeEach(async () => {
    soulStore = new InMemorySoulStore();
    deckStore = new InMemoryDeckStore();
    slideStore = new InMemorySlideStore();
    sectionStore = new InMemorySectionStore();
    clock = new FixedClock('2026-01-15T12:00:00.000Z');
    logger = new Logger('test', 'error');

    soulService = new SoulService(soulStore, slideStore, clock, logger);
    deckService = new DeckService(
      deckStore,
      slideStore,
      sectionStore,
      soulStore,
      clock,
      logger,
    );
    documentService = new DocumentService(deckStore, sectionStore, clock, logger);

    const soul = await soulService.register(sampleSoulInput);
    await soulService.approve(soul.id);
    approvedSoulId = soul.id as string;

    const docDeck = await deckService.createDeck({
      soulId: approvedSoulId,
      format: 'print_a4_portrait',
    });
    documentDeckId = docDeck.id as string;

    const slidesDeck = await deckService.createDeck({ soulId: approvedSoulId });
    slidesDeckId = slidesDeck.id as string;
  });

  // ── addSection ──────────────────────────────────────────────────

  describe('addSection', () => {
    it('appends a section to a document-mode deck', async () => {
      const section = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'prose',
        html: '<section class="pengui-section pengui-prose"><p>Hello</p></section>',
        metadata: { title: 'Intro', narrative: 'Intro narrative' },
      });

      expect(section.deckId).toBe(documentDeckId);
      expect(section.position).toBe(0);
      expect(section.kind).toBe('prose');
      expect(section.metadata.title).toBe('Intro');
    });

    it('auto-fills provenance metadata with metaVersion 3.0', async () => {
      const section = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'prose',
        html: '<section class="pengui-section pengui-prose"></section>',
        metadata: { title: 'S1', narrative: '' },
      });

      expect(section.metadata.generatedAt).toBe('2026-01-15T12:00:00.000Z');
      expect(section.metadata.soulId).toBe(approvedSoulId);
      expect(section.metadata.deckId).toBe(documentDeckId);
      expect(section.metadata.position).toBe(0);
      expect(section.metadata.metaVersion).toBe('3.0');
      expect(section.metadata.revisionHash).toBeDefined();
      expect(section.metadata.kind).toBe('prose');
    });

    it('increments position for subsequent sections', async () => {
      const s1 = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'prose',
        html: '<section class="pengui-section pengui-prose"></section>',
        metadata: { title: 'A', narrative: '' },
      });
      const s2 = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'figure',
        html: '<section class="pengui-section pengui-figure"></section>',
        metadata: { title: 'B', narrative: '' },
      });

      expect(s1.position).toBe(0);
      expect(s2.position).toBe(1);
    });

    it('inserts at requested position and reindexes following sections', async () => {
      const s1 = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'prose',
        html: '<section class="pengui-section pengui-prose"></section>',
        metadata: { title: 'A', narrative: '' },
      });
      const s2 = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'prose',
        html: '<section class="pengui-section pengui-prose"></section>',
        metadata: { title: 'B', narrative: '' },
      });

      const inserted = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'prose',
        html: '<section class="pengui-section pengui-prose"></section>',
        metadata: { title: 'Inserted', narrative: '' },
        position: 1,
      });

      expect(inserted.position).toBe(1);

      const after1 = await documentService.getSection(s1.id as string);
      const after2 = await documentService.getSection(s2.id as string);
      expect(after1.position).toBe(0);
      expect(after2.position).toBe(2);
      // provenance position in metadata follows
      expect(after2.metadata.position).toBe(2);
    });

    it('updates the deck sectionIds in order', async () => {
      const s1 = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'prose',
        html: '<section class="pengui-section pengui-prose"></section>',
        metadata: { title: 'A', narrative: '' },
      });
      const s2 = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'prose',
        html: '<section class="pengui-section pengui-prose"></section>',
        metadata: { title: 'B', narrative: '' },
      });

      const deck = await deckStore.get(s1.deckId);
      expect(deck!.sectionIds.map(String)).toEqual([
        s1.id as string,
        s2.id as string,
      ]);
    });

    it('records a section_added revision with sectionIdsSnapshot', async () => {
      const s1 = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'prose',
        html: '<section class="pengui-section pengui-prose"></section>',
        metadata: { title: 'A', narrative: '' },
      });
      const revisions = await deckStore.getRevisions(s1.deckId);
      // deck_created + section_added
      expect(revisions.map((r) => r.type)).toContain('section_added');
      const added = revisions.find((r) => r.type === 'section_added')!;
      expect(added.sectionIdsSnapshot?.map(String)).toEqual([s1.id as string]);
    });

    it('throws DeckNotFoundError for unknown deck', async () => {
      await expect(
        documentService.addSection({
          deckId: 'nope',
          kind: 'prose',
          html: '<section class="pengui-section pengui-prose"></section>',
          metadata: { title: '', narrative: '' },
        }),
      ).rejects.toThrow(DeckNotFoundError);
    });

    it('throws WrongAuthoringModelError on slides-mode decks', async () => {
      await expect(
        documentService.addSection({
          deckId: slidesDeckId,
          kind: 'prose',
          html: '<section class="pengui-section pengui-prose"></section>',
          metadata: { title: '', narrative: '' },
        }),
      ).rejects.toThrow(WrongAuthoringModelError);
    });

    it('WrongAuthoringModelError suggests add_slide on slides-mode decks', async () => {
      try {
        await documentService.addSection({
          deckId: slidesDeckId,
          kind: 'prose',
          html: '<section class="pengui-section pengui-prose"></section>',
          metadata: { title: '', narrative: '' },
        });
        expect.fail('expected WrongAuthoringModelError');
      } catch (err) {
        expect((err as Error).message).toContain('add_slide');
        expect((err as Error).message).toContain('print-mode');
      }
    });
  });

  // ── updateSection ───────────────────────────────────────────────

  describe('updateSection', () => {
    let sectionId: string;

    beforeEach(async () => {
      const s = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'prose',
        html: '<section class="pengui-section pengui-prose">old</section>',
        metadata: { title: 'Old', narrative: 'Old narrative' },
      });
      sectionId = s.id as string;
    });

    it('updates html and recomputes revisionHash', async () => {
      const before = await documentService.getSection(sectionId);
      const oldHash = before.metadata.revisionHash;

      const updated = await documentService.updateSection({
        deckId: documentDeckId,
        sectionId,
        html: '<section class="pengui-section pengui-prose">new</section>',
      });

      expect(updated.html).toContain('new');
      expect(updated.metadata.revisionHash).not.toBe(oldHash);
    });

    it('updates kind on both section and metadata', async () => {
      const updated = await documentService.updateSection({
        deckId: documentDeckId,
        sectionId,
        kind: 'callout',
      });
      expect(updated.kind).toBe('callout');
      expect(updated.metadata.kind).toBe('callout');
    });

    it('merges break hints', async () => {
      const updated = await documentService.updateSection({
        deckId: documentDeckId,
        sectionId,
        breakHints: { keepTogether: true, fullPage: true },
      });
      expect(updated.breakHints.keepTogether).toBe(true);
      expect(updated.breakHints.fullPage).toBe(true);
    });

    it('partial metadata updates preserve untouched fields', async () => {
      const updated = await documentService.updateSection({
        deckId: documentDeckId,
        sectionId,
        metadata: { title: 'New title' },
      });
      expect(updated.metadata.title).toBe('New title');
      expect(updated.metadata.narrative).toBe('Old narrative');
    });

    it('throws SectionNotFoundError for unknown section', async () => {
      await expect(
        documentService.updateSection({
          deckId: documentDeckId,
          sectionId: 'nope',
          html: '<section class="pengui-section pengui-prose"></section>',
        }),
      ).rejects.toThrow(SectionNotFoundError);
    });

    it('throws WrongAuthoringModelError on slides-mode decks', async () => {
      await expect(
        documentService.updateSection({
          deckId: slidesDeckId,
          sectionId,
          html: '<section class="pengui-section pengui-prose"></section>',
        }),
      ).rejects.toThrow(WrongAuthoringModelError);
    });
  });

  // ── getSection ──────────────────────────────────────────────────

  describe('getSection', () => {
    it('returns the stored section', async () => {
      const created = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'prose',
        html: '<section class="pengui-section pengui-prose">x</section>',
        metadata: { title: 'S', narrative: '' },
      });
      const fetched = await documentService.getSection(created.id as string);
      expect(fetched.id).toBe(created.id);
      expect(fetched.kind).toBe('prose');
    });

    it('throws SectionNotFoundError for unknown id', async () => {
      await expect(documentService.getSection('does-not-exist')).rejects.toThrow(
        SectionNotFoundError,
      );
    });
  });

  // ── removeSection ───────────────────────────────────────────────

  describe('removeSection', () => {
    it('removes the section and reindexes remaining sections', async () => {
      const s1 = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'prose',
        html: '<section class="pengui-section pengui-prose"></section>',
        metadata: { title: 'A', narrative: '' },
      });
      const s2 = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'prose',
        html: '<section class="pengui-section pengui-prose"></section>',
        metadata: { title: 'B', narrative: '' },
      });
      const s3 = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'prose',
        html: '<section class="pengui-section pengui-prose"></section>',
        metadata: { title: 'C', narrative: '' },
      });

      await documentService.removeSection(documentDeckId, s2.id as string);

      await expect(
        documentService.getSection(s2.id as string),
      ).rejects.toThrow(SectionNotFoundError);

      const after1 = await documentService.getSection(s1.id as string);
      const after3 = await documentService.getSection(s3.id as string);
      expect(after1.position).toBe(0);
      expect(after3.position).toBe(1);
      expect(after3.metadata.position).toBe(1);

      const deck = await deckStore.get(s1.deckId);
      expect(deck!.sectionIds.map(String)).toEqual([
        s1.id as string,
        s3.id as string,
      ]);
    });

    it('throws SectionNotFoundError when the section is not in the deck', async () => {
      await expect(
        documentService.removeSection(documentDeckId, 'ghost'),
      ).rejects.toThrow(SectionNotFoundError);
    });

    it('throws WrongAuthoringModelError on slides-mode decks', async () => {
      await expect(
        documentService.removeSection(slidesDeckId, 'any'),
      ).rejects.toThrow(WrongAuthoringModelError);
    });
  });

  // ── reorderSections ─────────────────────────────────────────────

  describe('reorderSections', () => {
    it('reorders and reindexes sections', async () => {
      const s1 = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'prose',
        html: '<section class="pengui-section pengui-prose"></section>',
        metadata: { title: 'A', narrative: '' },
      });
      const s2 = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'prose',
        html: '<section class="pengui-section pengui-prose"></section>',
        metadata: { title: 'B', narrative: '' },
      });
      const s3 = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'prose',
        html: '<section class="pengui-section pengui-prose"></section>',
        metadata: { title: 'C', narrative: '' },
      });

      const deck = await documentService.reorderSections(documentDeckId, [
        s3.id as string,
        s1.id as string,
        s2.id as string,
      ]);

      expect(deck.sectionIds.map(String)).toEqual([
        s3.id as string,
        s1.id as string,
        s2.id as string,
      ]);

      const after1 = await documentService.getSection(s1.id as string);
      const after2 = await documentService.getSection(s2.id as string);
      const after3 = await documentService.getSection(s3.id as string);
      expect(after3.position).toBe(0);
      expect(after1.position).toBe(1);
      expect(after2.position).toBe(2);
    });

    it('throws WrongAuthoringModelError on slides-mode decks', async () => {
      await expect(
        documentService.reorderSections(slidesDeckId, []),
      ).rejects.toThrow(WrongAuthoringModelError);
    });
  });

  // ── listSections ────────────────────────────────────────────────

  describe('listSections', () => {
    it('returns sections ordered by position', async () => {
      const s1 = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'prose',
        html: '<section class="pengui-section pengui-prose"></section>',
        metadata: { title: 'A', narrative: '' },
      });
      const s2 = await documentService.addSection({
        deckId: documentDeckId,
        kind: 'prose',
        html: '<section class="pengui-section pengui-prose"></section>',
        metadata: { title: 'B', narrative: '' },
      });

      const list = await documentService.listSections(documentDeckId);
      expect(list.map((s) => String(s.id))).toEqual([
        s1.id as string,
        s2.id as string,
      ]);
    });

    it('throws DeckNotFoundError for unknown deck', async () => {
      await expect(documentService.listSections('nope')).rejects.toThrow(
        DeckNotFoundError,
      );
    });
  });

  // ── updateDocumentMeta ──────────────────────────────────────────

  describe('updateDocumentMeta', () => {
    it('sets chrome, page margin, and toc from empty', async () => {
      const deck = await documentService.updateDocumentMeta(documentDeckId, {
        chrome: { runningTitle: 'My Book', pageNumber: true, footerAlign: 'right' },
        pageMargin: { top: '18mm', right: '15mm', bottom: '22mm', left: '15mm' },
        toc: { maxDepth: 2, includeKinds: ['chapter_header'] },
      });

      expect(deck.documentMeta?.chrome?.runningTitle).toBe('My Book');
      expect(deck.documentMeta?.pageMargin?.top).toBe('18mm');
      expect(deck.documentMeta?.toc?.includeKinds).toEqual(['chapter_header']);
    });

    it('merges new fields without clobbering existing ones', async () => {
      await documentService.updateDocumentMeta(documentDeckId, {
        chrome: { runningTitle: 'Original' },
      });
      const deck = await documentService.updateDocumentMeta(documentDeckId, {
        pageMargin: { top: '1mm', right: '2mm', bottom: '3mm', left: '4mm' },
      });
      expect(deck.documentMeta?.chrome?.runningTitle).toBe('Original');
      expect(deck.documentMeta?.pageMargin?.top).toBe('1mm');
    });

    it('records a document_meta_updated revision', async () => {
      await documentService.updateDocumentMeta(documentDeckId, {
        chrome: { runningTitle: 'x' },
      });
      const revisions = await deckStore.getRevisions(
        (await deckStore.get(
          (await deckStore.list()).find((d) => (d.id as string) === documentDeckId)!.id,
        ))!.id,
      );
      expect(revisions.map((r) => r.type)).toContain('document_meta_updated');
    });

    it('throws WrongAuthoringModelError on slides-mode decks', async () => {
      await expect(
        documentService.updateDocumentMeta(slidesDeckId, {
          chrome: { runningTitle: 'x' },
        }),
      ).rejects.toThrow(WrongAuthoringModelError);
    });
  });
});
