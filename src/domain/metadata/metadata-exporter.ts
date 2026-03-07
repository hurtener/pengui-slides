/**
 * Metadata Exporter for Pengui Slides.
 *
 * Converts SlideMetadata into a human-readable Markdown string suitable
 * for embedding in PPTX speaker notes. The format includes:
 * - Title and type
 * - Narrative summary
 * - Key points list
 * - Data points table
 * - Tags
 * - Source attribution
 */

import type { SlideMetadata, DataPoint, SlideSource } from '../../types/metadata.js';

export class MetadataExporter {
  /**
   * Format slide metadata as readable Markdown for PPTX speaker notes.
   *
   * @param metadata - The slide metadata to export.
   * @returns A Markdown-formatted string.
   */
  toMarkdown(metadata: SlideMetadata): string {
    const sections: string[] = [];

    // Title and type header
    sections.push(`# ${metadata.title}`);
    sections.push(`**Type:** ${metadata.type}`);

    // Narrative
    if (metadata.narrative) {
      sections.push('');
      sections.push('## Narrative');
      sections.push(metadata.narrative);
    }

    // Key points
    if (metadata.keyPoints && metadata.keyPoints.length > 0) {
      sections.push('');
      sections.push('## Key Points');
      for (const point of metadata.keyPoints) {
        sections.push(`- ${point}`);
      }
    }

    // Data points table
    if (metadata.dataPoints && metadata.dataPoints.length > 0) {
      sections.push('');
      sections.push('## Data Points');
      sections.push('');
      sections.push(this.formatDataPointsTable(metadata.dataPoints));
    }

    // Tags
    if (metadata.tags && metadata.tags.length > 0) {
      sections.push('');
      sections.push(`**Tags:** ${metadata.tags.join(', ')}`);
    }

    // Audience
    if (metadata.audience) {
      sections.push('');
      sections.push(`**Audience:** ${metadata.audience}`);
    }

    // Confidentiality
    if (metadata.confidentiality) {
      sections.push('');
      sections.push(`**Confidentiality:** ${metadata.confidentiality}`);
    }

    // Sources
    if (metadata.sources && metadata.sources.length > 0) {
      sections.push('');
      sections.push('## Sources');
      for (const source of metadata.sources) {
        sections.push(this.formatSource(source));
      }
    }

    // Provenance footer
    sections.push('');
    sections.push('---');
    sections.push(
      `*Generated: ${metadata.generatedAt} | Soul: ${metadata.soulId} | Deck: ${metadata.deckId} | Position: ${metadata.position} | Revision: ${metadata.revisionHash} | Meta v${metadata.metaVersion}*`,
    );

    return sections.join('\n');
  }

  /**
   * Format an array of data points as a Markdown table.
   */
  private formatDataPointsTable(dataPoints: DataPoint[]): string {
    const hasUnit = dataPoints.some((dp) => dp.unit);
    const hasSource = dataPoints.some((dp) => dp.source);
    const hasPeriod = dataPoints.some((dp) => dp.period);
    const hasTrend = dataPoints.some((dp) => dp.trend);

    // Build header
    const headers = ['Label', 'Value'];
    if (hasUnit) headers.push('Unit');
    if (hasPeriod) headers.push('Period');
    if (hasTrend) headers.push('Trend');
    if (hasSource) headers.push('Source');

    const headerRow = `| ${headers.join(' | ')} |`;
    const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;

    // Build rows
    const rows = dataPoints.map((dp) => {
      const cells = [dp.label, String(dp.value)];
      if (hasUnit) cells.push(dp.unit ?? '');
      if (hasPeriod) cells.push(dp.period ?? '');
      if (hasTrend) cells.push(dp.trend ?? '');
      if (hasSource) cells.push(dp.source ?? '');
      return `| ${cells.join(' | ')} |`;
    });

    return [headerRow, separatorRow, ...rows].join('\n');
  }

  /**
   * Format a single source reference as a Markdown line.
   */
  private formatSource(source: SlideSource): string {
    const parts: string[] = [];

    if (source.title && source.url) {
      parts.push(`- [${source.title}](${source.url})`);
    } else if (source.title) {
      parts.push(`- ${source.title}`);
    } else if (source.url) {
      parts.push(`- ${source.url}`);
    } else {
      parts.push('- (unnamed source)');
    }

    if (source.quoteSpan) {
      parts.push(`  > "${source.quoteSpan}"`);
    }
    if (source.confidence !== undefined) {
      parts.push(`  Confidence: ${(source.confidence * 100).toFixed(0)}%`);
    }

    return parts.join('\n');
  }
}
