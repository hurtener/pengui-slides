import { describe, it, expect } from 'vitest';
import { applyDefensiveDefaults } from '../../../../src/domain/validation/stage0/defensive-injector.js';

describe('applyDefensiveDefaults', () => {
  it('injects all four defaults when the HTML declares none of them', () => {
    const html = `<!DOCTYPE html><html><head></head><body><div class="slide">x</div></body></html>`;
    const result = applyDefensiveDefaults(html);

    expect(result.injections.map((i) => i.id)).toEqual([
      'html-body-margin',
      'universal-box-sizing',
      'slide-position-relative',
      'slide-overflow-hidden',
    ]);
    expect(result.html).toContain('pengui-defensive-defaults');
    expect(result.html).toContain('html, body { margin: 0; padding: 0; }');
    expect(result.html).toContain('* { box-sizing: border-box; }');
    expect(result.html).toContain('.slide { position: relative; }');
    expect(result.html).toContain('.slide { overflow: hidden; }');
  });

  it('reports only the rules the author is missing, even though it always prepends the full prelude', () => {
    const html = `
      <!DOCTYPE html><html><head><style>
        html, body { margin: 0; padding: 0; }
        * { box-sizing: border-box; }
        .slide { width: 1240px; height: 1754px; padding: 96px; position: relative; }
      </style></head><body><div class="slide">x</div></body></html>`;
    const result = applyDefensiveDefaults(html);
    // Only overflow:hidden was missing
    expect(result.injections.map((i) => i.id)).toEqual(['slide-overflow-hidden']);
  });

  it('does not report any missing defaults when the canonical template declares them all', () => {
    const html = `
      <!DOCTYPE html><html><head><style>
        html, body { margin: 0; padding: 0; }
        * { box-sizing: border-box; }
        .slide { position: relative; overflow: hidden; width: 1240px; height: 1754px; padding: 96px; }
      </style></head><body><div class="slide">x</div></body></html>`;
    const result = applyDefensiveDefaults(html);
    expect(result.injections).toHaveLength(0);
  });

  it('detects .slide position:relative and overflow:hidden declared as inline styles', () => {
    const html = `
      <!DOCTYPE html><html><head><style>
        html, body { margin: 0; padding: 0; }
        * { box-sizing: border-box; }
      </style></head><body>
        <div class="slide" style="position: relative; overflow: hidden; width: 1240px; height: 1754px; padding: 96px;">x</div>
      </body></html>`;
    const result = applyDefensiveDefaults(html);
    expect(result.injections).toHaveLength(0);
  });

  it('is idempotent when the prelude is already present', () => {
    const html = `<!DOCTYPE html><html><head></head><body><div class="slide">x</div></body></html>`;
    const first = applyDefensiveDefaults(html);
    const second = applyDefensiveDefaults(first.html);
    expect(second.injections).toHaveLength(0);
    expect(second.html).toEqual(first.html);
  });

  it('places the defensive <style> before any author <style> blocks so author rules win the cascade', () => {
    const html = `
      <!DOCTYPE html><html><head><style>.slide { color: red; }</style></head><body><div class="slide">x</div></body></html>`;
    const result = applyDefensiveDefaults(html);
    const defensiveIdx = result.html.indexOf('pengui-defensive-defaults');
    const authorIdx = result.html.indexOf('.slide { color: red; }');
    expect(defensiveIdx).toBeGreaterThan(-1);
    expect(authorIdx).toBeGreaterThan(-1);
    expect(defensiveIdx).toBeLessThan(authorIdx);
  });
});
