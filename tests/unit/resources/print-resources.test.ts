/**
 * Unit tests for the print-mode MCP resource registrations.
 *
 * Verifies that:
 * - registerChartsAndDiagramsResource registers at the correct URI
 * - registerPrintModeResource registers at the correct URI
 * - Both return valid markdown content
 * - Neither throws at module load time (the file-read happens at import)
 */

import { describe, expect, it } from 'vitest';
import {
  registerChartsAndDiagramsResource,
} from '../../../src/resources/print-charts-and-diagrams.resource.js';
import {
  registerPrintModeResource,
} from '../../../src/resources/print-mode.resource.js';

type ResourceCallback = () => { contents: Array<{ uri: string; mimeType: string; text: string }> };

function makeMockServer(): {
  registered: Array<{ name: string; uri: string; callback: ResourceCallback }>;
  registerResource: (name: string, uri: string, _config: unknown, callback: ResourceCallback) => void;
} {
  const registered: Array<{ name: string; uri: string; callback: ResourceCallback }> = [];
  return {
    registered,
    registerResource(name, uri, _config, callback) {
      registered.push({ name, uri, callback });
    },
  };
}

describe('registerChartsAndDiagramsResource', () => {
  it('registers at pengui://docs/charts-and-diagrams', () => {
    const server = makeMockServer();
    registerChartsAndDiagramsResource(server as never);

    expect(server.registered).toHaveLength(1);
    expect(server.registered[0].uri).toBe('pengui://docs/charts-and-diagrams');
  });

  it('returns markdown content with the correct URI and mimeType', () => {
    const server = makeMockServer();
    registerChartsAndDiagramsResource(server as never);

    const result = server.registered[0].callback();
    const content = result.contents[0];

    expect(content.uri).toBe('pengui://docs/charts-and-diagrams');
    expect(content.mimeType).toBe('text/markdown');
    expect(typeof content.text).toBe('string');
    expect(content.text.length).toBeGreaterThan(0);
  });

  it('content contains all major diagram types', () => {
    const server = makeMockServer();
    registerChartsAndDiagramsResource(server as never);

    const { text } = server.registered[0].callback().contents[0];

    expect(text).toContain('Tree / Mind-Map');
    expect(text).toContain('Flow Diagram');
    expect(text).toContain('Bar Chart');
    expect(text).toContain('Line Chart');
    expect(text).toContain('Pie Chart');
    expect(text).toContain('Comparison Matrix');
    expect(text).toContain('Timeline');
  });

  it('content contains viewBox usage examples', () => {
    const server = makeMockServer();
    registerChartsAndDiagramsResource(server as never);

    const { text } = server.registered[0].callback().contents[0];
    expect(text).toContain('viewBox=');
  });

  it('content references soul color tokens', () => {
    const server = makeMockServer();
    registerChartsAndDiagramsResource(server as never);

    const { text } = server.registered[0].callback().contents[0];
    expect(text).toContain('var(--color-category-a)');
    expect(text).toContain('var(--color-border)');
    expect(text).toContain('var(--text-');
  });
});

describe('registerPrintModeResource', () => {
  it('registers at pengui://docs/print-mode', () => {
    const server = makeMockServer();
    registerPrintModeResource(server as never);

    expect(server.registered).toHaveLength(1);
    expect(server.registered[0].uri).toBe('pengui://docs/print-mode');
  });

  it('returns markdown content with the correct URI and mimeType', () => {
    const server = makeMockServer();
    registerPrintModeResource(server as never);

    const result = server.registered[0].callback();
    const content = result.contents[0];

    expect(content.uri).toBe('pengui://docs/print-mode');
    expect(content.mimeType).toBe('text/markdown');
    expect(typeof content.text).toBe('string');
    expect(content.text.length).toBeGreaterThan(0);
  });

  it('content covers A4 geometry', () => {
    const server = makeMockServer();
    registerPrintModeResource(server as never);

    const { text } = server.registered[0].callback().contents[0];
    expect(text).toContain('1240');
    expect(text).toContain('1754');
    expect(text).toContain('96');
  });

  it('content documents the page-chrome directive schema', () => {
    const server = makeMockServer();
    registerPrintModeResource(server as never);

    const { text } = server.registered[0].callback().contents[0];
    expect(text).toContain('@page-chrome');
    expect(text).toContain('runningTitle');
    expect(text).toContain('pageNumber');
    expect(text).toContain('footerAlign');
    expect(text).toContain('hide');
  });

  it('content lists all 11 print recipe types', () => {
    const server = makeMockServer();
    registerPrintModeResource(server as never);

    const { text } = server.registered[0].callback().contents[0];
    const expectedTypes = [
      'cover', 'toc', 'chapter_intro', 'content', 'content_chart',
      'content_diagram', 'compare', 'glossary', 'timeline', 'summary', 'bibliography',
    ];
    for (const recipeType of expectedTypes) {
      expect(text, `Missing recipe type: ${recipeType}`).toContain(recipeType);
    }
  });

  it('content references the charts-and-diagrams resource', () => {
    const server = makeMockServer();
    registerPrintModeResource(server as never);

    const { text } = server.registered[0].callback().contents[0];
    expect(text).toContain('pengui://docs/charts-and-diagrams');
  });
});
