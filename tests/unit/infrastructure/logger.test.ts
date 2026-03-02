import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '../../../src/infrastructure/logger.js';

describe('Logger', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  it('outputs to stderr (console.error), not stdout', () => {
    const logger = new Logger('test');
    logger.info('hello');

    expect(stderrSpy).toHaveBeenCalledOnce();
    const output = stderrSpy.mock.calls[0][0] as string;
    const entry = JSON.parse(output);
    expect(entry.message).toBe('hello');
  });

  it('includes correct log level in output', () => {
    const logger = new Logger('test');
    logger.warn('warning message');

    const entry = JSON.parse(stderrSpy.mock.calls[0][0] as string);
    expect(entry.level).toBe('warn');
  });

  it('includes timestamp in output', () => {
    const logger = new Logger('test');
    logger.info('with time');

    const entry = JSON.parse(stderrSpy.mock.calls[0][0] as string);
    expect(entry.timestamp).toBeDefined();
    // Should be a valid ISO 8601 timestamp
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });

  it('includes context in output', () => {
    const logger = new Logger('my-context');
    logger.info('test');

    const entry = JSON.parse(stderrSpy.mock.calls[0][0] as string);
    expect(entry.context).toBe('my-context');
  });

  it('includes data when provided', () => {
    const logger = new Logger('test');
    logger.info('with data', { key: 'value', num: 42 });

    const entry = JSON.parse(stderrSpy.mock.calls[0][0] as string);
    expect(entry.data).toEqual({ key: 'value', num: 42 });
  });

  it('omits data field when not provided', () => {
    const logger = new Logger('test');
    logger.info('no data');

    const entry = JSON.parse(stderrSpy.mock.calls[0][0] as string);
    expect(entry.data).toBeUndefined();
  });

  describe('child loggers', () => {
    it('inherit parent context with colon separator', () => {
      const parent = new Logger('parent');
      const child = parent.child('child');
      child.info('from child');

      const entry = JSON.parse(stderrSpy.mock.calls[0][0] as string);
      expect(entry.context).toBe('parent:child');
    });

    it('can be nested multiple levels', () => {
      const root = new Logger('root');
      const mid = root.child('mid');
      const leaf = mid.child('leaf');
      leaf.info('deep');

      const entry = JSON.parse(stderrSpy.mock.calls[0][0] as string);
      expect(entry.context).toBe('root:mid:leaf');
    });
  });

  describe('log levels', () => {
    it('suppresses debug when min level is info', () => {
      const logger = new Logger('test', 'info');
      logger.debug('should not appear');

      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('allows info when min level is info', () => {
      const logger = new Logger('test', 'info');
      logger.info('should appear');

      expect(stderrSpy).toHaveBeenCalledOnce();
    });

    it('allows warn when min level is info', () => {
      const logger = new Logger('test', 'info');
      logger.warn('should appear');

      expect(stderrSpy).toHaveBeenCalledOnce();
    });

    it('allows error when min level is info', () => {
      const logger = new Logger('test', 'info');
      logger.error('should appear');

      expect(stderrSpy).toHaveBeenCalledOnce();
    });

    it('suppresses info and debug when min level is warn', () => {
      const logger = new Logger('test', 'warn');
      logger.debug('nope');
      logger.info('nope');

      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('allows warn and error when min level is warn', () => {
      const logger = new Logger('test', 'warn');
      logger.warn('yes');
      logger.error('yes');

      expect(stderrSpy).toHaveBeenCalledTimes(2);
    });

    it('only allows error when min level is error', () => {
      const logger = new Logger('test', 'error');
      logger.debug('nope');
      logger.info('nope');
      logger.warn('nope');
      logger.error('yes');

      expect(stderrSpy).toHaveBeenCalledOnce();
    });

    it('allows all levels when min level is debug', () => {
      const logger = new Logger('test', 'debug');
      logger.debug('yes');
      logger.info('yes');
      logger.warn('yes');
      logger.error('yes');

      expect(stderrSpy).toHaveBeenCalledTimes(4);
    });

    it('child loggers inherit min level from parent', () => {
      const parent = new Logger('parent', 'warn');
      const child = parent.child('child');
      child.info('should be suppressed');
      child.warn('should appear');

      expect(stderrSpy).toHaveBeenCalledOnce();
    });
  });
});
