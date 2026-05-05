#!/usr/bin/env -S npx tsx
/**
 * v4.14.5 E2E — verify the editable PPTX picks up the v4.14.5 hybrid
 * fixes by re-running the v4.14 deck and parsing the resulting slide
 * XMLs structurally (not just trusting the exporter's self-report).
 *
 * Three things must show up that pre-v4.14.5 were missing:
 *   1. Chrome logos: 2 native <p:pic> shapes per non-cover slide
 *      (they were getting flattened into the background image because
 *      data: URIs were dispositioned as 'background').
 *   2. Card icons: 1 native <p:pic> per card (inline <svg>s now serialize
 *      and emit as data:image/svg+xml images).
 *   3. Card accent top-border: 1 extra native rect per card with the
 *      accent color as fill (the v4.13 colored top-border that the
 *      single-value border heuristic used to drop).
 *
 * Run: `npx tsx scripts/e2e-v4145-hybrid.mts`
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
import { buildFontFaceCss } from '../src/domain/souls/font-registry.js';
import { resolveAssetRefs } from '../src/domain/assets/asset-resolver.js';
import { AssetService } from '../src/domain/assets/asset-service.js';
import { InMemoryAssetStore } from '../src/storage/memory/asset-store.js';
import { generateTokens } from '../src/domain/souls/token-generator.js';
import { getFormat, DEFAULT_FORMAT } from '../src/domain/formats/format-registry.js';
import type { SlideIR, DeckChrome } from '../src/domain/ir/index.js';
import type { Slide } from '../src/types/deck.js';
import type { DeckId, SlideId } from '../src/types/common.js';
import type { SoulLayers, DesignSoul } from '../src/types/design-soul.js';
import { soulId } from '../src/types/common.js';

const LAYERS: SoulLayers = {
  color: {
    canvas: '#ffffff', surface: '#f7f9fc', surfaceAlt: '#eef2f7', border: '#dde3ec',
    textPrimary: '#0f172a', textSecondary: '#475569', textTertiary: '#94a3b8', textInverse: '#ffffff',
    accentPrimary: '#5b8def', accentSecondary: '#3ec1a6', accentWarm: '#f59e0b',
    success: '#10b981', warning: '#f59e0b', error: '#ef4444', info: '#3b82f6',
  },
  typography: {
    fontDisplay: "'Inter', sans-serif", fontBody: "'Inter', sans-serif", fontMono: "'JetBrains Mono', monospace",
    sizeHero: 72, sizeH1: 48, sizeH2: 36, sizeH3: 28, sizeBody: 18, sizeLabel: 14, sizeCaption: 12,
    weightNormal: 400, weightMedium: 500, weightBold: 700,
    lineHeightHeading: 1.15, lineHeightBody: 1.55,
    letterSpacingHeading: '-0.02em', letterSpacingBody: '0em',
  },
  spacing: { baseUnit: 8, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64, safeAreaInset: 56 },
  shape: {
    none: '0', sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px',
    buttonRadius: '8px', cardRadius: '14px', inputRadius: '6px', badgeRadius: '9999px',
  },
  depth: {
    shadowNone: 'none', shadowSoft: '0 1px 3px rgba(15,23,42,0.06)',
    shadowMedium: '0 4px 12px rgba(15,23,42,0.10)',
    shadowElevated: '0 8px 24px rgba(15,23,42,0.14)',
    shadowInner: 'inset 0 2px 4px rgba(0,0,0,0.05)',
    borderWidth: '1px', borderOpacity: 0.1,
  },
  components: {
    cardPadding: '24px', cardShadow: '0 1px 3px rgba(15,23,42,0.06)', cardBorderWidth: '1px',
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
  id: soulId('soul-v4145-e2e'),
  slug: 'soul-v4145-e2e',
  name: 'v4.14.5 E2E Soul',
  description: '',
  status: 'approved',
  layers: LAYERS,
  cssTokens: tokens.cssString,
  tokenNames: tokens.tokenNames,
  allowedFonts: tokens.allowedFonts,
  utilityCss: '',
  styleGuide: '',
  createdAt: '2026-05-05T00:00:00.000Z',
  updatedAt: '2026-05-05T00:00:00.000Z',
};

const CLEAR_TECH_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 32" width="120" height="32">
  <circle cx="16" cy="16" r="14" fill="#0f172a"/>
  <text x="16" y="22" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="18" font-weight="800" fill="#ffffff">C</text>
  <text x="38" y="21" font-family="Helvetica,Arial,sans-serif" font-size="14" font-weight="700" fill="#0f172a" letter-spacing="2">CLEAR TECH</text>
</svg>`;

const GALICIA_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 32" width="120" height="32">
  <rect x="2" y="4" width="28" height="24" rx="4" fill="#f97316"/>
  <text x="16" y="22" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="18" font-weight="800" fill="#ffffff">G</text>
  <text x="38" y="22" font-family="Helvetica,Arial,sans-serif" font-size="16" font-weight="700" fill="#0f172a">Galicia</text>
</svg>`;

async function main(): Promise<void> {
  const outDir = process.env.PENGUI_E2E_OUTDIR ?? resolve(process.cwd(), 'output');
  mkdirSync(outDir, { recursive: true });

  const logger = new Logger('e2e-v4145', 'info');
  const clock: Clock = { now: () => new Date().toISOString() };
  const pool = new PlaywrightPool({ headless: true, maxPoolSize: 2 });
  const renderer = new SlideRenderer(pool, logger.child('renderer'));

  const assetStore = new InMemoryAssetStore();
  const assetService = new AssetService(assetStore, clock, logger.child('assets'));
  const clearLogo = await assetService.upload({
    name: 'Clear Tech logo', filename: 'clear-tech.svg',
    mimeType: 'image/svg+xml', scope: 'global', role: 'logo',
    dataBase64: Buffer.from(CLEAR_TECH_LOGO_SVG, 'utf8').toString('base64'),
  });
  const galiciaLogo = await assetService.upload({
    name: 'Galicia logo', filename: 'galicia.svg',
    mimeType: 'image/svg+xml', scope: 'global', role: 'logo',
    dataBase64: Buffer.from(GALICIA_LOGO_SVG, 'utf8').toString('base64'),
  });

  const CHROME: DeckChrome = {
    header: {
      left: { kind: 'logo', asset_id: clearLogo.id as string, height: 'md' },
      right: { kind: 'logo', asset_id: galiciaLogo.id as string, height: 'md' },
    },
    footer: {
      left: { kind: 'text', content: [{ text: 'Pengui v4.14.5 · MAYO 2026' }] },
      right: { kind: 'page_number', format: '1/N' },
    },
    showOnCover: false,
  };

  const COVER_IR: SlideIR = {
    layout: 'centered',
    body: [{
      type: 'hero', align: 'center',
      eyebrow: [{ text: 'EDITABLE QUALITY DEMO · MAYO 2026' }],
      title: [
        { text: 'Editable PPTX with ' },
        { text: 'native chrome + icons', color: 'success', bold: true },
        { text: '.' },
      ],
      subtitle: [{ text: 'v4.14.5 hybrid fix.' }],
    }],
  };

  const CONTENT_IR: SlideIR = {
    body: [
      { type: 'heading', level: 2, text: [{ text: 'Content slide with chrome (logos must be native).' }] },
      { type: 'prose', body: [{ text: 'If you open this slide in PowerPoint, the two header logos should be native <p:pic> shapes you can select and move — not baked into the background image.' }] },
    ],
  };

  const CARDS_IR: SlideIR = {
    body: [
      { type: 'heading', level: 2, text: [{ text: 'Cards with native icons + accent rects.' }] },
      {
        type: 'grid', columns: 3, gap: 'md',
        cells: [
          [{
            type: 'card', accent: 'info', icon: 'layers',
            eyebrow: [{ text: '01 · TRACEABILITY' }],
            body: [
              { type: 'heading', level: 4, text: [{ text: 'Fragmented control' }] },
              { type: 'prose', body: [{ text: 'Files and accounts are not systematically audited end-to-end.' }] },
            ],
          }],
          [{
            type: 'card', accent: 'success', icon: 'check',
            eyebrow: [{ text: '02 · SECURITY' }],
            body: [
              { type: 'heading', level: 4, text: [{ text: 'Formal authorization' }] },
              { type: 'prose', body: [{ text: 'Every movement carries a digital signature trail.' }] },
            ],
          }],
          [{
            type: 'card', accent: 'accent_warm', icon: 'gauge',
            eyebrow: [{ text: '03 · OPTIMIZATION' }],
            body: [
              { type: 'heading', level: 4, text: [{ text: 'Idle funds' }] },
              { type: 'prose', body: [{ text: 'Immobilized capital lacks systematic short-term investment.' }] },
            ],
          }],
        ],
      },
    ],
  };

  // ── Build slides ───────────────────────────────────────────
  const SLIDES_AUTHORED = [
    { id: 'slide-cover',   ir: COVER_IR,   title: 'Cover (chrome hidden)' },
    { id: 'slide-content', ir: CONTENT_IR, title: 'Content with chrome' },
    { id: 'slide-cards',   ir: CARDS_IR,   title: 'Cards with chrome' },
  ];
  const totalCount = SLIDES_AUTHORED.length;

  async function buildSlide(idx: number): Promise<Slide> {
    const { id, ir, title } = SLIDES_AUTHORED[idx];
    const geometry = getFormat(DEFAULT_FORMAT).geometry;
    const isCover = idx === 0;
    const chromeArgs =
      CHROME.showOnCover === true || !isCover
        ? { chrome: CHROME, slidePosition: idx + 1, slideCount: totalCount }
        : {};
    const raw = compileSlideIRToHtml({ ir, soul: SOUL, geometry, fontFaceCss: buildFontFaceCss(SOUL), ...chromeArgs });
    const html = await resolveAssetRefs(raw, assetService);
    return {
      id: id as SlideId,
      deckId: 'deck-v4145-e2e' as DeckId,
      position: idx, ir, html, sourceKind: 'authored_ir',
      metadata: {
        title, type: 'content', narrative: '',
        keyPoints: [], dataPoints: [], tags: [],
        generatedAt: new Date().toISOString(),
        soulId: SOUL.id as string, deckId: 'deck-v4145-e2e',
        position: idx, metaVersion: '1.0', revisionHash: 'rev-' + id,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const slides: Slide[] = [];
  for (let i = 0; i < totalCount; i++) slides.push(await buildSlide(i));

  // ── Compile to slide documents ─────────────────────────────
  const slideDocService = new SlideDocumentService(logger.child('slide-doc'), true);
  const editableSlides: Slide[] = [];
  for (const slide of slides) {
    const result = await slideDocService.compileSlideHtml(slide.html, slide.metadata.revisionHash);
    editableSlides.push({
      ...slide,
      document: result.document,
      sourceKind: 'authored_ir',
      translationIssues: result.translationIssues,
    });
  }

  // ── In-memory inspection: assert SlideDocument has the new shapes ─
  // Cover: 0 image elements expected (no chrome, no icons)
  // Content (slide 2): 2 image elements (chrome logos)
  // Cards (slide 3): 2 logos + 3 card-icon images = 5 images, plus
  //   3 accent-border rects on top of 3 card base rects
  function countByKind(doc: NonNullable<Slide['document']>) {
    const counts: Record<string, number> = { image: 0, shape: 0, text: 0, table: 0, group: 0 };
    for (const el of doc.elements) {
      if (el.exportDisposition === 'background') continue; // background-only doesn't count
      counts[el.kind] = (counts[el.kind] ?? 0) + 1;
    }
    return counts;
  }
  const coverCounts = countByKind(editableSlides[0].document!);
  const contentCounts = countByKind(editableSlides[1].document!);
  const cardsCounts = countByKind(editableSlides[2].document!);
  console.log('[doc] cover counts:', coverCounts);
  console.log('[doc] content counts:', contentCounts);
  console.log('[doc] cards counts:', cardsCounts);

  if (coverCounts.image !== 0) {
    throw new Error(`cover: expected 0 native images, got ${coverCounts.image}`);
  }
  if (contentCounts.image < 2) {
    throw new Error(`content: expected ≥2 native images (chrome logos), got ${contentCounts.image}`);
  }
  if (cardsCounts.image < 5) {
    throw new Error(`cards: expected ≥5 native images (2 chrome logos + 3 card icons), got ${cardsCounts.image}`);
  }
  // Cards should now have accent border rects — at least 3 (one per card)
  const cardsAccentRects = editableSlides[2].document!.elements.filter(
    (el) => el.id.endsWith('_accent_border'),
  );
  if (cardsAccentRects.length < 3) {
    throw new Error(`cards: expected ≥3 accent-border rects, got ${cardsAccentRects.length}`);
  }
  console.log(`[ok] SlideDocument shape inventory: chrome logos + card icons + accent rects all present`);
  console.log(`[ok] cards accent rects: ${cardsAccentRects.length} (one per card)`);

  // ── Export PDF + PPTX (image + editable) ───────────────────
  const pdfExporter = new PdfExporter(renderer, pool, logger.child('pdf'));
  const pdf = await pdfExporter.export(slides, 'Pengui v4.14.5 Hybrid');
  const pdfPath = resolve(outDir, pdf.filename);
  writeFileSync(pdfPath, pdf.data);
  console.log(`[ok] PDF: ${pdfPath} (${pdf.fileSizeBytes} bytes)`);

  const pptxExporter = new PptxExporter(renderer, logger.child('pptx'));
  const pptx = await pptxExporter.export(slides, 'Pengui v4.14.5 Hybrid');
  const pptxPath = resolve(outDir, pptx.filename);
  writeFileSync(pptxPath, pptx.data);
  console.log(`[ok] PPTX: ${pptxPath} (${pptx.fileSizeBytes} bytes)`);

  const editableExporter = new EditablePptxExporter(renderer, logger.child('pptx-editable'));
  const ePptx = await editableExporter.export(editableSlides, 'Pengui v4.14.5 Hybrid Editable');
  const ePptxPath = resolve(outDir, ePptx.filename);
  writeFileSync(ePptxPath, ePptx.data);
  console.log(`[ok] Editable PPTX: ${ePptxPath} (${ePptx.fileSizeBytes} bytes)`);
  ePptx.slides.forEach((s) => {
    console.log(`  ${s.slideId}: mode=${s.mode} native=${s.nativeObjectCount} bgFallback=${s.usedBackgroundFallback}`);
  });

  // ── Structural assertions on the EXPORTED PPTX XML ─────────
  // Unzip the editable PPTX in memory and parse each slide XML to
  // count <p:pic> shapes. This is the trust-but-verify step that
  // protects against silent regressions in the exporter side.
  console.log('\n[step] Structural PPTX assertions…');
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(ePptx.data);

  async function countPicAndShapes(slideXmlPath: string): Promise<{ pics: number; shapes: number; hasBgImage: boolean }> {
    const entry = zip.file(slideXmlPath);
    if (!entry) throw new Error(`PPTX missing ${slideXmlPath}`);
    const xml = await entry.async('string');
    // Count opening tags for native pictures and shapes. The slide
    // background image (when hybrid fallback fires) is a <p:pic> whose
    // <p:cNvPr> name ends in `_background` AND carries the
    // `descr="preencoded.png"` attribute. Text-background helper shapes
    // ALSO end in `_background`, so we require BOTH conditions to count
    // it as the slide-bg pic.
    const pics = (xml.match(/<p:pic\b/g) ?? []).length;
    const shapes = (xml.match(/<p:sp\b/g) ?? []).length;
    const hasBgImage = /<p:pic\b[\s\S]*?descr="preencoded\.png"[\s\S]*?_background"/m.test(xml)
      || /<p:pic\b[\s\S]*?name="[^"]*_background"[\s\S]*?descr="preencoded\.png"/m.test(xml);
    return { pics, shapes, hasBgImage };
  }

  const slide1 = await countPicAndShapes('ppt/slides/slide1.xml');
  const slide2 = await countPicAndShapes('ppt/slides/slide2.xml');
  const slide3 = await countPicAndShapes('ppt/slides/slide3.xml');
  console.log(`  slide1 (cover):   pics=${slide1.pics} shapes=${slide1.shapes} bg=${slide1.hasBgImage}`);
  console.log(`  slide2 (content): pics=${slide2.pics} shapes=${slide2.shapes} bg=${slide2.hasBgImage}`);
  console.log(`  slide3 (cards):   pics=${slide3.pics} shapes=${slide3.shapes} bg=${slide3.hasBgImage}`);

  // Slide 2 should have the 2 logo pics — bg image may or may not also
  // be present (depending on whether OTHER elements still go to bg).
  const slide2NonBgPics = slide2.pics - (slide2.hasBgImage ? 1 : 0);
  if (slide2NonBgPics < 2) {
    throw new Error(`slide2 (content): expected ≥2 logo pics in editable PPTX, got ${slide2NonBgPics} (after subtracting bg)`);
  }
  console.log(`  [ok] slide2 has ${slide2NonBgPics} native pics for chrome logos`);

  // Slide 3 should have 2 logos + 3 card icons = 5 native pics
  const slide3NonBgPics = slide3.pics - (slide3.hasBgImage ? 1 : 0);
  if (slide3NonBgPics < 5) {
    throw new Error(`slide3 (cards): expected ≥5 native pics (2 logos + 3 card icons), got ${slide3NonBgPics}`);
  }
  console.log(`  [ok] slide3 has ${slide3NonBgPics} native pics for chrome logos + card icons`);

  // Cover must NOT have any pics (no chrome, no icons)
  if (slide1.pics > 0) {
    throw new Error(`slide1 (cover): expected 0 pics, got ${slide1.pics}`);
  }
  console.log(`  [ok] slide1 has 0 pics (chrome correctly suppressed)`);

  console.log('\n[done] v4.14.5 hybrid editable export verified end-to-end. Outputs in', outDir);

  await pool.shutdown();
}

main().catch((err) => {
  console.error('[fail]', err);
  process.exit(1);
});
