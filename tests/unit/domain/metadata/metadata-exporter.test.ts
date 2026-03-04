import { describe, it, expect } from 'vitest';
import { MetadataExporter } from '../../../../src/domain/metadata/metadata-exporter.js';
import type { SlideMetadata } from '../../../../src/types/metadata.js';

describe('MetadataExporter', () => {
  const exporter = new MetadataExporter();

  const fullMetadata: SlideMetadata = {
    title: 'Key Metrics',
    type: 'metrics',
    narrative: 'This slide shows our key performance indicators.',
    keyPoints: ['Revenue is up 25%', 'Customer satisfaction at 95%'],
    dataPoints: [
      { label: 'Revenue', value: '25M', unit: 'USD', source: 'Finance', period: 'Q4 2025', trend: 'up' },
      { label: 'Users', value: 10000000 },
    ],
    tags: ['metrics', 'q4', 'performance'],
    audience: 'Executive Team',
    confidentiality: 'internal',
    generatedAt: '2026-01-15T12:00:00.000Z',
    soulId: 'soul-1',
    deckId: 'deck-1',
    position: 2,
    metaVersion: '1.0',
    revisionHash: 'abc123',
    sources: [
      { title: 'Finance Report', url: 'https://example.com/report', quoteSpan: 'Revenue grew 25% YoY', confidence: 0.95 },
      { title: 'User Analytics' },
    ],
  };

  describe('toMarkdown', () => {
    it('includes the title as a heading', () => {
      const md = exporter.toMarkdown(fullMetadata);
      expect(md).toContain('# Key Metrics');
    });

    it('includes the type', () => {
      const md = exporter.toMarkdown(fullMetadata);
      expect(md).toContain('**Type:** metrics');
    });

    it('includes the narrative section', () => {
      const md = exporter.toMarkdown(fullMetadata);
      expect(md).toContain('## Narrative');
      expect(md).toContain('This slide shows our key performance indicators.');
    });

    it('includes key points as bullet list', () => {
      const md = exporter.toMarkdown(fullMetadata);
      expect(md).toContain('## Key Points');
      expect(md).toContain('- Revenue is up 25%');
      expect(md).toContain('- Customer satisfaction at 95%');
    });

    it('includes data points as a markdown table', () => {
      const md = exporter.toMarkdown(fullMetadata);
      expect(md).toContain('## Data Points');
      expect(md).toContain('| Label | Value |');
      expect(md).toContain('| Revenue | 25M |');
      expect(md).toContain('| Users | 10000000 |');
    });

    it('includes tags', () => {
      const md = exporter.toMarkdown(fullMetadata);
      expect(md).toContain('**Tags:** metrics, q4, performance');
    });

    it('includes audience', () => {
      const md = exporter.toMarkdown(fullMetadata);
      expect(md).toContain('**Audience:** Executive Team');
    });

    it('includes confidentiality', () => {
      const md = exporter.toMarkdown(fullMetadata);
      expect(md).toContain('**Confidentiality:** internal');
    });

    it('includes sources with links', () => {
      const md = exporter.toMarkdown(fullMetadata);
      expect(md).toContain('## Sources');
      expect(md).toContain('[Finance Report](https://example.com/report)');
      expect(md).toContain('- User Analytics');
    });

    it('includes source quote span', () => {
      const md = exporter.toMarkdown(fullMetadata);
      expect(md).toContain('"Revenue grew 25% YoY"');
    });

    it('includes source confidence', () => {
      const md = exporter.toMarkdown(fullMetadata);
      expect(md).toContain('Confidence: 95%');
    });

    it('includes provenance footer', () => {
      const md = exporter.toMarkdown(fullMetadata);
      expect(md).toContain('---');
      expect(md).toContain('Generated: 2026-01-15T12:00:00.000Z');
      expect(md).toContain('Soul: soul-1');
      expect(md).toContain('Meta v1.0');
    });

    it('handles minimal metadata (no optional fields)', () => {
      const minimal: SlideMetadata = {
        title: 'Simple',
        type: 'blank',
        narrative: '',
        keyPoints: [],
        dataPoints: [],
        tags: [],
        generatedAt: '2026-01-01T00:00:00.000Z',
        soulId: 'soul-1',
        deckId: 'deck-1',
        position: 0,
        metaVersion: '1.0',
        revisionHash: 'def456',
      };

      const md = exporter.toMarkdown(minimal);
      expect(md).toContain('# Simple');
      expect(md).toContain('**Type:** blank');
      // Should not have sections for empty lists
      expect(md).not.toContain('## Key Points');
      expect(md).not.toContain('## Data Points');
      expect(md).not.toContain('## Sources');
    });
  });
});
