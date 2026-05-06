import { describe, it, expect } from 'vitest';
import {
  DecorationNodeSchema,
  DecorationAnchorSchema,
  PresetOrnamentNameSchema,
  ImageNodeSchema,
  ImageFrameSchema,
  SlideNodeSchema,
} from '../../../../src/domain/ir/nodes.js';
import { renderNode } from '../../../../src/domain/ir/compile/node-renderers.js';
import {
  getOrnamentDef,
  listOrnamentNames,
} from '../../../../src/domain/ir/compile/ornaments.js';

describe('DecorationNodeSchema', () => {
  it('accepts a preset decoration with anchor + accent', () => {
    const parsed = DecorationNodeSchema.parse({
      type: 'decoration',
      source: { kind: 'preset', name: 'glow_ring' },
      placement: { anchor: 'middle_center' },
      layer: 'foreground',
      accent: 'accent',
    });
    expect(parsed.source.kind).toBe('preset');
    expect(parsed.layer).toBe('foreground');
  });

  it('accepts an asset_ref decoration with bleed anchor + offset + size', () => {
    const parsed = DecorationNodeSchema.parse({
      type: 'decoration',
      source: { kind: 'asset_ref', asset_id: 'abc-123' },
      placement: {
        anchor: 'bleed_top_right',
        offset: { x: 40, y: 0 },
        size: { width: 720, height: 720 },
        rotation: 12,
        opacity: 0.6,
      },
      layer: 'background',
    });
    expect(parsed.source).toEqual({ kind: 'asset_ref', asset_id: 'abc-123' });
    expect(parsed.placement.anchor).toBe('bleed_top_right');
    expect(parsed.placement.rotation).toBe(12);
  });

  it('rejects unknown anchor', () => {
    expect(() =>
      DecorationNodeSchema.parse({
        type: 'decoration',
        source: { kind: 'preset', name: 'glow_ring' },
        placement: { anchor: 'corner' },
        layer: 'background',
      }),
    ).toThrow();
  });

  it('rejects unknown preset name', () => {
    expect(() =>
      DecorationNodeSchema.parse({
        type: 'decoration',
        source: { kind: 'preset', name: 'never_shipped' },
        placement: { anchor: 'middle_center' },
        layer: 'background',
      }),
    ).toThrow();
  });

  it('rejects empty asset_id', () => {
    expect(() =>
      DecorationNodeSchema.parse({
        type: 'decoration',
        source: { kind: 'asset_ref', asset_id: '' },
        placement: { anchor: 'top_left' },
        layer: 'foreground',
      }),
    ).toThrow();
  });

  it('rejects zero / negative size dimensions', () => {
    expect(() =>
      DecorationNodeSchema.parse({
        type: 'decoration',
        source: { kind: 'preset', name: 'glow_ring' },
        placement: { anchor: 'middle_center', size: { width: 0, height: 100 } },
        layer: 'background',
      }),
    ).toThrow();
  });

  it('rejects extra fields under placement (strict object)', () => {
    expect(() =>
      DecorationNodeSchema.parse({
        type: 'decoration',
        source: { kind: 'preset', name: 'glow_ring' },
        placement: { anchor: 'middle_center', extra: 1 },
        layer: 'background',
      }),
    ).toThrow();
  });

  it('rejects body / title / text fields on decoration (no text-bearing slots)', () => {
    expect(() =>
      DecorationNodeSchema.parse({
        type: 'decoration',
        source: { kind: 'preset', name: 'glow_ring' },
        placement: { anchor: 'middle_center' },
        layer: 'background',
        body: 'should not be allowed',
      }),
    ).toThrow();
  });

  it('flows through SlideNodeSchema discriminated union', () => {
    const parsed = SlideNodeSchema.parse({
      type: 'decoration',
      source: { kind: 'preset', name: 'corner_bracket' },
      placement: { anchor: 'bottom_right' },
      layer: 'foreground',
    });
    expect(parsed.type).toBe('decoration');
  });

  it('includes all 17 bleed anchor variants in DecorationAnchorSchema', () => {
    const bleedAnchors = DecorationAnchorSchema.options.filter((o) => o.startsWith('bleed_'));
    expect(bleedAnchors).toHaveLength(8);
  });
});

describe('PresetOrnamentNameSchema', () => {
  it('declares exactly the 6 v4.16 presets', () => {
    expect(PresetOrnamentNameSchema.options.sort()).toEqual([
      'chevron_arrow',
      'corner_bracket',
      'glow_ring',
      'grid_dots',
      'noise_overlay',
      'radial_glow',
    ]);
  });
});

