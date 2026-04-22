import { describe, it, expect } from 'vitest';
import {
  parsePageChrome,
  resolvePageChrome,
} from '../../../../src/domain/metadata/page-chrome-parser.js';

describe('parsePageChrome', () => {
  describe('absent directive', () => {
    it('returns {directive: null} for HTML without @page-chrome comment', () => {
      const html = '<div class="slide"><p>No chrome here</p></div>';
      const result = parsePageChrome(html);
      expect(result.directive).toBeNull();
      expect(result.parseError).toBeUndefined();
    });

    it('returns {directive: null} for empty HTML', () => {
      const result = parsePageChrome('');
      expect(result.directive).toBeNull();
      expect(result.parseError).toBeUndefined();
    });

    it('does not confuse @slide-meta with @page-chrome', () => {
      const html =
        '<!-- @slide-meta {"title":"Test","type":"cover"} --><div class="slide"></div>';
      const result = parsePageChrome(html);
      expect(result.directive).toBeNull();
      expect(result.parseError).toBeUndefined();
    });
  });

  describe('valid directive', () => {
    it('parses a fully specified @page-chrome directive', () => {
      const html =
        '<!-- @page-chrome {"runningTitle":"My Doc","pageNumber":true,"footerAlign":"right","hide":false} -->';
      const result = parsePageChrome(html);
      expect(result.directive).not.toBeNull();
      expect(result.parseError).toBeUndefined();
      expect(result.directive!.runningTitle).toBe('My Doc');
      expect(result.directive!.pageNumber).toBe(true);
      expect(result.directive!.footerAlign).toBe('right');
      expect(result.directive!.hide).toBe(false);
    });

    it('parses a minimal directive (only hide:true)', () => {
      const html = '<!-- @page-chrome {"hide":true} -->';
      const result = parsePageChrome(html);
      expect(result.directive).not.toBeNull();
      expect(result.directive!.hide).toBe(true);
      // other fields absent (undefined is fine — resolvePageChrome fills them)
      expect(result.directive!.runningTitle).toBeUndefined();
    });

    it('parses a directive with runningTitle only', () => {
      const html = '<!-- @page-chrome {"runningTitle":"Chemistry Notes"} -->';
      const result = parsePageChrome(html);
      expect(result.directive!.runningTitle).toBe('Chemistry Notes');
    });

    it('handles optional whitespace around the directive name', () => {
      const html = '<!--   @page-chrome   {"footerAlign":"left"}   -->';
      const result = parsePageChrome(html);
      expect(result.directive).not.toBeNull();
      expect(result.directive!.footerAlign).toBe('left');
    });

    it('handles multiline JSON in the directive comment', () => {
      const html = `<!-- @page-chrome {
        "runningTitle": "Multi",
        "pageNumber": false,
        "footerAlign": "center"
      } -->`;
      const result = parsePageChrome(html);
      expect(result.directive).not.toBeNull();
      expect(result.directive!.runningTitle).toBe('Multi');
      expect(result.directive!.pageNumber).toBe(false);
      expect(result.directive!.footerAlign).toBe('center');
    });
  });

  describe('malformed JSON', () => {
    it('returns parseError when the comment contains invalid JSON', () => {
      const html = '<!-- @page-chrome {invalid json} -->';
      const result = parsePageChrome(html);
      expect(result.directive).toBeNull();
      expect(result.parseError).toBeDefined();
      expect(result.parseError).toContain('@page-chrome JSON is malformed');
    });

    it('returns parseError when the payload is a bare string', () => {
      const html = '<!-- @page-chrome not-json -->';
      const result = parsePageChrome(html);
      expect(result.directive).toBeNull();
      expect(result.parseError).toBeDefined();
    });

    it('returns parseError when the payload is an unclosed object', () => {
      const html = '<!-- @page-chrome {"runningTitle": "Oops" -->';
      const result = parsePageChrome(html);
      expect(result.directive).toBeNull();
      expect(result.parseError).toBeDefined();
    });
  });
});

describe('resolvePageChrome', () => {
  const DEFAULTS = { deckTitle: 'Deck Title' };

  it('fills all defaults when directive is null', () => {
    const resolved = resolvePageChrome(null, DEFAULTS);
    expect(resolved.runningTitle).toBe('Deck Title');
    expect(resolved.pageNumber).toBe(true);
    expect(resolved.footerAlign).toBe('right');
    expect(resolved.hide).toBe(false);
  });

  it('fills all defaults when directive is an empty object', () => {
    const resolved = resolvePageChrome({}, DEFAULTS);
    expect(resolved.runningTitle).toBe('Deck Title');
    expect(resolved.pageNumber).toBe(true);
    expect(resolved.footerAlign).toBe('right');
    expect(resolved.hide).toBe(false);
  });

  it('uses directive values when all fields are specified', () => {
    const resolved = resolvePageChrome(
      { runningTitle: 'Custom', pageNumber: false, footerAlign: 'left', hide: true },
      DEFAULTS,
    );
    expect(resolved.runningTitle).toBe('Custom');
    expect(resolved.pageNumber).toBe(false);
    expect(resolved.footerAlign).toBe('left');
    expect(resolved.hide).toBe(true);
  });

  it('uses deckTitle as runningTitle default when runningTitle is absent', () => {
    const resolved = resolvePageChrome({ pageNumber: false }, DEFAULTS);
    expect(resolved.runningTitle).toBe('Deck Title');
    expect(resolved.pageNumber).toBe(false);
  });

  it('overrides runningTitle with a custom value', () => {
    const resolved = resolvePageChrome({ runningTitle: 'Chapter One' }, DEFAULTS);
    expect(resolved.runningTitle).toBe('Chapter One');
  });

  it('defaults footerAlign to right when absent', () => {
    const resolved = resolvePageChrome({ runningTitle: 'Test' }, DEFAULTS);
    expect(resolved.footerAlign).toBe('right');
  });

  it('defaults hide to false when absent', () => {
    const resolved = resolvePageChrome({ hide: undefined }, DEFAULTS);
    expect(resolved.hide).toBe(false);
  });

  it('resolves hide:true correctly', () => {
    const resolved = resolvePageChrome({ hide: true }, DEFAULTS);
    expect(resolved.hide).toBe(true);
  });
});
