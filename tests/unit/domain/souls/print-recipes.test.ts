import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RecipeGenerator } from '../../../../src/domain/souls/recipe-generator.js';
import { generateTokens } from '../../../../src/domain/souls/token-generator.js';
import { FixedClock } from '../../../../src/infrastructure/clock.js';
import type { SoulId } from '../../../../src/types/common.js';
import { sampleLayers } from '../../../helpers/fixtures.js';

// ── Helpers ──────────────────────────────────────────────────────

const TEMPLATES_PRINT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../templates/print',
);

/**
 * Minimal cheerio-free checks: parse an HTML string for a pattern.
 * Uses regex to avoid adding a test-only dependency.
 */
function hasDoctypeDecl(html: string): boolean {
  return /<!DOCTYPE\s+html/i.test(html);
}

function hasSlideMetaComment(html: string): boolean {
  return /<!--\s*@slide-meta\s/.test(html);
}

function parseSlideMetaJson(html: string): Record<string, unknown> | null {
  const match = html.match(/<!--\s*@slide-meta\s+(\{[\s\S]*?\})\s*-->/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function hasRootSlideContainer(html: string): boolean {
  // Must contain a div with class="slide"
  return /<div\s[^>]*class="[^"]*\bslide\b[^"]*"/.test(html);
}

function hasWidth1240(html: string): boolean {
  return /width:\s*1240px/.test(html);
}

function hasHeight1754(html: string): boolean {
  return /height:\s*1754px/.test(html);
}

/**
 * Check that the CSS sections contain no literal hex colors in STYLING rules.
 *
 * Token declaration lines (e.g. `--color-canvas: #ffffff`) are exempt — those
 * are the soul's raw values, not styling. Only CSS property assignments that are
 * not custom property declarations are checked.
 *
 * Extracts the contents of <style> tags and scans for hex in non-token lines.
 */
function cssHasNoLiteralHex(html: string): boolean {
  // Extract all <style> block content
  const styleMatches = html.match(/<style[\s\S]*?>([\s\S]*?)<\/style>/gi);
  if (!styleMatches) return true;

  for (const block of styleMatches) {
    // Strip CSS comments
    const noComments = block.replace(/\/\*[\s\S]*?\*\//g, '');
    const lines = noComments.split('\n');
    for (const line of lines) {
      // Skip custom property declarations — these are token definitions, not styling
      if (/^\s*--[\w-]+\s*:/.test(line)) continue;
      // Check for literal hex colour in non-token lines
      if (/#[0-9a-fA-F]{3,8}\b/.test(line)) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Check that CSS sections contain no literal px values except in
 * permitted geometry contexts: width/height on .slide, viewBox attributes,
 * and SVG transform attributes.
 */
function cssHasNoForbiddenLiteralPx(html: string): boolean {
  const styleMatches = html.match(/<style[\s\S]*?>([\s\S]*?)<\/style>/gi);
  if (!styleMatches) return true;

  for (const block of styleMatches) {
    const noComments = block.replace(/\/\*[\s\S]*?\*\//g, '');
    // Split by lines for context-aware checking
    const lines = noComments.split('\n');
    for (const line of lines) {
      // Skip the .slide width/height lines (these are geometry, not styling)
      if (/width:\s*1240px/.test(line)) continue;
      if (/height:\s*1754px/.test(line)) continue;
      // Allow any remaining literal px if it's a known print token value
      // (the print-scope block itself contains literal px values — that's expected)
      // We only care about px values that reference literal distances in the
      // template's own CSS rules (not the injected token declarations).
      // The sentinel :root block is empty so nothing to check there.
      // Detect literal px in CSS property values (not inside var(...))
      const literalPxMatch = line.match(/:\s*\d+px(?!\s*\))/);
      if (literalPxMatch) {
        // Allow it only if it's part of the token declarations block
        // (token declarations look like: --token-name: NNpx;)
        if (/^\s*--[\w-]+:\s*\d+px/.test(line)) continue;
        // Allow stroke-width numeric (not a CSS length token context)
        if (/stroke-width:\s*\d+/.test(line)) continue;
        return false;
      }
    }
  }
  return true;
}

// ── Test setup ───────────────────────────────────────────────────

const generator = new RecipeGenerator();
const soulId = 'soul-print-test' as SoulId;
const { cssString: cssTokens } = generateTokens(sampleLayers);
const clock = new FixedClock('2026-04-22T10:00:00.000Z');

describe('RecipeGenerator.generatePrintAll', () => {
  it('generates exactly 11 print recipes', () => {
    const recipes = generator.generatePrintAll(soulId, cssTokens, clock);
    expect(recipes).toHaveLength(11);
  });

  it('generates all expected print recipe types', () => {
    const recipes = generator.generatePrintAll(soulId, cssTokens, clock);
    const types = recipes.map((r) => r.type);

    const expectedTypes = [
      'cover',
      'toc',
      'chapter_intro',
      'content',
      'content_chart',
      'content_diagram',
      'compare',
      'glossary',
      'timeline',
      'summary',
      'bibliography',
    ];

    for (const expectedType of expectedTypes) {
      expect(types).toContain(expectedType);
    }
  });

  it('each recipe has a unique ID', () => {
    const recipes = generator.generatePrintAll(soulId, cssTokens, clock);
    const ids = recipes.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(11);
  });

  it('each recipe references the correct soulId', () => {
    const recipes = generator.generatePrintAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(recipe.soulId).toBe(soulId);
    }
  });

  it('each recipe has source "built-in"', () => {
    const recipes = generator.generatePrintAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(recipe.source).toBe('built-in');
    }
  });

  it('each recipe uses the clock timestamp for createdAt', () => {
    const recipes = generator.generatePrintAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(recipe.createdAt).toBe('2026-04-22T10:00:00.000Z');
    }
  });

  it('each recipe has non-empty name, description, and tags', () => {
    const recipes = generator.generatePrintAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(recipe.name.length).toBeGreaterThan(0);
      expect(recipe.description.length).toBeGreaterThan(0);
      expect(recipe.tags.length).toBeGreaterThan(0);
    }
  });

  it('each recipe HTML is a complete HTML document with DOCTYPE', () => {
    const recipes = generator.generatePrintAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(hasDoctypeDecl(recipe.html)).toBe(true);
    }
  });

  it('each recipe HTML contains the @slide-meta comment', () => {
    const recipes = generator.generatePrintAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(hasSlideMetaComment(recipe.html)).toBe(true);
    }
  });

  it('each recipe @slide-meta parses as valid JSON with required fields', () => {
    const recipes = generator.generatePrintAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      const meta = parseSlideMetaJson(recipe.html);
      expect(meta).not.toBeNull();
      expect(typeof meta?.title).toBe('string');
      expect(typeof meta?.type).toBe('string');
      expect(typeof meta?.narrative).toBe('string');
      expect(Array.isArray(meta?.tags)).toBe(true);
    }
  });

  it('each recipe @slide-meta type matches the recipe spec type', () => {
    const recipes = generator.generatePrintAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      const meta = parseSlideMetaJson(recipe.html);
      expect(meta?.type).toBe(recipe.type);
    }
  });

  it('each recipe HTML contains a root .slide container', () => {
    const recipes = generator.generatePrintAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(hasRootSlideContainer(recipe.html)).toBe(true);
    }
  });

  it('each recipe .slide container has width: 1240px', () => {
    const recipes = generator.generatePrintAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(hasWidth1240(recipe.html)).toBe(true);
    }
  });

  it('each recipe .slide container has height: 1754px', () => {
    const recipes = generator.generatePrintAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(hasHeight1754(recipe.html)).toBe(true);
    }
  });

  it('each recipe CSS contains no literal hex color values', () => {
    const recipes = generator.generatePrintAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(cssHasNoLiteralHex(recipe.html)).toBe(true);
    }
  });

  it('each recipe HTML contains the injected CSS tokens', () => {
    const recipes = generator.generatePrintAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      // After injection, the token block should be present
      expect(recipe.html).toContain('--color-canvas');
      expect(recipe.html).toContain('--color-accent-primary');
    }
  });

  it('each recipe HTML contains the print-scope override block', () => {
    const recipes = generator.generatePrintAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(recipe.html).toContain('[data-pengui-medium="print"]');
    }
  });

  it('each recipe HTML has data-pengui-medium="print" on the html element', () => {
    const recipes = generator.generatePrintAll(soulId, cssTokens, clock);
    for (const recipe of recipes) {
      expect(recipe.html).toContain('data-pengui-medium="print"');
    }
  });

  it('generating print recipes does not affect slide recipes', () => {
    const slideRecipes = generator.generateAll(soulId, cssTokens, clock);
    const printRecipes = generator.generatePrintAll(soulId, cssTokens, clock);
    // Slide recipes still have the old count
    expect(slideRecipes).toHaveLength(6);
    expect(printRecipes).toHaveLength(11);
    // Slide HTML element should NOT carry the data-pengui-medium attribute on <html>
    // (the CSS block may reference it as a selector, which is fine)
    for (const r of slideRecipes) {
      expect(r.html).not.toContain('<html lang="en" data-pengui-medium="print">');
      expect(r.html).toContain('<html lang="en">');
    }
  });
});

