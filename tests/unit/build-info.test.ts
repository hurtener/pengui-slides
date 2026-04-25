import { describe, it, expect } from 'vitest';
import { BUILD_INFO } from '../../src/build-info.js';

describe('BUILD_INFO', () => {
  it('has the four fields get_session contracts on', () => {
    expect(BUILD_INFO).toHaveProperty('server_version');
    expect(BUILD_INFO).toHaveProperty('build_sha');
    expect(BUILD_INFO).toHaveProperty('build_time');
    expect(BUILD_INFO).toHaveProperty('git_dirty');
  });

  it('build_time parses as a valid ISO date', () => {
    const t = Date.parse(BUILD_INFO.build_time);
    expect(Number.isNaN(t)).toBe(false);
  });

  it('server_version matches a semver-ish string', () => {
    expect(BUILD_INFO.server_version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('build_sha is a non-empty string (short SHA or "unknown")', () => {
    expect(BUILD_INFO.build_sha.length).toBeGreaterThan(0);
  });

  it('git_dirty is boolean', () => {
    expect(typeof BUILD_INFO.git_dirty).toBe('boolean');
  });
});
