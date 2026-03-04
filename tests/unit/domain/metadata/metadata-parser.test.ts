import { describe, it, expect } from 'vitest';
import { MetadataParser } from '../../../../src/domain/metadata/metadata-parser.js';

describe('MetadataParser', () => {
  const parser = new MetadataParser();

  describe('parse', () => {
    it('parses valid @slide-meta JSON from HTML', () => {
      const html = `
        <div class="slide">
          <!-- @slide-meta {"title":"Hello","type":"content","narrative":"Test","keyPoints":[],"dataPoints":[],"tags":[],"generatedAt":"2026-01-01","soulId":"s1","deckId":"d1","position":0,"metaVersion":"1.0","revisionHash":"abc"} -->
          <p>Content</p>
        </div>`;

      const result = parser.parse(html);
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Hello');
      expect(result!.type).toBe('content');
      expect(result!.narrative).toBe('Test');
    });

    it('parses multiline JSON in metadata comment', () => {
      const html = `
        <!-- @slide-meta {
          "title": "Multi",
          "type": "title",
          "narrative": "A narrative",
          "keyPoints": ["point1"],
          "dataPoints": [],
          "tags": ["tag1"],
          "generatedAt": "2026-01-01",
          "soulId": "s1",
          "deckId": "d1",
          "position": 0,
          "metaVersion": "1.0",
          "revisionHash": "abc"
        } -->
        <div class="slide"><p>Hello</p></div>`;

      const result = parser.parse(html);
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Multi');
      expect(result!.keyPoints).toEqual(['point1']);
    });

    it('returns null for HTML without metadata', () => {
      const html = '<div class="slide"><p>No meta</p></div>';
      const result = parser.parse(html);
      expect(result).toBeNull();
    });

    it('returns null for malformed JSON in metadata comment', () => {
      const html = '<!-- @slide-meta {invalid json here} -->';
      const result = parser.parse(html);
      expect(result).toBeNull();
    });

    it('returns null for empty HTML', () => {
      const result = parser.parse('');
      expect(result).toBeNull();
    });

    it('handles metadata with extra whitespace', () => {
      const html = '<!--   @slide-meta   {"title":"Spaced","type":"content","narrative":"","keyPoints":[],"dataPoints":[],"tags":[],"generatedAt":"","soulId":"","deckId":"","position":0,"metaVersion":"1.0","revisionHash":""}   -->';
      const result = parser.parse(html);
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Spaced');
    });
  });

  describe('hasMetadata', () => {
    it('returns true when HTML contains slide-meta comment', () => {
      const html = '<!-- @slide-meta {"title":"test"} --><div>Content</div>';
      expect(parser.hasMetadata(html)).toBe(true);
    });

    it('returns false when HTML has no slide-meta comment', () => {
      const html = '<div>No metadata here</div>';
      expect(parser.hasMetadata(html)).toBe(false);
    });

    it('returns true even with malformed JSON', () => {
      const html = '<!-- @slide-meta {bad} -->';
      expect(parser.hasMetadata(html)).toBe(true);
    });
  });
});
