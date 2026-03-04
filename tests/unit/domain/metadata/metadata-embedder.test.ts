import { describe, it, expect } from 'vitest';
import { MetadataEmbedder } from '../../../../src/domain/metadata/metadata-embedder.js';
import type { SlideMetadata } from '../../../../src/types/metadata.js';

const sampleMetadata: SlideMetadata = {
  title: 'Test Slide',
  type: 'content',
  narrative: 'A test narrative',
  keyPoints: ['point 1'],
  dataPoints: [],
  tags: ['test'],
  generatedAt: '2026-01-01T00:00:00.000Z',
  soulId: 'soul-1',
  deckId: 'deck-1',
  position: 0,
  metaVersion: '1.0',
  revisionHash: 'abc123',
};

describe('MetadataEmbedder', () => {
  const embedder = new MetadataEmbedder();

  describe('embed', () => {
    it('embeds metadata as HTML comment before first div', () => {
      const html = '<body><div class="slide"><p>Hello</p></div></body>';
      const result = embedder.embed(html, sampleMetadata);

      expect(result).toContain('<!-- @slide-meta');
      expect(result).toContain('"title": "Test Slide"');

      // The comment should appear before the first div
      const metaIndex = result.indexOf('<!-- @slide-meta');
      const divIndex = result.indexOf('<div');
      expect(metaIndex).toBeLessThan(divIndex);
    });

    it('includes all metadata fields in the comment', () => {
      const html = '<div class="slide">Content</div>';
      const result = embedder.embed(html, sampleMetadata);

      expect(result).toContain('"title": "Test Slide"');
      expect(result).toContain('"type": "content"');
      expect(result).toContain('"narrative": "A test narrative"');
      expect(result).toContain('"revisionHash": "abc123"');
    });

    it('handles HTML without div (fallback prepends)', () => {
      const html = '<p>No div here</p>';
      const result = embedder.embed(html, sampleMetadata);

      expect(result).toContain('<!-- @slide-meta');
      // The comment should be at the beginning
      expect(result.startsWith('<!-- @slide-meta')).toBe(true);
    });

    it('delegates to update when metadata already exists', () => {
      const html = '<!-- @slide-meta {"title":"Old"} -->\n<div class="slide">Content</div>';
      const result = embedder.embed(html, sampleMetadata);

      // Should contain new metadata, not old
      expect(result).toContain('"title": "Test Slide"');
      expect(result).not.toContain('"title": "Old"');
    });
  });

  describe('update', () => {
    it('replaces existing metadata comment', () => {
      const html = '<!-- @slide-meta {"title":"Old Title"} -->\n<div class="slide">Content</div>';
      const result = embedder.update(html, sampleMetadata);

      expect(result).toContain('"title": "Test Slide"');
      expect(result).not.toContain('"title": "Old Title"');
    });

    it('inserts metadata if none exists (delegates to embed)', () => {
      const html = '<div class="slide">Content</div>';
      const result = embedder.update(html, sampleMetadata);

      expect(result).toContain('<!-- @slide-meta');
      expect(result).toContain('"title": "Test Slide"');
    });

    it('preserves content after the metadata comment', () => {
      const html = '<!-- @slide-meta {"title":"Old"} -->\n<div class="slide"><p>Keep this</p></div>';
      const result = embedder.update(html, sampleMetadata);

      expect(result).toContain('<p>Keep this</p>');
    });
  });
});
