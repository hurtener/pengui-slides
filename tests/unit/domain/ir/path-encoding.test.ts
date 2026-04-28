import { describe, it, expect } from 'vitest';
import { irPathToString, irPathFromString } from '../../../../src/domain/ir/path-encoding.js';

describe('irPathToString', () => {
  it('encodes a body-index path', () => {
    expect(irPathToString(['body', 0])).toBe('body,0');
  });

  it('encodes a two_column branch path', () => {
    expect(irPathToString(['body', 2, 'left', 1])).toBe('body,2,left,1');
  });

  it('encodes a grid cell path', () => {
    expect(irPathToString(['body', 3, 'cells', 1, 0])).toBe('body,3,cells,1,0');
  });

  it('encodes the empty path as the empty string', () => {
    expect(irPathToString([])).toBe('');
  });
});

describe('irPathFromString', () => {
  it('decodes a body-index path; integer segments come back as numbers', () => {
    expect(irPathFromString('body,0')).toEqual(['body', 0]);
  });

  it('decodes a grid cell path with mixed segments', () => {
    expect(irPathFromString('body,3,cells,1,0')).toEqual(['body', 3, 'cells', 1, 0]);
  });

  it('returns null for the empty / whitespace string', () => {
    expect(irPathFromString('')).toBeNull();
    expect(irPathFromString('   ')).toBeNull();
  });

  it('round-trips through encode → decode', () => {
    const cases = [
      ['body', 0],
      ['body', 2, 'left', 1],
      ['body', 2, 'right', 0],
      ['body', 3, 'cells', 1, 0],
      ['body', 7, 'cells', 0, 2],
    ] as const;
    for (const path of cases) {
      const encoded = irPathToString([...path]);
      expect(irPathFromString(encoded)).toEqual([...path]);
    }
  });
});
