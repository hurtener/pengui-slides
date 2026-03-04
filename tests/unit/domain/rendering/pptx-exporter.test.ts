import { describe, it, expect } from 'vitest';
import { PptxExporter } from '../../../../src/domain/rendering/pptx-exporter.js';
import { Logger } from '../../../../src/infrastructure/logger.js';

describe('PptxExporter', () => {
  it('can be instantiated with a mock renderer', () => {
    const logger = new Logger('test', 'error');
    const mockRenderer = {
      render: async () => ({
        slideId: 'test',
        imageData: Buffer.from(''),
        format: 'png' as const,
        width: 1920,
        height: 1080,
        renderTimeMs: 0,
      }),
    };

    // PptxExporter constructor accepts a renderer and logger
    const exporter = new PptxExporter(mockRenderer as any, logger);
    expect(exporter).toBeDefined();
  });
});
