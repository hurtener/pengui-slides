import { describe, it, expect } from 'vitest';
import { generateStyleGuide } from '../../../../src/domain/souls/style-guide-generator.js';
import { sampleLayers } from '../../../helpers/fixtures.js';
import { generateTokens } from '../../../../src/domain/souls/token-generator.js';

describe('generateStyleGuide', () => {
  const { tokenNames } = generateTokens(sampleLayers);
  const guide = generateStyleGuide(sampleLayers, tokenNames);

  it('returns a non-empty string', () => {
    expect(guide.length).toBeGreaterThan(0);
  });

  it('contains token quick reference section', () => {
    expect(guide).toContain('Token');
    expect(guide).toContain('var(--');
  });

  it('contains layout patterns section', () => {
    expect(guide).toContain('Layout');
    expect(guide).toContain('Title');
  });

  it('contains typography hierarchy section', () => {
    expect(guide).toContain('Typography');
    expect(guide).toContain(`${sampleLayers.typography.sizeHero}`);
  });

  it('contains color usage section', () => {
    expect(guide).toContain('Color');
    expect(guide).toContain(sampleLayers.color.canvas);
    expect(guide).toContain(sampleLayers.color.accentPrimary);
  });

  it('contains visual flourishes section', () => {
    expect(guide).toContain('glass');
  });

  it('contains do/don\'t rules', () => {
    for (const rule of sampleLayers.motion.doRules) {
      expect(guide).toContain(rule);
    }
    for (const rule of sampleLayers.motion.dontRules) {
      expect(guide).toContain(rule);
    }
  });

  it('contains component patterns section', () => {
    expect(guide).toContain('Component');
    expect(guide).toContain('Card');
  });

  it('references actual font families from layers', () => {
    expect(guide).toContain('Inter');
  });

  it('references token names', () => {
    expect(guide).toContain('--color-canvas');
    expect(guide).toContain('--font-display');
  });
});
