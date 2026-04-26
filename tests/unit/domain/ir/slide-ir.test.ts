import { describe, it, expect } from 'vitest';
import {
  SlideIRSchema,
  SectionIRSchema,
} from '../../../../src/domain/ir/slide-ir.js';
import { rt } from '../../../../src/domain/ir/rich-text.js';

describe('SlideIRSchema', () => {
  it('accepts the minimum (body only)', () => {
    expect(() => SlideIRSchema.parse({ body: [] })).not.toThrow();
  });

  it('accepts a typical multi-node body', () => {
    const ir = {
      layout: 'default',
      background: 'canvas',
      body: [
        { type: 'hero', title: rt('Q3 Review'), eyebrow: rt('FY25') },
        { type: 'prose', body: rt('Highlights below.') },
        {
          type: 'two_column',
          ratio: '1:1',
          left: [{ type: 'image', asset_id: 'logo-x' }],
          right: [{ type: 'callout', kind: 'tip', body: rt('Note') }],
        },
      ],
    };
    expect(() => SlideIRSchema.parse(ir)).not.toThrow();
  });

  it('rejects unknown layout values', () => {
    expect(() => SlideIRSchema.parse({ layout: 'magic', body: [] })).toThrow();
  });

  it('rejects unknown background values', () => {
    expect(() => SlideIRSchema.parse({ background: 'sparkle', body: [] })).toThrow();
  });

  it('rejects unknown top-level fields', () => {
    expect(() => SlideIRSchema.parse({ body: [], extra: true })).toThrow();
  });

  it('rejects when body contains an invalid node', () => {
    expect(() =>
      SlideIRSchema.parse({ body: [{ type: 'hero' /* missing title */ }] }),
    ).toThrow();
  });
});

describe('SectionIRSchema', () => {
  it('shares the same node grammar as SlideIRSchema', () => {
    const ir = {
      body: [
        { type: 'hero', title: rt('Chapter 1') },
        { type: 'prose', body: rt('Opening paragraph.') },
      ],
    };
    expect(() => SectionIRSchema.parse(ir)).not.toThrow();
  });

  it('rejects unknown background values', () => {
    expect(() => SectionIRSchema.parse({ background: 'rainbow', body: [] })).toThrow();
  });
});
