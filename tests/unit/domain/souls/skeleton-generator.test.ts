import { describe, it, expect } from 'vitest';
import { SkeletonGenerator } from '../../../../src/domain/souls/skeleton-generator.js';
import { FixedClock } from '../../../../src/infrastructure/clock.js';
import type { SoulId } from '../../../../src/types/common.js';
import type { SkeletonTemplateType } from '../../../../src/types/design-soul.js';

describe('SkeletonGenerator', () => {
  const generator = new SkeletonGenerator();
  const soulId = 'soul-test' as SoulId;
  const cssTokens = ':root { --color-canvas: #fff; }';
  const clock = new FixedClock('2026-01-15T12:00:00.000Z');

  it('generates exactly 6 skeleton templates', () => {
    const skeletons = generator.generateAll(soulId, cssTokens, clock);
    expect(skeletons).toHaveLength(6);
  });

  it('generates all expected template types', () => {
    const skeletons = generator.generateAll(soulId, cssTokens, clock);
    const types = skeletons.map((s) => s.type);

    const expectedTypes: SkeletonTemplateType[] = [
      'title-slide',
      'two-column',
      'metrics',
      'features-grid',
      'closing-cta',
      'blank-themed',
    ];

    for (const expectedType of expectedTypes) {
      expect(types).toContain(expectedType);
    }
  });

  it('each skeleton has a unique ID', () => {
    const skeletons = generator.generateAll(soulId, cssTokens, clock);
    const ids = skeletons.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(6);
  });

  it('each skeleton references the correct soulId', () => {
    const skeletons = generator.generateAll(soulId, cssTokens, clock);
    for (const skeleton of skeletons) {
      expect(skeleton.soulId).toBe(soulId);
    }
  });

  it('each skeleton has a non-empty name and description', () => {
    const skeletons = generator.generateAll(soulId, cssTokens, clock);
    for (const skeleton of skeletons) {
      expect(skeleton.name.length).toBeGreaterThan(0);
      expect(skeleton.description.length).toBeGreaterThan(0);
    }
  });

  it('each skeleton has non-empty HTML', () => {
    const skeletons = generator.generateAll(soulId, cssTokens, clock);
    for (const skeleton of skeletons) {
      expect(skeleton.html.length).toBeGreaterThan(0);
    }
  });

  it('each skeleton HTML includes the CSS tokens', () => {
    const skeletons = generator.generateAll(soulId, cssTokens, clock);
    for (const skeleton of skeletons) {
      expect(skeleton.html).toContain(cssTokens);
    }
  });

  it('each skeleton HTML is a complete HTML document', () => {
    const skeletons = generator.generateAll(soulId, cssTokens, clock);
    for (const skeleton of skeletons) {
      expect(skeleton.html).toContain('<!DOCTYPE html>');
      expect(skeleton.html).toContain('<html');
      expect(skeleton.html).toContain('<head>');
      expect(skeleton.html).toContain('<body>');
      expect(skeleton.html).toContain('<div class="slide">');
    }
  });

  it('each skeleton HTML includes the @slide-meta placeholder', () => {
    const skeletons = generator.generateAll(soulId, cssTokens, clock);
    for (const skeleton of skeletons) {
      expect(skeleton.html).toContain('<!-- @slide-meta -->');
    }
  });

  it('each skeleton uses the clock timestamp for createdAt', () => {
    const skeletons = generator.generateAll(soulId, cssTokens, clock);
    for (const skeleton of skeletons) {
      expect(skeleton.createdAt).toBe('2026-01-15T12:00:00.000Z');
    }
  });

  it('title-slide skeleton contains title and subtitle slots', () => {
    const skeletons = generator.generateAll(soulId, cssTokens, clock);
    const titleSlide = skeletons.find((s) => s.type === 'title-slide');
    expect(titleSlide).toBeDefined();
    expect(titleSlide!.html).toContain('@slot:title');
    expect(titleSlide!.html).toContain('@slot:subtitle');
  });

  it('metrics skeleton contains metric card elements', () => {
    const skeletons = generator.generateAll(soulId, cssTokens, clock);
    const metrics = skeletons.find((s) => s.type === 'metrics');
    expect(metrics).toBeDefined();
    expect(metrics!.html).toContain('metric-card');
    expect(metrics!.html).toContain('metric-number');
  });
});
