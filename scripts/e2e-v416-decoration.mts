#!/usr/bin/env -S npx tsx
/**
 * v4.16 E2E — Decoration & assets.
 *
 * Builds a 3-slide deck that exercises every v4.16 affordance:
 *
 *   1. Cover with bleed mark — giant glow_ring at bleed_top_right,
 *      reproducing the PM-Top-Concerns "C" device on a smaller scale.
 *   2. Glow-ring composition — radial_glow background + centered
 *      glow_ring foreground, the Galici slide-3 shield pattern.
 *   3. Framed browser screenshot — image with frame: 'browser'.
 *
 * Then verifies parity by asserting:
 *
 *   A. Slide HTML carries the decoration aside / frame chrome / bleed
 *      modifier classes.
 *   B. SlideDocument inventory includes the decoration as a native
 *      image element with the correct layer-driven zIndex (background
 *      decorations get -50, foreground 10000) and bleed coords are
 *      negative.
 *   C. Editable PPTX:
 *      - Decoration shapes ship as native <p:pic>
 *      - Bleed shape has negative <a:off x> or <a:off y>
 *      - Frame chrome (titlebar, traffic-light dots, urlbar) ships as
 *        native <p:sp> shapes — no slide-wide background fallback
 *
 * Run: `npx tsx scripts/e2e-v416-decoration.mts`
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger } from '../src/infrastructure/logger.js';
import { Clock } from '../src/infrastructure/clock.js';
import { PlaywrightPool } from '../src/domain/rendering/playwright-pool.js';
import { SlideRenderer } from '../src/domain/rendering/slide-renderer.js';
import { PdfExporter } from '../src/domain/rendering/pdf-exporter.js';
import { PptxExporter } from '../src/domain/rendering/pptx-exporter.js';
import { EditablePptxExporter } from '../src/domain/rendering/editable-pptx-exporter.js';
import { SlideDocumentService } from '../src/domain/documents/slide-document-service.js';
import { compileSlideIRToHtml } from '../src/domain/ir/index.js';
import { resolveAssetRefs } from '../src/domain/assets/asset-resolver.js';
import { AssetService } from '../src/domain/assets/asset-service.js';
import { InMemoryAssetStore } from '../src/storage/memory/asset-store.js';
import { generateTokens } from '../src/domain/souls/token-generator.js';
import { buildFontFaceCss } from '../src/domain/souls/font-registry.js';
import { getFormat, DEFAULT_FORMAT } from '../src/domain/formats/format-registry.js';
import type { SlideIR } from '../src/domain/ir/index.js';
import type { Slide } from '../src/types/deck.js';
import type { DeckId, SlideId } from '../src/types/common.js';
import type { SoulLayers, DesignSoul } from '../src/types/design-soul.js';
import { soulId } from '../src/types/common.js';

const LAYERS: SoulLayers = {
  color: {
    canvas: '#0b1020', surface: '#111933', surfaceAlt: '#1a2547', border: '#2a3667',
    textPrimary: '#f5f7ff', textSecondary: '#aab4d6', textTertiary: '#6b7aa6', textInverse: '#0b1020',
    accentPrimary: '#7c5cff', accentSecondary: '#3ec1a6', accentWarm: '#f59e0b',
    success: '#10b981', warning: '#f59e0b', error: '#ef4444', info: '#3b82f6',
  },
  typography: {
    fontDisplay: "'Inter Display', 'Inter', sans-serif",
    fontBody: "'Inter', sans-serif",
    fontMono: "'JetBrains Mono', monospace",
    sizeHero: 84, sizeH1: 48, sizeH2: 36, sizeH3: 28, sizeBody: 18, sizeLabel: 14, sizeCaption: 12,
    weightNormal: 400, weightMedium: 500, weightBold: 700,
    lineHeightHeading: 1.1, lineHeightBody: 1.55,
    letterSpacingHeading: '-0.02em', letterSpacingBody: '0em',
  },
  spacing: { baseUnit: 8, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64, safeAreaInset: 56 },
  shape: {
    none: '0', sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px',
    buttonRadius: '8px', cardRadius: '14px', inputRadius: '6px', badgeRadius: '9999px',
  },
  depth: {
    shadowNone: 'none', shadowSoft: '0 1px 3px rgba(0,0,0,0.25)',
    shadowMedium: '0 4px 12px rgba(0,0,0,0.30)',
    shadowElevated: '0 8px 24px rgba(0,0,0,0.40)',
    shadowInner: 'inset 0 2px 4px rgba(0,0,0,0.20)',
    borderWidth: '1px', borderOpacity: 0.1,
  },
  components: {
    cardPadding: '24px', cardShadow: '0 1px 3px rgba(0,0,0,0.25)', cardBorderWidth: '1px',
    buttonPaddingX: '20px', buttonPaddingY: '10px',
    inputPaddingX: '12px', inputPaddingY: '8px', inputBorderWidth: '1px',
    badgePaddingX: '8px', badgePaddingY: '2px',
  },
  motion: {
    durationFast: '100ms', durationNormal: '200ms', durationSlow: '400ms',
    easingDefault: 'ease', easingEmphasized: 'ease-in',
    northStar: '', doRules: [], dontRules: [],
  },
};

const tokens = generateTokens(LAYERS);
const SOUL: DesignSoul = {
  id: soulId('soul-v416-decoration'),
  slug: 'soul-v416-decoration', name: 'v4.16 Decoration Soul',
  description: '', status: 'approved',
  layers: LAYERS, cssTokens: tokens.cssString,
  tokenNames: tokens.tokenNames, allowedFonts: tokens.allowedFonts,
  utilityCss: '', styleGuide: '',
  createdAt: '2026-05-05T00:00:00.000Z', updatedAt: '2026-05-05T00:00:00.000Z',
};

// A small placeholder PNG that doubles as a "screenshot" for the framed
// browser slide. Solid colored rectangle — content irrelevant for
// structural assertions.
const DUMMY_SCREENSHOT_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAoCAIAAACFOzpsAAAAUklEQVR4nO3OQQ0AAAjEMM6/' +
  'aIb/JT0EYQ4znRgrwAJGAhYwErCAkYAFjAQsYCRgASMBCxgJWMBIwAJGAhYwErCAkYAFjAQs' +
  'YCRgASMBCxiJW6QYAVRytdOTAAAAAElFTkSuQmCC';

async function main(): Promise<void> {
  const outDir = process.env.PENGUI_E2E_OUTDIR ?? resolve(process.cwd(), 'output');
  mkdirSync(outDir, { recursive: true });

  const logger = new Logger('e2e-v416', 'info');
  const clock: Clock = { now: () => new Date().toISOString() };
  const pool = new PlaywrightPool({ headless: true, maxPoolSize: 2 });
  const renderer = new SlideRenderer(pool, logger.child('renderer'));

  const assetStore = new InMemoryAssetStore();
  const assetService = new AssetService(assetStore, clock, logger.child('assets'));
  const screenshotAsset = await assetService.upload({
    name: 'Demo screenshot',
    filename: 'demo.png',
    mimeType: 'image/png',
    scope: 'global',
    role: 'screenshot',
    dataBase64: DUMMY_SCREENSHOT_PNG_B64,
  });

  const COVER_IR: SlideIR = {
    layout: 'centered',
    body: [
      // Background-layer bleed glow_ring at top right — the reference
      // device.
      {
        type: 'decoration',
        source: { kind: 'preset', name: 'glow_ring' },
        placement: { anchor: 'bleed_top_right', size: { width: 720, height: 720 } },
        layer: 'background',
        accent: 'accent',
      },
      {
        type: 'hero', align: 'center',
        eyebrow: [{ text: 'PENGUI v4.16 · DECORATION & ASSETS' }],
        title: [
          { text: 'Brand marks ' },
          { text: 'bleed off-canvas', color: 'accent', bold: true },
          { text: '.' },
        ],
        subtitle: [{ text: 'Decoration nodes · preset ornaments · framed screenshots · v4.16.' }],
      },
    ],
  };

  // Galici slide-3 shield pattern: stacked decorations, both layers.
  const GLOW_IR: SlideIR = {
    body: [
      // Background radial glow fills behind the heading.
      {
        type: 'decoration',
        source: { kind: 'preset', name: 'radial_glow' },
        placement: { anchor: 'middle_center', size: { width: 1200, height: 1200 } },
        layer: 'background',
        accent: 'accent',
      },
      // Foreground glow ring sits centered above the body.
      {
        type: 'decoration',
        source: { kind: 'preset', name: 'glow_ring' },
        placement: { anchor: 'middle_center', size: { width: 520, height: 520 } },
        layer: 'foreground',
        accent: 'accent_alt',
      },
      { type: 'heading', level: 2, text: [{ text: 'A halo around the focal point.' }], align: 'center' },
      { type: 'prose', body: [{ text: 'Background decorations render behind body content; foreground decorations render above. Layer order survives the editable PPTX export.' }], align: 'center' },
    ],
  };

  // Framed browser screenshot — Galici slides 5/8/9 reference.
  const FRAME_IR: SlideIR = {
    body: [
      { type: 'heading', level: 2, text: [
        { text: 'Framed ' },
        { text: 'screenshot', color: 'accent', bold: true },
        { text: '.' },
      ] },
      {
        type: 'image',
        asset_id: screenshotAsset.id as string,
        frame: 'browser',
        caption: [{ text: 'Browser-frame chrome rendered declaratively — no extra raster assets.' }],
      },
      // Corner bracket as foreground accent on the screenshot.
      {
        type: 'decoration',
        source: { kind: 'preset', name: 'corner_bracket' },
        placement: { anchor: 'bottom_right', offset: { x: 32, y: 32 }, size: { width: 96, height: 96 } },
        layer: 'foreground',
        accent: 'accent_warm',
      },
    ],
  };

  const SLIDES_AUTHORED = [
    { id: 'slide-cover', ir: COVER_IR, title: 'Cover with bleed mark' },
    { id: 'slide-glow', ir: GLOW_IR, title: 'Glow ring composition' },
    { id: 'slide-frame', ir: FRAME_IR, title: 'Framed browser screenshot' },
  ];
  const totalCount = SLIDES_AUTHORED.length;
  const FONT_FACE_CSS = buildFontFaceCss(SOUL);

  async function buildSlide(idx: number): Promise<Slide> {
    const { id, ir, title } = SLIDES_AUTHORED[idx];
    const geometry = getFormat(DEFAULT_FORMAT).geometry;
    const raw = compileSlideIRToHtml({ ir, soul: SOUL, geometry, fontFaceCss: FONT_FACE_CSS });
    const html = await resolveAssetRefs(raw, assetService);
    return {
      id: id as SlideId, deckId: 'deck-v416-decoration' as DeckId,
      position: idx, ir, html, sourceKind: 'authored_ir',
      metadata: {
        title, type: 'content', narrative: '',
        keyPoints: [], dataPoints: [], tags: [],
        generatedAt: new Date().toISOString(),
        soulId: SOUL.id as string, deckId: 'deck-v416-decoration',
        position: idx, metaVersion: '1.0', revisionHash: 'rev-' + id,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const slides: Slide[] = [];
  for (let i = 0; i < totalCount; i++) slides.push(await buildSlide(i));

  // ── A. HTML structural assertions ────────────────────────────
  console.log('[step] slide HTML structural assertions');
  if (!/pengui-decoration pengui-decoration-background/.test(slides[0].html)) {
    throw new Error('cover: background decoration class missing');
  }
  if (!/pengui-decoration-bleed/.test(slides[0].html)) {
    throw new Error('cover: bleed modifier class missing on bleed_top_right decoration');
  }
  if (!/pengui-decoration-anchor-bleed-top-right/.test(slides[0].html)) {
    throw new Error('cover: bleed anchor class missing');
  }
  if (!/pengui-decoration-foreground/.test(slides[1].html)) {
    throw new Error('glow slide: foreground decoration class missing');
  }
  if (!/pengui-frame pengui-frame-browser/.test(slides[2].html)) {
    throw new Error('frame slide: browser frame chrome missing');
  }
  if (!/pengui-frame-titlebar/.test(slides[2].html) || !/pengui-frame-urlbar/.test(slides[2].html)) {
    throw new Error('frame slide: browser frame chrome parts missing');
  }
  console.log('[ok] HTML structural assertions');

  // ── B. SlideDocument inventory + zIndex + bleed coords ───────
  console.log('[step] SlideDocument inventory + zIndex + bleed coords');
  const slideDocService = new SlideDocumentService(logger.child('slide-doc'), true);
  const editableSlides: Slide[] = [];
  for (const slide of slides) {
    const result = await slideDocService.compileSlideHtml(slide.html, slide.metadata.revisionHash);
    editableSlides.push({
      ...slide, document: result.document, sourceKind: 'authored_ir',
      translationIssues: result.translationIssues,
    });
  }

  // Cover: must contain a decoration with negative x or y AND zIndex <= -50
  const coverDoc = editableSlides[0].document!;
  const coverImageEls = coverDoc.elements.filter((el) => el.kind === 'image');
  const bleedDeco = coverImageEls.find((el) => (el.x < 0 || el.y < 0) && el.zIndex !== undefined && el.zIndex <= -50);
  if (!bleedDeco) {
    throw new Error(`cover: no decoration with negative coords + zIndex <= -50. Got: ${JSON.stringify(coverImageEls.map((e) => ({ x: e.x, y: e.y, z: e.zIndex })))}`);
  }
  console.log(`[ok] cover bleed decoration: x=${bleedDeco.x} y=${bleedDeco.y} zIndex=${bleedDeco.zIndex} (negative coords + bg layer zIndex)`);

  // Glow slide: must have a foreground decoration (zIndex 10000) AND a background decoration (zIndex -50)
  const glowDoc = editableSlides[1].document!;
  const glowImages = glowDoc.elements.filter((el) => el.kind === 'image');
  const fgDeco = glowImages.find((el) => el.zIndex !== undefined && el.zIndex >= 10000);
  const bgDeco = glowImages.find((el) => el.zIndex !== undefined && el.zIndex <= -50);
  if (!fgDeco) throw new Error('glow slide: no foreground decoration with zIndex >= 10000');
  if (!bgDeco) throw new Error('glow slide: no background decoration with zIndex <= -50');
  console.log(`[ok] glow slide: bg zIndex=${bgDeco.zIndex}, fg zIndex=${fgDeco.zIndex}`);

  // Frame slide: must have at least 4 native shape elements in the frame
  // chrome region (titlebar, 3 traffic-light dots, urlbar — many shapes)
  const frameDoc = editableSlides[2].document!;
  const frameShapes = frameDoc.elements.filter((el) => el.kind === 'shape' && (el.exportDisposition ?? 'native') === 'native');
  if (frameShapes.length < 4) {
    throw new Error(`frame slide: expected ≥4 native chrome shapes, got ${frameShapes.length}`);
  }
  console.log(`[ok] frame slide: ${frameShapes.length} native chrome shapes`);

  // ── C. Export all three formats ──────────────────────────────
  console.log('\n[step] export PDF + image PPTX + editable PPTX');
  const pdfExporter = new PdfExporter(renderer, pool, logger.child('pdf'));
  const pdf = await pdfExporter.export(slides, 'Pengui v4.16 Decoration');
  const pdfPath = resolve(outDir, pdf.filename);
  writeFileSync(pdfPath, pdf.data);
  console.log(`[ok] PDF: ${pdfPath} (${pdf.fileSizeBytes} bytes)`);

  const pptxExporter = new PptxExporter(renderer, logger.child('pptx'));
  const pptx = await pptxExporter.export(slides, 'Pengui v4.16 Decoration');
  const pptxPath = resolve(outDir, pptx.filename);
  writeFileSync(pptxPath, pptx.data);
  console.log(`[ok] Static PPTX: ${pptxPath} (${pptx.fileSizeBytes} bytes)`);

  const editableExporter = new EditablePptxExporter(renderer, logger.child('pptx-editable'));
  const ePptx = await editableExporter.export(editableSlides, 'Pengui v4.16 Decoration Editable');
  const ePptxPath = resolve(outDir, ePptx.filename);
  writeFileSync(ePptxPath, ePptx.data);
  console.log(`[ok] Editable PPTX: ${ePptxPath} (${ePptx.fileSizeBytes} bytes)`);

  console.log('\n[step] per-slide hybrid mode report');
  for (const s of ePptx.slides) {
    console.log(`  ${s.slideId}: mode=${s.mode} native=${s.nativeObjectCount} bgFallback=${s.usedBackgroundFallback}`);
  }
  // Parity assertion — every slide native_only.
  const slidesWithFallback = ePptx.slides.filter((s) => s.usedBackgroundFallback);
  if (slidesWithFallback.length > 0) {
    throw new Error(`Parity violation: ${slidesWithFallback.length} slide(s) used background fallback: ${slidesWithFallback.map((s) => s.slideId).join(', ')}`);
  }
  console.log('[ok] every slide ships as native_only — full v4.14.6+ parity preserved');

  // ── D. OOXML structural assertions on the editable PPTX ──────
  console.log('\n[step] editable PPTX XML assertions');
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(ePptx.data);

  // Cover slide: at least one <p:pic> with a negative <a:off x or y>
  const coverXml = await zip.file('ppt/slides/slide1.xml')!.async('string');
  // pptxgenjs writes <a:off x="N" y="N"/> with EMU values
  const negOffMatch = coverXml.match(/<a:off\s+x="-\d+"|<a:off\s+x="\d+"\s+y="-\d+"/);
  if (!negOffMatch) {
    throw new Error('cover slide XML: no negative <a:off x= or y=> for bleed decoration');
  }
  console.log(`[ok] cover slide carries negative <a:off> for bleed decoration: ${negOffMatch[0]}`);

  // Cover should have at least one <p:pic> (the decoration as an image)
  const coverPics = (coverXml.match(/<p:pic\b/g) ?? []).length;
  if (coverPics < 1) {
    throw new Error(`cover slide expected ≥1 <p:pic> for decoration, got ${coverPics}`);
  }
  console.log(`[ok] cover slide: ${coverPics} <p:pic> elements (decoration is native)`);

  // Frame slide: must have multiple native shapes
  const frameXml = await zip.file('ppt/slides/slide3.xml')!.async('string');
  const frameXmlPics = (frameXml.match(/<p:pic\b/g) ?? []).length;
  const frameXmlShapes = (frameXml.match(/<p:sp\b/g) ?? []).length;
  if (frameXmlPics < 1) {
    throw new Error(`frame slide expected ≥1 <p:pic> (the screenshot), got ${frameXmlPics}`);
  }
  if (frameXmlShapes < 4) {
    throw new Error(`frame slide expected ≥4 <p:sp> chrome shapes, got ${frameXmlShapes}`);
  }
  console.log(`[ok] frame slide: ${frameXmlPics} <p:pic> + ${frameXmlShapes} <p:sp> (screenshot + browser chrome native)`);

  console.log('\n[done] v4.16 decoration & assets verified end-to-end. Outputs in', outDir);

  await pool.shutdown();
}

main().catch((err) => {
  console.error('[fail]', err);
  process.exit(1);
});
