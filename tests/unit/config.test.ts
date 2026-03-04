import { describe, it, expect } from 'vitest';
import { defaultConfig, loadConfig } from '../../src/config.js';

describe('defaultConfig', () => {
  it('has expected default values', () => {
    expect(defaultConfig.serverName).toBe('pengui-slides');
    expect(defaultConfig.version).toBe('0.1.0');
    expect(defaultConfig.slideWidth).toBe(1920);
    expect(defaultConfig.slideHeight).toBe(1080);
    expect(defaultConfig.safeAreaInset).toBe(48);
    expect(defaultConfig.previewWidth).toBe(480);
    expect(defaultConfig.previewHeight).toBe(270);
    expect(defaultConfig.styleScoreThreshold).toBe(0.8);
    expect(defaultConfig.maxRevisionsPerSlide).toBe(10);
    expect(defaultConfig.logLevel).toBe('info');
    expect(defaultConfig.outputDir).toBe('./output');
    expect(defaultConfig.headless).toBe(true);
    expect(defaultConfig.transport).toBe('stdio');
    expect(defaultConfig.httpHost).toBe('127.0.0.1');
    expect(defaultConfig.httpPort).toBe(3000);
  });
});

describe('loadConfig', () => {
  it('returns defaults when no overrides provided', () => {
    const config = loadConfig();
    expect(config).toEqual(defaultConfig);
  });

  it('returns defaults when empty overrides provided', () => {
    const config = loadConfig({});
    expect(config).toEqual(defaultConfig);
  });

  it('merges overrides with defaults', () => {
    const config = loadConfig({
      slideWidth: 3840,
      slideHeight: 2160,
      logLevel: 'debug',
    });

    expect(config.slideWidth).toBe(3840);
    expect(config.slideHeight).toBe(2160);
    expect(config.logLevel).toBe('debug');

    // Non-overridden values should remain default
    expect(config.serverName).toBe('pengui-slides');
    expect(config.safeAreaInset).toBe(48);
    expect(config.headless).toBe(true);
  });

  it('allows overriding a single field', () => {
    const config = loadConfig({ headless: false });

    expect(config.headless).toBe(false);
    // All other fields should remain default
    expect(config.slideWidth).toBe(1920);
  });

  it('merges transport config overrides correctly', () => {
    const config = loadConfig({ transport: 'http', httpPort: 8080 });

    expect(config.transport).toBe('http');
    expect(config.httpPort).toBe(8080);
    // Non-overridden transport fields keep defaults
    expect(config.httpHost).toBe('127.0.0.1');
  });
});
