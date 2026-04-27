import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EditablePptxExporter } from '../../../../src/domain/rendering/editable-pptx-exporter.js';
import { Logger } from '../../../../src/infrastructure/logger.js';
import type { Slide } from '../../../../src/types/deck.js';
import type { DesignSoul } from '../../../../src/types/design-soul.js';

const tempDirs: string[] = [];

function makeSoul(): DesignSoul {
  return {
    id: 'soul-1' as never,
    name: 'Test Soul',
    description: 'desc',
    status: 'approved',
    layers: {
      color: {
        canvas: '#101010',
        surface: '#1A1A1A',
        surfaceAlt: '#222222',
        border: '#333333',
        textPrimary: '#F5F5F5',
        textSecondary: '#CCCCCC',
        textTertiary: '#999999',
        textInverse: '#101010',
        accentPrimary: '#FF5533',
        accentSecondary: '#44AACC',
        accentWarm: '#CC7755',
        success: '#44AA44',
        warning: '#CCAA44',
        error: '#CC4444',
        info: '#4466CC',
      },
      typography: {
        fontDisplay: 'Georgia, serif',
        fontBody: 'Arial, sans-serif',
        fontMono: 'Courier New, monospace',
        sizeHero: 72,
        sizeH1: 48,
        sizeH2: 36,
        sizeH3: 28,
        sizeBody: 18,
        sizeLabel: 14,
        sizeCaption: 12,
        weightNormal: 400,
        weightMedium: 500,
        weightBold: 700,
        lineHeightHeading: 1.1,
        lineHeightBody: 1.5,
        letterSpacingHeading: '-0.02em',
        letterSpacingBody: '0em',
      },
      spacing: { baseUnit: 8, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64, safeAreaInset: 48 },
      shape: {
        none: '0px',
        sm: '8px',
        md: '12px',
        lg: '18px',
        xl: '24px',
        full: '9999px',
        buttonRadius: '12px',
        cardRadius: '18px',
        inputRadius: '12px',
        badgeRadius: '9999px',
      },
      depth: {
        shadowNone: 'none',
        shadowSoft: '0 2px 16px rgba(0,0,0,0.15)',
        shadowMedium: '0 4px 24px rgba(0,0,0,0.2)',
        shadowElevated: '0 8px 32px rgba(0,0,0,0.24)',
        shadowInner: 'inset 0 1px 2px rgba(0,0,0,0.15)',
        borderWidth: '1px',
        borderOpacity: 0.25,
      },
      components: {
        cardPadding: '24px',
        cardShadow: '0 4px 24px rgba(0,0,0,0.2)',
        cardBorderWidth: '1px',
        buttonPaddingX: '20px',
        buttonPaddingY: '12px',
        inputPaddingX: '16px',
        inputPaddingY: '12px',
        inputBorderWidth: '1px',
        badgePaddingX: '12px',
        badgePaddingY: '8px',
      },
      motion: {
        durationFast: '100ms',
        durationNormal: '250ms',
        durationSlow: '400ms',
        easingDefault: 'ease',
        easingEmphasized: 'ease-out',
        northStar: 'Test',
        doRules: [],
        dontRules: [],
      },
    },
    cssTokens: '',
    tokenNames: [],
    allowedFonts: [],
    utilityCss: '',
    styleGuide: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
  };
}

