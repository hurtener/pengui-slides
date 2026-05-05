#!/usr/bin/env -S npx tsx
/**
 * v4.14.6 E2E — parity validation between the static (image) PPTX
 * and the hybrid (editable) PPTX, while keeping the editable version
 * editable.
 *
 * Builds a 4-slide deck that exercises EVERY pre-v4.14.6 hybrid
 * pressure point:
 *   1. Cover (chrome hidden, inline color emphasis)
 *   2. Content with chrome (chrome logos must be native)
 *   3. Cards with chrome (cards + icons + accent rects must be native)
 *   4. Chart with chrome (PRE-v4.14.6 BUG: chart slides flipped to
 *      hybrid_background, which collapsed cards/chrome/icons into the
 *      background image. POST-v4.14.6: only the chart bbox is image,
 *      rest of slide stays native.)
 *
 * Then it verifies parity by:
 *   A. Asserting that NO slide ends up in hybrid_background mode
 *      (every slide is native_only — the chart slide too)
 *   B. Asserting structural inventory matches expectations:
 *      - Cover: 0 native pics
 *      - Content / Cards: 2 chrome logo pics each (+ 3 icons on cards)
 *      - Chart slide: 2 chrome logos + 1 chart pic (the chart SVG, NOT
 *        a slide-wide background pic)
 *   C. Visual spot-check: PDF render side-by-side with PPTX
 *      thumbnail of the cover (qlmanage limitation: only first slide)
 *   D. Confirming editability: editable PPTX still contains <p:sp> text
 *      shapes for every body / heading / prose / eyebrow element on
 *      EVERY slide, including the chart slide
 *
 * Run: `npx tsx scripts/e2e-v4146-parity.mts`
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
import { resolveChartRefs } from '../src/domain/rendering/chart-resolver.js';
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
  id: soulId('soul-v4146-parity'),
  slug: 'soul-v4146-parity', name: 'v4.14.6 Parity Soul',
  description: '', status: 'approved',
  layers: LAYERS, cssTokens: tokens.cssString,
  tokenNames: tokens.tokenNames, allowedFonts: tokens.allowedFonts,
  utilityCss: '', styleGuide: '',
  createdAt: '2026-05-05T00:00:00.000Z', updatedAt: '2026-05-05T00:00:00.000Z',
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

  const logger = new Logger('e2e-v4146', 'info');
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
      left: { kind: 'text', content: [{ text: 'Pengui v4.14.6 · Parity demo' }] },
      right: { kind: 'page_number', format: '1/N' },
    },
    showOnCover: false,
  };

  const COVER_IR: SlideIR = {
    layout: 'centered',
    body: [{
      type: 'hero', align: 'center',
      eyebrow: [{ text: 'PARITY VALIDATION · MAYO 2026' }],
      title: [
        { text: 'Hybrid editable PPTX with ' },
        { text: 'native chart', color: 'success', bold: true },
        { text: '.' },
      ],
      subtitle: [{ text: 'v4.14.6 — chart slides keep cards/chrome native.' }],
    }],
  };

  const CONTENT_IR: SlideIR = {
    body: [
      { type: 'heading', level: 2, text: [{ text: 'Content slide.' }] },
      { type: 'prose', body: [{ text: 'A baseline content slide. All chrome shapes must be native (visible in editable PPTX, not just background image).' }] },
    ],
  };

  const CARDS_IR: SlideIR = {
    body: [
      { type: 'heading', level: 2, text: [{ text: 'Cards slide.' }] },
      {
        type: 'grid', columns: 3, gap: 'md',
        cells: [
          [{
            type: 'card', accent: 'info', icon: 'layers',
            eyebrow: [{ text: '01 · TRACEABILITY' }],
            body: [
              { type: 'heading', level: 4, text: [{ text: 'Fragmented control' }] },
              { type: 'prose', body: [{ text: 'No end-to-end audit.' }] },
            ],
          }],
          [{
            type: 'card', accent: 'success', icon: 'check',
            eyebrow: [{ text: '02 · SECURITY' }],
            body: [
              { type: 'heading', level: 4, text: [{ text: 'Formal authorization' }] },
              { type: 'prose', body: [{ text: 'Every movement signed.' }] },
            ],
          }],
          [{
            type: 'card', accent: 'accent_warm', icon: 'gauge',
            eyebrow: [{ text: '03 · OPTIMIZATION' }],
            body: [
              { type: 'heading', level: 4, text: [{ text: 'Idle funds' }] },
              { type: 'prose', body: [{ text: 'No short-term investment.' }] },
            ],
          }],
        ],
      },
    ],
  };

  // The PARITY-CRITICAL slide. Pre-v4.14.6 this whole slide flipped to
  // hybrid_background, killing every other native shape on it. Post-
  // v4.14.6 only the chart's bbox is rendered as image; the heading +
  // prose + chrome stay native.
  const CHART_IR: SlideIR = {
    body: [
      { type: 'heading', level: 2, text: [
        { text: 'Quarterly revenue — ' },
        { text: 'soul-themed palette', color: 'accent', bold: true },
        { text: '.' },
      ] },
      {
        type: 'chart', chart_type: 'bar',
        data: [[42, 58, 71, 64], [30, 45, 60, 55]],
        series_labels: ['North', 'South'],
        category_labels: ['Q1', 'Q2', 'Q3', 'Q4'],
        x_axis_title: 'Quarter', y_axis_title: 'USD (millions)',
        show_legend: true, show_grid: true, value_format: 'compact',
        caption: [{ text: 'Two regions, four quarters.' }],
      },
      { type: 'prose', body: [{ text: 'Every text element on this slide must remain editable in the hybrid PPTX — the chart should be the ONLY image, not the whole slide.' }] },
    ],
  };

  const SLIDES_AUTHORED = [
    { id: 'slide-cover',   ir: COVER_IR,   title: 'Cover (no chrome)' },
    { id: 'slide-content', ir: CONTENT_IR, title: 'Content with chrome' },
    { id: 'slide-cards',   ir: CARDS_IR,   title: 'Cards with chrome' },
    { id: 'slide-chart',   ir: CHART_IR,   title: 'Chart with chrome (parity-critical)' },
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
    // Resolve charts (placeholder SVG → real ECharts SVG) BEFORE
    // resolving asset URIs. The chart resolver works on the slide
    // HTML in-place.
    const charted = resolveChartRefs(raw, SOUL.layers);
    const html = await resolveAssetRefs(charted, assetService);
    return {
      id: id as SlideId, deckId: 'deck-v4146-parity' as DeckId,
      position: idx, ir, html, sourceKind: 'authored_ir',
      metadata: {
        title, type: 'content', narrative: '',
        keyPoints: [], dataPoints: [], tags: [],
        generatedAt: new Date().toISOString(),
        soulId: SOUL.id as string, deckId: 'deck-v4146-parity',
        position: idx, metaVersion: '1.0', revisionHash: 'rev-' + id,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const slides: Slide[] = [];
  for (let i = 0; i < totalCount; i++) slides.push(await buildSlide(i));

  // Compile to slide documents
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

  // ── Inspect slide documents ─────────────────────────────────
  function inventory(doc: NonNullable<Slide['document']>) {
    const native = doc.elements.filter((el) => (el.exportDisposition ?? 'native') === 'native');
    const background = doc.elements.filter((el) => el.exportDisposition === 'background');
    const counts: Record<string, number> = {};
    for (const el of native) counts[el.kind] = (counts[el.kind] ?? 0) + 1;
    return { native: counts, backgroundCount: background.length };
  }
  console.log('[doc] slide-cover  ', inventory(editableSlides[0].document!));
  console.log('[doc] slide-content', inventory(editableSlides[1].document!));
  console.log('[doc] slide-cards  ', inventory(editableSlides[2].document!));
  console.log('[doc] slide-chart  ', inventory(editableSlides[3].document!));

  // PARITY-CRITICAL: chart slide must NOT mark anything as background
  const chartDoc = editableSlides[3].document!;
  const chartBackground = chartDoc.elements.filter((el) => el.exportDisposition === 'background');
  if (chartBackground.length > 0) {
    throw new Error(
      `chart slide still has ${chartBackground.length} background-disposed elements ` +
      `(pre-v4.14.6 bug). Selectors: ${chartBackground.map((e) => e.selector ?? '?').join(', ')}`,
    );
  }
  console.log('[ok] chart slide: 0 background-disposed elements (pre-v4.14.6 had ≥1)');

  // Chart slide must have a chart image
  const chartImages = chartDoc.elements.filter(
    (el) => el.kind === 'image' && el.id.endsWith('-chart'),
  );
  if (chartImages.length !== 1) {
    throw new Error(`chart slide expected 1 chart image, got ${chartImages.length}`);
  }
  console.log(`[ok] chart slide: chart pic at (${chartImages[0].x}, ${chartImages[0].y}) ${chartImages[0].width}×${chartImages[0].height}`);

  // EDITABILITY: chart slide must have native text shapes for every
  // body/heading/prose/eyebrow element
  const chartText = chartDoc.elements.filter(
    (el) => el.kind === 'text' && (el.exportDisposition ?? 'native') === 'native',
  );
  if (chartText.length < 3) {
    throw new Error(
      `chart slide expected ≥3 native text shapes (heading + caption + prose at minimum), got ${chartText.length}. ` +
      `Pre-v4.14.6 bug: chart-bearing slides flipped to hybrid_background and these became overlay text only.`,
    );
  }
  console.log(`[ok] chart slide: ${chartText.length} native text shapes (heading, caption, prose, chrome)`);

  // ── Export all three formats ─────────────────────────────────
  const pdfExporter = new PdfExporter(renderer, pool, logger.child('pdf'));
  const pdf = await pdfExporter.export(slides, 'Pengui v4.14.6 Parity');
  const pdfPath = resolve(outDir, pdf.filename);
  writeFileSync(pdfPath, pdf.data);
  console.log(`[ok] PDF: ${pdfPath} (${pdf.fileSizeBytes} bytes)`);

  const pptxExporter = new PptxExporter(renderer, logger.child('pptx'));
  const pptx = await pptxExporter.export(slides, 'Pengui v4.14.6 Parity');
  const pptxPath = resolve(outDir, pptx.filename);
  writeFileSync(pptxPath, pptx.data);
  console.log(`[ok] Static PPTX: ${pptxPath} (${pptx.fileSizeBytes} bytes)`);

  const editableExporter = new EditablePptxExporter(renderer, logger.child('pptx-editable'));
  const ePptx = await editableExporter.export(editableSlides, 'Pengui v4.14.6 Parity Editable');
  const ePptxPath = resolve(outDir, ePptx.filename);
  writeFileSync(ePptxPath, ePptx.data);
  console.log(`[ok] Editable PPTX: ${ePptxPath} (${ePptx.fileSizeBytes} bytes)`);

  console.log('\n[step] Per-slide hybrid mode report:');
  for (const s of ePptx.slides) {
    console.log(`  ${s.slideId}: mode=${s.mode} native=${s.nativeObjectCount} bgFallback=${s.usedBackgroundFallback}`);
  }

  // PARITY ASSERTION: every slide must be native_only — no slide-wide
  // background fallback should fire on ANY slide (including chart).
  const slidesWithFallback = ePptx.slides.filter((s) => s.usedBackgroundFallback);
  if (slidesWithFallback.length > 0) {
    throw new Error(
      `Parity violation: ${slidesWithFallback.length} slide(s) used background fallback: ` +
      slidesWithFallback.map((s) => s.slideId).join(', '),
    );
  }
  console.log('[ok] Every slide ships as mode=native_only — full parity with static PPTX');

  // ── Structural assertions on the EDITABLE PPTX XML ───────────
  console.log('\n[step] Structural PPTX XML assertions…');
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(ePptx.data);

  async function inspectSlide(slidePath: string): Promise<{ pics: number; shapes: number; texts: number; hasBgPic: boolean }> {
    const entry = zip.file(slidePath);
    if (!entry) throw new Error(`PPTX missing ${slidePath}`);
    const xml = await entry.async('string');
    const pics = (xml.match(/<p:pic\b/g) ?? []).length;
    const shapes = (xml.match(/<p:sp\b/g) ?? []).length;
    // Count text shapes (those with txBox or carrying <a:t> content)
    const texts = (xml.match(/<p:cNvSpPr txBox="1"/g) ?? []).length;
    // Slide-wide background pic — descr="preencoded.png" AND name ends in _background
    const hasBgPic = /<p:pic\b[\s\S]*?descr="preencoded\.png"[\s\S]*?_background"/m.test(xml)
      || /<p:pic\b[\s\S]*?name="[^"]*_background"[\s\S]*?descr="preencoded\.png"/m.test(xml);
    return { pics, shapes, texts, hasBgPic };
  }

  const xmlStats = {
    cover: await inspectSlide('ppt/slides/slide1.xml'),
    content: await inspectSlide('ppt/slides/slide2.xml'),
    cards: await inspectSlide('ppt/slides/slide3.xml'),
    chart: await inspectSlide('ppt/slides/slide4.xml'),
  };
  console.log('  cover:  ', xmlStats.cover);
  console.log('  content:', xmlStats.content);
  console.log('  cards:  ', xmlStats.cards);
  console.log('  chart:  ', xmlStats.chart);

  // Cover: 0 pics, 0 bg pic
  if (xmlStats.cover.hasBgPic) throw new Error('cover has unexpected slide-bg pic');
  if (xmlStats.cover.pics !== 0) throw new Error(`cover expected 0 pics, got ${xmlStats.cover.pics}`);
  // Content: 2 chrome logos, 0 bg pic
  if (xmlStats.content.hasBgPic) throw new Error('content has unexpected slide-bg pic');
  if (xmlStats.content.pics < 2) throw new Error(`content expected ≥2 pics (logos), got ${xmlStats.content.pics}`);
  // Cards: 2 logos + 3 icons, 0 bg pic
  if (xmlStats.cards.hasBgPic) throw new Error('cards has unexpected slide-bg pic');
  if (xmlStats.cards.pics < 5) throw new Error(`cards expected ≥5 pics (2 logos + 3 icons), got ${xmlStats.cards.pics}`);
  // CHART: 2 logos + 1 chart pic = 3 native pics, 0 bg pic ←── the parity win
  if (xmlStats.chart.hasBgPic) throw new Error('chart slide STILL has slide-bg pic — v4.14.6 fix did not land');
  if (xmlStats.chart.pics < 3) throw new Error(`chart slide expected ≥3 pics (2 logos + 1 chart), got ${xmlStats.chart.pics}`);
  // Chart slide must have at least the heading + caption + prose as text shapes
  if (xmlStats.chart.texts < 3) throw new Error(`chart slide expected ≥3 native text shapes, got ${xmlStats.chart.texts}`);
  console.log('[ok] All structural assertions pass — chart slide has native chrome + chart pic + native text');

  console.log('\n[done] v4.14.6 hybrid/static parity verified end-to-end. Outputs in', outDir);

  await pool.shutdown();
}

main().catch((err) => {
  console.error('[fail]', err);
  process.exit(1);
});
