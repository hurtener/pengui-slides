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

  /** If set, uses file-based persistence at this directory. Otherwise, in-memory. */
  persistDir?: string;

  /** Transport mode: stdio (sidecar) or http (remote) */
  transport: 'stdio' | 'http';

  /** HTTP server bind host (only used when transport is 'http') */
  httpHost: string;

  /** HTTP server port (only used when transport is 'http') */
  httpPort: number;

  /** Optional pre-minted Google OAuth access token for Google Slides export */
  googleAccessToken?: string;

  /** Optional Google service account client email for Google Slides export */
  googleClientEmail?: string;

  /** Optional Google service account private key for Google Slides export */
  googlePrivateKey?: string;
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
  transport: 'stdio',
  httpHost: '127.0.0.1',
  httpPort: 3000,
};

export function loadConfig(overrides?: Partial<PenguiConfig>): PenguiConfig {
  return { ...defaultConfig, ...overrides };
}
