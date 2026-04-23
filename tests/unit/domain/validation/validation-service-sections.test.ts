import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationService } from '../../../../src/domain/validation/validation-service.js';
import { SoulService } from '../../../../src/domain/souls/soul-service.js';
import { InMemorySoulStore } from '../../../../src/storage/memory/soul-store.js';
import { InMemorySlideStore } from '../../../../src/storage/memory/slide-store.js';
import { FixedClock } from '../../../../src/infrastructure/clock.js';
import { Logger } from '../../../../src/infrastructure/logger.js';
import { defaultConfig } from '../../../../src/config.js';
import { sampleSoulInput } from '../../../helpers/fixtures.js';
import type { Section } from '../../../../src/types/section.js';
import type { Deck } from '../../../../src/types/deck.js';
import type {
  DeckId,
  SectionId,
  SoulId,
} from '../../../../src/types/common.js';

function makeSection(overrides: Partial<Section> = {}): Section {
  return {
    id: 'sec-1' as SectionId,
    deckId: 'deck-1' as DeckId,
    position: 0,
    kind: 'prose',
    html: `<!-- @section-meta {"title":"Intro","kind":"prose","narrative":"A friendly intro."} -->\n<section class="pengui-section pengui-prose"><h2>Hello</h2><p>World.</p></section>`,
    breakHints: {},
    metadata: {
      title: 'Intro',
      kind: 'prose',
      narrative: 'n',
      generatedAt: '2026-04-23T12:00:00.000Z',
      soulId: 'soul-1',
      deckId: 'deck-1',
      position: 0,
      metaVersion: '3.0',
      revisionHash: 'hash',
    },
    createdAt: '2026-04-23T12:00:00.000Z',
    updatedAt: '2026-04-23T12:00:00.000Z',
    ...overrides,
  };
}

function makeDeck(sectionIds: string[] = []): Deck {
  return {
    id: 'deck-1' as DeckId,
    soulId: 'soul-1' as SoulId,
    title: 'Test Doc',
    author: 'Tester',
    slideIds: [],
    sectionIds: sectionIds as SectionId[],
    format: 'print_a4_portrait',
    authoringModel: 'document',
    createdAt: '2026-04-23T12:00:00.000Z',
    updatedAt: '2026-04-23T12:00:00.000Z',
  };
}

describe('ValidationService — section / document paths', () => {
  let validation: ValidationService;
  let soulStore: InMemorySoulStore;
  let approvedSoulId: SoulId;

  beforeEach(async () => {
    soulStore = new InMemorySoulStore();
    const slideStore = new InMemorySlideStore();
    const clock = new FixedClock('2026-04-23T12:00:00.000Z');
    const logger = new Logger('test', 'error');
    const soulService = new SoulService(soulStore, slideStore, clock, logger);
    validation = new ValidationService(soulStore, defaultConfig, logger);

    const registered = await soulService.register(sampleSoulInput);
    const approved = await soulService.approve(registered.id);
    approvedSoulId = approved.soul.id;
  });

  describe('validateSection', () => {
    it('passes a clean prose section', async () => {
      const result = await validation.validateSection(
        makeSection(),
        approvedSoulId,
        'print_a4_portrait',
      );
      expect(result.passed).toBe(true);
      expect(result.errorCount).toBe(0);
      expect(result.stage2Skipped).toBe(true);
    });

    it('flags a DOCTYPE inside a fragment', async () => {
      const bad = makeSection({
        html: `<!DOCTYPE html><!-- @section-meta {"title":"T","kind":"prose","narrative":""} -->\n<section class="pengui-section pengui-prose"><p>x</p></section>`,
      });
      const result = await validation.validateSection(bad, approvedSoulId, 'print_a4_portrait');
      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.rule === 'section-structural')).toBe(true);
    });

    it('flags a figure section missing <figure>', async () => {
      const bad = makeSection({
        kind: 'figure',
        html: `<!-- @section-meta {"title":"Fig","kind":"figure","narrative":""} -->\n<section class="pengui-section pengui-figure"><div class="pengui-figure">no figure tag</div></section>`,
      });
      const result = await validation.validateSection(bad, approvedSoulId, 'print_a4_portrait');
      expect(result.passed).toBe(false);
      expect(result.issues.some((i) => i.rule === 'section-figure-shape')).toBe(true);
    });
  });

  describe('validateDocument (lint depth only)', () => {
    it('aggregates section issues across the deck with sec-N prefixes', async () => {
      const sections = [
        makeSection({ id: 's1' as SectionId, position: 0, kind: 'prose' }),
        // Second section has a DOCTYPE - should be flagged
        makeSection({
          id: 's2' as SectionId,
          position: 1,
          kind: 'prose',
          html: `<!DOCTYPE html><!-- @section-meta {"title":"T","kind":"prose","narrative":""} -->\n<section class="pengui-section pengui-prose"><p>x</p></section>`,
        }),
      ];
      const deck = makeDeck(sections.map((s) => s.id as string));
      const result = await validation.validateDocument(deck, sections, approvedSoulId, 'lint');

      expect(result.stage2Skipped).toBe(true);
      expect(result.passed).toBe(false);
      // The bad section is position 1 → "sec-2:" prefix.
      expect(result.issues.some((i) => i.id.startsWith('sec-2:'))).toBe(true);
      // The good section (sec-1) should have no issues prefixed with its id.
      expect(result.issues.every((i) => !i.id.startsWith('sec-1:'))).toBe(true);
    });

    it('returns passed=true for a clean document', async () => {
      const deck = makeDeck(['s1']);
      const result = await validation.validateDocument(
        deck,
        [makeSection({ id: 's1' as SectionId, position: 0 })],
        approvedSoulId,
        'lint',
      );
      expect(result.passed).toBe(true);
    });
  });
});