// ── Template file checks ─────────────────────────────────────────

describe('Print template source files', () => {
  const templateFiles = [
    'cover.html',
    'toc.html',
    'chapter-intro.html',
    'content.html',
    'content-chart.html',
    'content-diagram.html',
    'compare.html',
    'glossary.html',
    'timeline.html',
    'summary.html',
    'bibliography.html',
  ];

  it('all 11 template files exist in templates/print/', () => {
    for (const filename of templateFiles) {
      const fullPath = path.join(TEMPLATES_PRINT_DIR, filename);
      expect(fs.existsSync(fullPath), `Missing: ${filename}`).toBe(true);
    }
  });

  it('each template file contains the @slide-meta comment with JSON', () => {
    for (const filename of templateFiles) {
      const html = fs.readFileSync(path.join(TEMPLATES_PRINT_DIR, filename), 'utf-8');
      const meta = parseSlideMetaJson(html);
      expect(meta, `${filename}: @slide-meta JSON missing or invalid`).not.toBeNull();
      expect(typeof meta?.title, `${filename}: title missing`).toBe('string');
      expect(typeof meta?.type, `${filename}: type missing`).toBe('string');
      expect(typeof meta?.narrative, `${filename}: narrative missing`).toBe('string');
    }
  });

  it('each template has the injection sentinel :root block', () => {
    for (const filename of templateFiles) {
      const html = fs.readFileSync(path.join(TEMPLATES_PRINT_DIR, filename), 'utf-8');
      expect(
        html.includes('/* Soul tokens are injected here by the recipe generator */'),
        `${filename}: missing injection sentinel`,
      ).toBe(true);
    }
  });

  it('each template has data-pengui-medium="print" on <html>', () => {
    for (const filename of templateFiles) {
      const html = fs.readFileSync(path.join(TEMPLATES_PRINT_DIR, filename), 'utf-8');
      expect(
        html.includes('data-pengui-medium="print"'),
        `${filename}: missing data-pengui-medium attribute`,
      ).toBe(true);
    }
  });

  it('each template source has no literal hex colors in its CSS sections', () => {
    for (const filename of templateFiles) {
      const html = fs.readFileSync(path.join(TEMPLATES_PRINT_DIR, filename), 'utf-8');
      expect(cssHasNoLiteralHex(html), `${filename}: contains literal hex color`).toBe(true);
    }
  });

  it('each template source has .slide width 1240px and height 1754px', () => {
    for (const filename of templateFiles) {
      const html = fs.readFileSync(path.join(TEMPLATES_PRINT_DIR, filename), 'utf-8');
      expect(hasWidth1240(html), `${filename}: missing width: 1240px`).toBe(true);
      expect(hasHeight1754(html), `${filename}: missing height: 1754px`).toBe(true);
    }
  });
});
