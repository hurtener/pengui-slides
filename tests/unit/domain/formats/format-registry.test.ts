import { describe, it, expect } from 'vitest';
import {
  FORMAT_REGISTRY,
  DEFAULT_FORMAT,
  getFormat,
  isPrintFormat,
  isSlideFormat,
  assertKnownFormat,
  PRINT_FORMATS,
  SLIDE_FORMATS,
} from '../../../../src/domain/formats/format-registry.js';
import type { FormatKind } from '../../../../src/types/format.js';

describe('FORMAT_REGISTRY', () => {
  it('contains all three registered formats', () => {
    expect(Object.keys(FORMAT_REGISTRY)).toEqual(
      expect.arrayContaining(['slides_16_9', 'print_a4_portrait', 'print_letter_portrait']),
    );
  });

  describe('slides_16_9', () => {
    const format = FORMAT_REGISTRY.slides_16_9;

    it('resolves with correct geometry', () => {
      expect(format.geometry.widthPx).toBe(1920);
      expect(format.geometry.heightPx).toBe(1080);
      expect(format.geometry.safeAreaInsetPx).toBe(48);
      expect(format.geometry.orientation).toBe('landscape');
      expect(format.geometry.medium).toBe('slides');
      expect(format.geometry.physicalPage).toBeNull();
    });

    it('has thumbnail aspect of 16/9', () => {
      expect(format.geometry.thumbnailAspect).toBeCloseTo(16 / 9, 5);
    });
  });

  describe('print_a4_portrait', () => {
    const format = FORMAT_REGISTRY.print_a4_portrait;

    it('resolves with correct A4 geometry', () => {
      expect(format.geometry.widthPx).toBe(1240);
      expect(format.geometry.heightPx).toBe(1754);
      expect(format.geometry.safeAreaInsetPx).toBe(96);
      expect(format.geometry.orientation).toBe('portrait');
      expect(format.geometry.medium).toBe('print');
      expect(format.geometry.physicalPage).toBe('A4');
    });

    it('has thumbnail aspect matching A4 portrait ratio', () => {
      expect(format.geometry.thumbnailAspect).toBeCloseTo(1240 / 1754, 5);
    });
  });

  describe('print_letter_portrait', () => {
    const format = FORMAT_REGISTRY.print_letter_portrait;

    it('resolves with correct Letter geometry', () => {
      expect(format.geometry.widthPx).toBe(1275);
      expect(format.geometry.heightPx).toBe(1650);
      expect(format.geometry.safeAreaInsetPx).toBe(96);
      expect(format.geometry.orientation).toBe('portrait');
      expect(format.geometry.medium).toBe('print');
      expect(format.geometry.physicalPage).toBe('Letter');
    });

    it('has thumbnail aspect matching Letter portrait ratio', () => {
      expect(format.geometry.thumbnailAspect).toBeCloseTo(1275 / 1650, 5);
    });
  });
});

describe('DEFAULT_FORMAT', () => {
  it('is slides_16_9', () => {
    expect(DEFAULT_FORMAT).toBe('slides_16_9');
  });
});

describe('getFormat', () => {
  it('returns the correct format for each kind', () => {
    const kinds: FormatKind[] = ['slides_16_9', 'print_a4_portrait', 'print_letter_portrait'];
    for (const kind of kinds) {
      const format = getFormat(kind);
      expect(format.kind).toBe(kind);
      expect(format.geometry).toBeDefined();
    }
  });

  it('defaults to slides_16_9 when kind is undefined', () => {
    const format = getFormat(undefined);
    expect(format.kind).toBe('slides_16_9');
  });
});

describe('isPrintFormat', () => {
  it('returns false for slides_16_9', () => {
    expect(isPrintFormat('slides_16_9')).toBe(false);
  });

  it('returns true for print_a4_portrait', () => {
    expect(isPrintFormat('print_a4_portrait')).toBe(true);
  });

  it('returns true for print_letter_portrait', () => {
    expect(isPrintFormat('print_letter_portrait')).toBe(true);
  });

  it('defaults to false when kind is undefined (slides_16_9)', () => {
    expect(isPrintFormat(undefined)).toBe(false);
  });
});

describe('isSlideFormat', () => {
  it('returns true for slides_16_9', () => {
    expect(isSlideFormat('slides_16_9')).toBe(true);
  });

  it('returns false for print_a4_portrait', () => {
    expect(isSlideFormat('print_a4_portrait')).toBe(false);
  });

  it('returns false for print_letter_portrait', () => {
    expect(isSlideFormat('print_letter_portrait')).toBe(false);
  });
});

describe('assertKnownFormat', () => {
  it('does not throw for known formats', () => {
    expect(() => assertKnownFormat('slides_16_9')).not.toThrow();
    expect(() => assertKnownFormat('print_a4_portrait')).not.toThrow();
    expect(() => assertKnownFormat('print_letter_portrait')).not.toThrow();
  });

  it('throws for an unknown format string', () => {
    expect(() => assertKnownFormat('unknown_format')).toThrow();
  });

  it('error message mentions the invalid format', () => {
    expect(() => assertKnownFormat('bad_format')).toThrow('bad_format');
  });
});

describe('PRINT_FORMATS and SLIDE_FORMATS', () => {
  it('PRINT_FORMATS contains only print medium formats', () => {
    for (const kind of PRINT_FORMATS) {
      expect(FORMAT_REGISTRY[kind].geometry.medium).toBe('print');
    }
  });

  it('SLIDE_FORMATS contains only slides medium formats', () => {
    for (const kind of SLIDE_FORMATS) {
      expect(FORMAT_REGISTRY[kind].geometry.medium).toBe('slides');
    }
  });

  it('every format belongs to exactly one list', () => {
    const allKinds = Object.keys(FORMAT_REGISTRY) as FormatKind[];
    for (const kind of allKinds) {
      const inPrint = PRINT_FORMATS.includes(kind);
      const inSlide = SLIDE_FORMATS.includes(kind);
      expect(inPrint !== inSlide).toBe(true);
    }
  });
});