describe('ornament registry', () => {
  it('has a definition for every name in PresetOrnamentNameSchema', () => {
    for (const name of PresetOrnamentNameSchema.options) {
      const def = getOrnamentDef(name);
      expect(def.svg).toMatch(/<svg\b/);
      expect(def.svg).toMatch(/viewBox="/);
      expect(def.defaultWidth).toBeGreaterThan(0);
      expect(def.defaultHeight).toBeGreaterThan(0);
    }
  });

  it('listOrnamentNames returns the 6 v4.16 presets', () => {
    expect(listOrnamentNames().sort()).toEqual([
      'chevron_arrow',
      'corner_bracket',
      'glow_ring',
      'grid_dots',
      'noise_overlay',
      'radial_glow',
    ]);
  });

  it('accent-tinted presets use currentColor for stroke/fill', () => {
    for (const name of PresetOrnamentNameSchema.options) {
      const def = getOrnamentDef(name);
      if (def.acceptsAccent) {
        expect(def.svg).toContain('currentColor');
      }
    }
  });
});

describe('ImageNodeSchema with frame extension', () => {
  it('accepts the v4.16 frame variants', () => {
    for (const frame of ImageFrameSchema.options) {
      const parsed = ImageNodeSchema.parse({
        type: 'image',
        asset_id: 'abc',
        frame,
      });
      expect(parsed.frame).toBe(frame);
    }
  });

  it('rejects unknown frame value', () => {
    expect(() =>
      ImageNodeSchema.parse({
        type: 'image',
        asset_id: 'abc',
        frame: 'tablet', // not in the v4.16 list
      }),
    ).toThrow();
  });

  it('frame is optional — pre-v4.16 image nodes still parse', () => {
    const parsed = ImageNodeSchema.parse({ type: 'image', asset_id: 'abc' });
    expect(parsed.frame).toBeUndefined();
  });
});

describe('renderNode — decoration', () => {
  it('preset decoration emits aside with anchor + layer + bleed classes', () => {
    const html = renderNode(
      {
        type: 'decoration',
        source: { kind: 'preset', name: 'glow_ring' },
        placement: { anchor: 'bleed_top_right', size: { width: 480, height: 480 } },
        layer: 'background',
        accent: 'accent',
      },
      ['body', 0],
    );
    expect(html).toContain('class="pengui-decoration pengui-decoration-background');
    expect(html).toContain('pengui-decoration-anchor-bleed-top-right');
    expect(html).toContain('pengui-decoration-bleed');
    expect(html).toContain('pengui-decoration-source-preset');
    expect(html).toContain('pengui-text-accent');
    expect(html).toContain('width:480px');
    expect(html).toContain('height:480px');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('<svg');
  });

  it('asset_ref decoration emits aside with image source', () => {
    const html = renderNode(
      {
        type: 'decoration',
        source: { kind: 'asset_ref', asset_id: 'abc-123' },
        placement: { anchor: 'middle_center' },
        layer: 'foreground',
      },
      ['body', 0],
    );
    expect(html).toContain('pengui-decoration-foreground');
    expect(html).toContain('pengui-decoration-source-asset');
    expect(html).toContain('asset://abc-123');
    expect(html).not.toContain('pengui-decoration-bleed');
  });

  it('non-bleed anchor does not get bleed modifier', () => {
    const html = renderNode(
      {
        type: 'decoration',
        source: { kind: 'preset', name: 'corner_bracket' },
        placement: { anchor: 'bottom_right' },
        layer: 'foreground',
      },
      ['body', 0],
    );
    expect(html).not.toContain('pengui-decoration-bleed');
    expect(html).toContain('pengui-decoration-anchor-bottom-right');
  });

  it('rotation + opacity flow into inline style', () => {
    const html = renderNode(
      {
        type: 'decoration',
        source: { kind: 'preset', name: 'glow_ring' },
        placement: { anchor: 'middle_center', rotation: 45, opacity: 0.5 },
        layer: 'foreground',
      },
      ['body', 0],
    );
    expect(html).toMatch(/transform:rotate\(45deg\)/);
    expect(html).toMatch(/opacity:0\.5/);
  });

  it('offset values flow into CSS custom properties', () => {
    const html = renderNode(
      {
        type: 'decoration',
        source: { kind: 'preset', name: 'glow_ring' },
        placement: { anchor: 'top_left', offset: { x: 64, y: 32 } },
        layer: 'background',
      },
      ['body', 0],
    );
    expect(html).toContain('--pengui-deco-dx:64px');
    expect(html).toContain('--pengui-deco-dy:32px');
  });
});

describe('renderNode — image with frame', () => {
  it('frame=browser wraps img in pengui-frame-browser chrome', () => {
    const html = renderNode(
      {
        type: 'image',
        asset_id: 'shot-1',
        frame: 'browser',
      },
      ['body', 0],
    );
    expect(html).toContain('pengui-image-framed');
    expect(html).toContain('pengui-image-frame-browser');
    expect(html).toContain('pengui-frame pengui-frame-browser');
    expect(html).toContain('pengui-frame-titlebar');
    expect(html).toContain('pengui-frame-dot pengui-frame-dot-close');
    expect(html).toContain('pengui-frame-urlbar');
  });

  it('frame=phone emits status bar + home indicator', () => {
    const html = renderNode(
      { type: 'image', asset_id: 'shot-1', frame: 'phone' },
      ['body', 0],
    );
    expect(html).toContain('pengui-frame pengui-frame-phone');
    expect(html).toContain('pengui-frame-statusbar');
    expect(html).toContain('pengui-frame-home-indicator');
  });

  it('frame=none renders bare img (back-compat)', () => {
    const html = renderNode(
      { type: 'image', asset_id: 'shot-1', frame: 'none' },
      ['body', 0],
    );
    expect(html).not.toContain('pengui-frame-titlebar');
    expect(html).not.toContain('pengui-image-framed');
  });

  it('omitted frame is equivalent to frame=none', () => {
    const html = renderNode({ type: 'image', asset_id: 'shot-1' }, ['body', 0]);
    expect(html).not.toContain('pengui-image-framed');
  });
});
