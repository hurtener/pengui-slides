/**
 * Integration test: print deck pipeline.
 *
 * Verifies that creating a print_a4_portrait deck threads A4 geometry
 * through the deck summary and validation pipeline end-to-end.
 * Stage 2 (Playwright) is not exercised — lint depth is sufficient.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeckService } from '../../../src/domain/decks/deck-service.js';
import { ValidationService } from '../../../src/domain/validation/validation-service.js';
import { Stage1Runner } from '../../../src/domain/validation/stage1/stage1-runner.js';
import { InMemoryDeckStore } from '../../../src/storage/memory/deck-store.js';
import { InMemorySlideStore } from '../../../src/storage/memory/slide-store.js';
import { InMemorySectionStore } from '../../../src/storage/memory/section-store.js';
import { InMemorySoulStore } from '../../../src/storage/memory/soul-store.js';
import { FixedClock } from '../../../src/infrastructure/clock.js';
import { Logger } from '../../../src/infrastructure/logger.js';
import { SoulService } from '../../../src/domain/souls/soul-service.js';
import { sampleSoulInput } from '../../helpers/fixtures.js';
import { FORMAT_REGISTRY } from '../../../src/domain/formats/format-registry.js';
import type { SoulId } from '../../../src/types/common.js';
import { defaultConfig } from '../../../src/config.js';

/** Minimal valid A4 slide HTML — uses correct canvas dimensions and safe-area token. */
function makeA4SlideHtml(content: string = 'Hello Print World'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    :root {
      --color-canvas: #ffffff;
      --color-text-primary: #212529;
      --font-body: 'Inter', sans-serif;
      --text-body: 12px;
      --space-safe-area: 96px;
      --weight-normal: 400;
      --line-height-body: 1.55;
      --letter-spacing-body: 0em;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    .slide {
      width: 1240px;
      height: 1754px;
      padding: var(--space-safe-area);
      background: var(--color-canvas);
      color: var(--color-text-primary);
      font-family: var(--font-body);
      font-size: var(--text-body);
    }
  </style>
</head>
<body>
  <!-- @slide-meta {"title":"Cover","type":"cover","narrative":"Intro page."} -->
  <div class="slide">
    <p>${content}</p>
  </div>
</body>
</html>`;
}

describe('print deck pipeline', () => {
  let deckService: DeckService;
  let validationService: ValidationService;
  let approvedSoulId: string;
  let approvedSoulIdTyped: SoulId;

  beforeEach(async () => {
    const soulStore = new InMemorySoulStore();
    const deckStore = new InMemoryDeckStore();
    const slideStore = new InMemorySlideStore();
    const sectionStore = new InMemorySectionStore();
    const clock = new FixedClock('2026-04-22T12:00:00.000Z');
    const logger = new Logger('test', 'error');

    const soulService = new SoulService(soulStore, slideStore, clock, logger);
    deckService = new DeckService(
      deckStore,
      slideStore,
      sectionStore,
      soulStore,
      soulService,
      clock,
      logger,
    );
    validationService = new ValidationService(soulStore, defaultConfig, logger);

    const soul = await soulService.register(sampleSoulInput);
    await soulService.approve(soul.id);
    approvedSoulId = soul.id as string;
    approvedSoulIdTyped = soul.id;
  });

  describe('createDeck with print_a4_portrait', () => {
    it('stores the format on the deck', async () => {
      const deck = await deckService.createDeck({
        soulId: approvedSoulId,
        title: 'A4 Study Guide',
        format: 'print_a4_portrait',
      });

      expect(deck.format).toBe('print_a4_portrait');
    });

    it('returns print_a4_portrait in getDeckSummary', async () => {
      const deck = await deckService.createDeck({
        soulId: approvedSoulId,
        format: 'print_a4_portrait',
      });

      const summary = await deckService.getDeckSummary(deck.id as string);
      expect(summary.format).toBe('print_a4_portrait');
    });

    it('getDeckFormat returns print_a4_portrait', async () => {
      const deck = await deckService.createDeck({
        soulId: approvedSoulId,
        format: 'print_a4_portrait',
      });

      const kind = await deckService.getDeckFormat(deck.id as string);
      expect(kind).toBe('print_a4_portrait');
    });
  });

  describe('create_deck with default format', () => {
    it('defaults to slides_16_9 when format is omitted', async () => {
      const deck = await deckService.createDeck({ soulId: approvedSoulId });
      expect(deck.format).toBe('slides_16_9');
    });

    it('getDeckSummary returns slides_16_9 by default', async () => {
      const deck = await deckService.createDeck({ soulId: approvedSoulId });
      const summary = await deckService.getDeckSummary(deck.id as string);
      expect(summary.format).toBe('slides_16_9');
    });
  });

  describe('validateSlide receives print_a4_portrait geometry', () => {
    it('passes A4 geometry to Stage1Runner when format is print_a4_portrait', async () => {
      const a4Geometry = FORMAT_REGISTRY.print_a4_portrait.geometry;
      const runSpy = vi.spyOn(Stage1Runner.prototype, 'run');

      const html = makeA4SlideHtml('Test content');
      await validationService.validateSlide(html, approvedSoulIdTyped, 'lint', 'print_a4_portrait');

      expect(runSpy).toHaveBeenCalledOnce();
      const [, , , context] = runSpy.mock.calls[0];
      expect(context?.geometry).toEqual(a4Geometry);

      runSpy.mockRestore();
    });

    it('passes slides_16_9 geometry to Stage1Runner when format is omitted', async () => {
      const slideGeometry = FORMAT_REGISTRY.slides_16_9.geometry;
      const runSpy = vi.spyOn(Stage1Runner.prototype, 'run');

      const html = makeA4SlideHtml('Slide content');
      await validationService.validateSlide(html, approvedSoulIdTyped, 'lint');

      expect(runSpy).toHaveBeenCalledOnce();
      const [, , , context] = runSpy.mock.calls[0];
      expect(context?.geometry).toEqual(slideGeometry);

      runSpy.mockRestore();
    });

    it('A4 validation detects correct canvas dimensions in issues', async () => {
      const htmlWithWrongDimensions = `<!DOCTYPE html>
<html lang="en">
<head>
  <style>
    :root { --space-safe-area: 96px; }
    .slide {
      width: 1920px;
      height: 1080px;
      padding: var(--space-safe-area);
    }
  </style>
</head>
<body>
  <!-- @slide-meta {"title":"Test","type":"cover","narrative":""} -->
  <div class="slide"><p>Content</p></div>
</body>
</html>`;

      const result = await validationService.validateSlide(
        htmlWithWrongDimensions,
        approvedSoulIdTyped,
        'lint',
        'print_a4_portrait',
      );

      const dimensionIssues = result.issues.filter(
        (i) => i.rule === 'safe-area-check' && (i.id.includes('width') || i.id.includes('height')),
      );
      expect(dimensionIssues.length).toBeGreaterThan(0);
      const hasMismatch = dimensionIssues.some(
        (i) => i.expected === '1240px' || i.expected === '1754px',
      );
      expect(hasMismatch).toBe(true);
    });

    it('valid A4 HTML passes dimension checks', async () => {
      const html = makeA4SlideHtml('Good A4 content');
      const result = await validationService.validateSlide(html, approvedSoulIdTyped, 'lint', 'print_a4_portrait');

      const dimensionErrors = result.issues.filter(
        (i) => i.rule === 'safe-area-check' && (i.id.includes('width-mismatch') || i.id.includes('height-mismatch')),
      );
      expect(dimensionErrors).toHaveLength(0);
    });
  });
});
