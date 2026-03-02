import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationService } from '../../../../src/domain/validation/validation-service.js';
import { InMemorySoulStore } from '../../../../src/storage/memory/soul-store.js';
import { InMemorySlideStore } from '../../../../src/storage/memory/slide-store.js';
import { Logger } from '../../../../src/infrastructure/logger.js';
import { defaultConfig } from '../../../../src/config.js';
import { SoulService } from '../../../../src/domain/souls/soul-service.js';
import { FixedClock } from '../../../../src/infrastructure/clock.js';
import { sampleSoulInput, makeValidSlideHtml } from '../../../helpers/fixtures.js';
import { SoulNotFoundError } from '../../../../src/types/errors.js';
import type { SoulId } from '../../../../src/types/common.js';

describe('ValidationService', () => {
  let validationService: ValidationService;
  let soulStore: InMemorySoulStore;
  let soulId: SoulId;

  beforeEach(async () => {
    soulStore = new InMemorySoulStore();
    const clock = new FixedClock('2026-01-15T12:00:00.000Z');
    const logger = new Logger('test', 'error');

    const slideStore = new InMemorySlideStore();
    const soulService = new SoulService(soulStore, slideStore, clock, logger);
    const soul = await soulService.register(sampleSoulInput);
    await soulService.approve(soul.id);
    soulId = soul.id;

    validationService = new ValidationService(soulStore, defaultConfig, logger);
  });

  it('validates slide HTML in lint-only mode', async () => {
    const html = makeValidSlideHtml('Test content');
    const result = await validationService.validateSlide(html, soulId, 'lint');

    expect(result).toBeDefined();
    expect(result.stage2Skipped).toBe(true);
    expect(result.stage1ElapsedMs).toBeGreaterThanOrEqual(0);
    expect(result.validatedAt).toBeDefined();
  });

  it('computes style score', async () => {
    const html = makeValidSlideHtml('Test content');
    const result = await validationService.validateSlide(html, soulId, 'lint');

    expect(result.styleScore).toBeDefined();
    expect(result.styleScore.overall).toBeGreaterThanOrEqual(0);
    expect(result.styleScore.overall).toBeLessThanOrEqual(1);
    expect(result.styleScore.tokenCompliance).toBeGreaterThanOrEqual(0);
    expect(result.styleScore.typographyConsistency).toBeGreaterThanOrEqual(0);
    expect(result.styleScore.spacingConsistency).toBeGreaterThanOrEqual(0);
    expect(result.styleScore.contrastAccessibility).toBeGreaterThanOrEqual(0);
    expect(result.styleScore.structuralIntegrity).toBeGreaterThanOrEqual(0);
  });

  it('returns proper issue counts', async () => {
    const html = makeValidSlideHtml('Test');
    const result = await validationService.validateSlide(html, soulId, 'lint');

    expect(typeof result.errorCount).toBe('number');
    expect(typeof result.warningCount).toBe('number');
    expect(typeof result.infoCount).toBe('number');

    // Total issues should match counts
    const totalByCount = result.errorCount + result.warningCount + result.infoCount;
    expect(result.issues.length).toBe(totalByCount);
  });

  it('passed is true when no errors', async () => {
    const html = makeValidSlideHtml('No issues');
    const result = await validationService.validateSlide(html, soulId, 'lint');

    if (result.errorCount === 0) {
      expect(result.passed).toBe(true);
    }
  });

  it('passed is false when there are errors', async () => {
    // HTML with literal color (error) and missing DOCTYPE and missing slide-meta
    const badHtml = '<style>.slide { color: #ff0000; }</style><div class="content">bad</div>';
    const result = await validationService.validateSlide(badHtml, soulId, 'lint');

    expect(result.passed).toBe(false);
    expect(result.errorCount).toBeGreaterThan(0);
  });

  it('throws SoulNotFoundError for non-existent soul', async () => {
    await expect(
      validationService.validateSlide('<div>test</div>', 'non-existent' as SoulId, 'lint'),
    ).rejects.toThrow(SoulNotFoundError);
  });

  it('deducts from style score based on error severity', async () => {
    // HTML with multiple issues
    const badHtml = `<!DOCTYPE html>
<html>
<head><style>
  .other { color: #ff0000; background: #00ff00; }
</style></head>
<body>
  <!-- @slide-meta {"title":"Bad"} -->
  <div class="slide"><p>Bad</p></div>
</body>
</html>`;

    const result = await validationService.validateSlide(badHtml, soulId, 'lint');

    // Score should be less than perfect due to issues
    expect(result.styleScore.overall).toBeLessThan(1);
  });
});