function makeSlide(): Slide {
  return {
    id: 'slide-1' as never,
    deckId: 'deck-1' as never,
    position: 0,
    html: '<!DOCTYPE html><html><head></head><body><div class="slide"><div data-edit-id="title">Hello editable world</div></div></body></html>',
    sourceKind: 'document_v1',
    translationIssues: [],
    document: {
      version: '1',
      sourceRevisionHash: 'rev-1',
      width: 1920,
      height: 1080,
      backgroundColor: '#111111',
      backgroundImage: 'linear-gradient(#111111, #222222)',
      elements: [
        {
          id: 'title',
          kind: 'text',
          x: 160,
          y: 180,
          width: 600,
          height: 90,
          rotation: 0,
          zIndex: 1,
          opacity: 1,
          locked: false,
          exportDisposition: 'native',
          selector: 'h1.hero',
          text: 'Hello editable world',
          paragraphs: [{ text: 'Hello editable world', runs: [{ text: 'Hello editable world', bold: true }] }],
          editId: 'title',
          style: {
            color: '#F5F5F5',
            fontFamily: 'Arial, sans-serif',
            fontSize: 42,
            fontWeight: 700,
          },
        },
      ],
    },
    metadata: {
      title: 'Editable Slide',
      type: 'content',
      narrative: 'Narrative',
      keyPoints: [],
      dataPoints: [],
      tags: [],
      generatedAt: new Date().toISOString(),
      soulId: 'soul-1',
      deckId: 'deck-1',
      position: 0,
      metaVersion: '1.0',
      revisionHash: 'rev-1',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe('EditablePptxExporter', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('emits a PPTX with native text, notes, theme, and background media', async () => {
    const renderer = {
      render: vi.fn().mockResolvedValue({
        slideId: 'slide-1-background',
        imageData: Buffer.from('png-background'),
        format: 'png',
        width: 1920,
        height: 1080,
        renderTimeMs: 5,
      }),
    };
    const soulService = {
      get: vi.fn().mockResolvedValue({ soul: makeSoul() }),
    };
    const exporter = new EditablePptxExporter(
      renderer as never,
      new Logger('test', 'error'),
      soulService as never,
    );

    const result = await exporter.export([makeSlide()], 'Editable Deck', 'soul-1');
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'pengui-pptx-'));
    tempDirs.push(tempDir);
    const pptxPath = path.join(tempDir, result.filename);
    writeFileSync(pptxPath, result.data);

    const zipEntries = execFileSync('unzip', ['-Z1', pptxPath], { encoding: 'utf8' });
    const slideXml = execFileSync('unzip', ['-p', pptxPath, 'ppt/slides/slide1.xml'], { encoding: 'utf8' });
    const notesXml = execFileSync('unzip', ['-p', pptxPath, 'ppt/notesSlides/notesSlide1.xml'], { encoding: 'utf8' });
    const themeXml = execFileSync('unzip', ['-p', pptxPath, 'ppt/theme/theme1.xml'], { encoding: 'utf8' });

    expect(result.mode).toBe('editable_hybrid');
    expect(result.slides[0]).toEqual({
      slideId: 'slide-1',
      title: 'Editable Slide',
      mode: 'hybrid_background',
      nativeObjectCount: 1,
      usedBackgroundFallback: true,
    });
    expect(renderer.render).toHaveBeenCalled();
    expect(zipEntries).toContain('ppt/media/image-1-1.png');
    expect(slideXml).toContain('Hello editable world');
    expect(notesXml).toContain('Editable Slide');
    expect(themeXml).toContain('Georgia');
    expect(themeXml).toContain('Arial');

    // Regression: pptxgenjs 3.12.0 emits one Override per slide for
    // slideMasterN.xml even though only slideMaster1.xml exists, which makes
    // PowerPoint flag the file with "found a problem with content". Our
    // post-process removes overrides whose target file is missing.
    // Bracket-literal name; must escape the glob metachars when invoking unzip.
    const contentTypes = execFileSync('unzip', ['-p', pptxPath, '\\[Content_Types\\].xml'], { encoding: 'utf8' });
    const slideMasterOverrides = (contentTypes.match(/PartName="\/ppt\/slideMasters\/slideMaster\d+\.xml"/g) || []);
    const archiveListing = execFileSync('unzip', ['-Z1', pptxPath], { encoding: 'utf8' });
    const slideMasterFiles = (archiveListing.match(/ppt\/slideMasters\/slideMaster\d+\.xml$/gm) || []);
    expect(slideMasterOverrides).toHaveLength(slideMasterFiles.length);
  });

  it('emits one <a:pPr> per paragraph even when the paragraph has multiple runs', async () => {
    // Regression: pptxgenjs 3.12.0 emits a fresh <a:pPr> for every text run
    // inside <a:p> (pptxgen.cjs.js:6230). OOXML allows ONE pPr per
    // paragraph; multi-run paragraphs (e.g. a heading with one black + one
    // accent-colored span) end up with N copies of identical pPr blocks,
    // which PowerPoint flags on open as "found a problem with content".
    // Our post-process collapses duplicates per <a:p>.
    const renderer = { render: vi.fn() };
    const exporter = new EditablePptxExporter(
      renderer as never,
      new Logger('test', 'error'),
    );
    const slide = makeSlide();
    slide.document!.backgroundImage = undefined;
    slide.document!.elements = [
      {
        id: 'multi-run',
        kind: 'text',
        x: 100,
        y: 100,
        width: 800,
        height: 90,
        rotation: 0,
        zIndex: 1,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
        selector: 'h1.title',
        text: 'The Art of Coffee Brewing',
        paragraphs: [
          {
            text: 'The Art of Coffee Brewing',
            runs: [
              { text: 'The Art of ', color: '#2C2825', bold: true },
              { text: 'Coffee Brewing', color: '#5B9E8F', bold: true },
            ],
          },
        ],
        style: { color: '#2C2825', fontFamily: 'Inter', fontSize: 42 },
      },
    ];

    const result = await exporter.export([slide], 'Multi Run Deck');
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'pengui-pptx-multirun-'));
    tempDirs.push(tempDir);
    const pptxPath = path.join(tempDir, result.filename);
    writeFileSync(pptxPath, result.data);

    const slideXml = execFileSync('unzip', ['-p', pptxPath, 'ppt/slides/slide1.xml'], { encoding: 'utf8' });

    // Both runs preserved.
    expect(slideXml).toContain('The Art of ');
    expect(slideXml).toContain('Coffee Brewing');

    // Each <a:p> contains at most one <a:pPr> block.
    const paragraphs = slideXml.match(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/g) ?? [];
    for (const para of paragraphs) {
      const pPrCount = (para.match(/<a:pPr\b/g) ?? []).length;
      expect(pPrCount).toBeLessThanOrEqual(1);
    }
    expect(paragraphs.length).toBeGreaterThan(0);
  });

  it('emulates top-only borders as dedicated shapes instead of full outlines', async () => {
    const renderer = {
      render: vi.fn(),
    };
    const exporter = new EditablePptxExporter(
      renderer as never,
      new Logger('test', 'error'),
    );
    const slide = makeSlide();
    slide.document!.backgroundImage = undefined;
    slide.document!.elements = [
      {
        id: 'top-rule',
        kind: 'shape',
        x: 120,
        y: 140,
        width: 640,
        height: 24,
        rotation: 0,
        zIndex: 0,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
        selector: 'div.rule',
        shapeType: 'rectangle',
        style: {
          backgroundColor: 'transparent',
          borderColor: '#FF5533',
          borderWidth: 4,
          borderStyle: 'solid none none',
        },
      },
    ];

    const result = await exporter.export([slide], 'Top Rule Deck');
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'pengui-pptx-'));
    tempDirs.push(tempDir);
    const pptxPath = path.join(tempDir, result.filename);
    writeFileSync(pptxPath, result.data);

    const slideXml = execFileSync('unzip', ['-p', pptxPath, 'ppt/slides/slide1.xml'], { encoding: 'utf8' });

    expect(renderer.render).not.toHaveBeenCalled();
    expect(result.slides[0].mode).toBe('native_only');
    expect(slideXml).toContain('top-rule_top_border');
    expect(slideXml).not.toContain('top-rule"');
  });

  it('scales document coordinates into the standard widescreen PPT canvas', async () => {
    const renderer = {
      render: vi.fn(),
    };
    const exporter = new EditablePptxExporter(
      renderer as never,
      new Logger('test', 'error'),
    );
    const slide = makeSlide();
    slide.document!.backgroundImage = undefined;
    slide.document!.elements = [
      {
        id: 'full-canvas',
        kind: 'shape',
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        rotation: 0,
        zIndex: 0,
        opacity: 1,
        locked: false,
        exportDisposition: 'native',
        selector: 'div.canvas',
        shapeType: 'rectangle',
        style: {
          backgroundColor: '#222222',
        },
      },
    ];

    const result = await exporter.export([slide], 'Scaled Deck');
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'pengui-pptx-'));
    tempDirs.push(tempDir);
    const pptxPath = path.join(tempDir, result.filename);
    writeFileSync(pptxPath, result.data);

    const slideXml = execFileSync('unzip', ['-p', pptxPath, 'ppt/slides/slide1.xml'], { encoding: 'utf8' });
    const extents = Array.from(
      slideXml.matchAll(/<a:ext cx="(\d+)" cy="(\d+)"\/>/g),
      (match) => ({ cx: Number(match[1]), cy: Number(match[2]) }),
    );

    expect(extents.some((extent) => (
      extent.cx > 12_000_000
      && extent.cx < 13_000_000
      && extent.cy > 6_700_000
      && extent.cy < 6_900_000
    ))).toBe(true);
  });
});
