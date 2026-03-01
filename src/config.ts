/**
 * Runtime configuration for Pengui Slides MCP Server.
 */

export interface PenguiConfig {
  /** Server name exposed via MCP */
  serverName: string;

  /** Server version */
  version: string;

  /** Default slide dimensions */
  slideWidth: number;
  slideHeight: number;

  /** Safe area inset from edges */
  safeAreaInset: number;

  /** Preview thumbnail dimensions */
  previewWidth: number;
  previewHeight: number;

  /** Validation style score threshold (0.0 - 1.0) */
  styleScoreThreshold: number;

  /** Maximum revision depth per slide */
  maxRevisionsPerSlide: number;

  /** Log level */
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  /** Output directory for exports */
  outputDir: string;

  /** Playwright headless mode */
  headless: boolean;
}

export const defaultConfig: PenguiConfig = {
  serverName: 'pengui-slides',
  version: '0.1.0',
  slideWidth: 1920,
  slideHeight: 1080,
  safeAreaInset: 48,
  previewWidth: 480,
  previewHeight: 270,
  styleScoreThreshold: 0.8,
  maxRevisionsPerSlide: 10,
  logLevel: 'info',
  outputDir: './output',
  headless: true,
};

export function loadConfig(overrides?: Partial<PenguiConfig>): PenguiConfig {
  return { ...defaultConfig, ...overrides };
}
