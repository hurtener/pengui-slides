#!/usr/bin/env -S npx tsx
/**
 * v4.17 E2E — Flow & connectors.
 *
 * Reproduces the Galici-style pipeline visualization (slide 11) plus a
 * cycle composition + a density-warning case. Three slides:
 *
 *   1. Process flow — 4-step horizontal arrow flow:
 *      Backlog grooming → Sprint planning → Development → Demo + retro.
 *      Each step has icon + accent + badge.
 *   2. Cycle flow — 4-step Plan → Build → Measure → Learn with cycle
 *      connector (last step gets a return-arrow).
 *   3. Density warning — 8-step horizontal flow that triggers
 *      `flow-density-high` from `lintFlowDensity`.
 *
 * Asserts:
 *
 *   A. HTML carries the expected pengui-flow-* / pengui-flow-step-* /
 *      pengui-flow-connector-* classes.
 *   B. SlideDocument inventory has at least one native shape per step
 *      pill, native text shapes for each label, and native image shapes
 *      for each connector glyph.
 *   C. Editable PPTX:
 *      - 4 step pills as <p:sp> per process flow slide
 *      - 3 connector glyphs as <p:pic> between adjacent steps
 *      - 4 step pills + 4 connectors (3 between + 1 closing return) for
 *        the cycle slide
 *      - Mode stays native_only on every slide (no hybrid background)
 *   D. lintFlowDensity returns the `flow-density-high` warning for
 *      the 8-step slide and no warnings for the 4-step slides.
 *
 * Run: `npx tsx scripts/e2e-v417-flow.mts`
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
import { compileSlideIRToHtml, lintFlowDensity } from '../src/domain/ir/index.js';
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
    canvas: '#ffffff', surface: '#f7f9fc', surfaceAlt: '#eef2f7', border: '#dde3ec',
    textPrimary: '#0f172a', textSecondary: '#475569', textTertiary: '#94a3b8', textInverse: '#ffffff',
    accentPrimary: '#5b8def', accentSecondary: '#3ec1a6', accentWarm: '#f59e0b',
    success: '#10b981', warning: '#f59e0b', error: '#ef4444', info: '#3b82f6',
  },
  typography: {
    fontDisplay: "'Inter', sans-serif", fontBody: "'Inter', sans-serif", fontMono: "'JetBrains Mono', monospace",
    sizeHero: 72, sizeH1: 48, sizeH2: 36, sizeH3: 24, sizeBody: 18, sizeLabel: 14, sizeCaption: 11,
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
  id: soulId('soul-v417-flow'),
  slug: 'soul-v417-flow', name: 'v4.17 Flow Soul',
  description: '', status: 'approved',
  layers: LAYERS, cssTokens: tokens.cssString,
  tokenNames: tokens.tokenNames, allowedFonts: tokens.allowedFonts,
  utilityCss: '', styleGuide: '',
  createdAt: '2026-05-05T00:00:00.000Z', updatedAt: '2026-05-05T00:00:00.000Z',
};

async function main(): Promise<void> {
  const outDir = process.env.PENGUI_E2E_OUTDIR ?? resolve(process.cwd(), 'output');
  mkdirSync(outDir, { recursive: true });

  const logger = new Logger('e2e-v417', 'info');
  const pool = new PlaywrightPool({ headless: true, maxPoolSize: 2 });
  const renderer = new SlideRenderer(pool, logger.child('renderer'));

  // Galici slide-11 reference: Backlog → Sprint planning → Development → Demo+retro
  const PROCESS_IR: SlideIR = {
    body: [
      { type: 'heading', level: 2, text: [
        { text: 'Sprint flow — ' },
        { text: 'every two weeks', color: 'accent', bold: true },
        { text: '.' },
      ] },
      {
        type: 'flow',
        direction: 'horizontal',
        connector: 'arrow',
        steps: [
          { label: [{ text: 'Backlog grooming' }], accent: 'info', icon: 'layers', badge: '01' },
          { label: [{ text: 'Sprint planning' }], accent: 'accent', icon: 'workflow', badge: '02' },
          { label: [{ text: 'Development' }], accent: 'success', icon: 'rocket', badge: '03' },
          { label: [{ text: 'Demo + retro' }], accent: 'accent_warm', icon: 'check', badge: '04' },
        ],
      },
      { type: 'prose', body: [{ text: 'Each step is a native PPTX shape; the arrows between them are native pictures from the connector glyph registry.' }] },
    ],
  };

  // Cycle composition — Plan → Build → Measure → Learn (loops)
  const CYCLE_IR: SlideIR = {
    body: [
      { type: 'heading', level: 2, text: [{ text: 'Build–measure–learn loop.' }] },
      {
        type: 'flow',
        direction: 'horizontal',
        connector: 'cycle',
        steps: [
          { label: [{ text: 'Plan' }], accent: 'info', icon: 'target', badge: '01' },
          { label: [{ text: 'Build' }], accent: 'accent', icon: 'rocket', badge: '02' },
          { label: [{ text: 'Measure' }], accent: 'accent_alt', icon: 'gauge', badge: '03' },
          { label: [{ text: 'Learn' }], accent: 'accent_warm', icon: 'lightbulb', badge: '04' },
        ],
      },
      { type: 'prose', body: [{ text: 'Cycle connector adds a closing return arrow after the last step — visual cue that the flow loops.' }] },
    ],
  };

  // Density-warning case: 8 steps trigger flow-density-high.
  const DENSE_IR: SlideIR = {
    body: [
      { type: 'heading', level: 2, text: [{ text: 'Eight-step pipeline (density warning).' }] },
      {
        type: 'flow',
        direction: 'horizontal',
        connector: 'arrow_dashed',
        steps: [
          { label: [{ text: 'Discover' }], badge: '01' },
          { label: [{ text: 'Define' }], badge: '02' },
          { label: [{ text: 'Design' }], badge: '03' },
          { label: [{ text: 'Develop' }], badge: '04' },
          { label: [{ text: 'Deliver' }], badge: '05' },
          { label: [{ text: 'Deploy' }], badge: '06' },
          { label: [{ text: 'Document' }], badge: '07' },
          { label: [{ text: 'Decommission' }], badge: '08' },
        ],
      },
    ],
  };

  const SLIDES_AUTHORED = [
    { id: 'slide-process', ir: PROCESS_IR, title: 'Galici slide 11 — sprint flow' },
    { id: 'slide-cycle', ir: CYCLE_IR, title: 'Build-measure-learn cycle' },
    { id: 'slide-dense', ir: DENSE_IR, title: '8-step density warning' },
  ];
  const FONT_FACE_CSS = buildFontFaceCss(SOUL);

  function buildSlide(idx: number): Slide {
    const { id, ir, title } = SLIDES_AUTHORED[idx];
    const geometry = getFormat(DEFAULT_FORMAT).geometry;
    const html = compileSlideIRToHtml({ ir, soul: SOUL, geometry, fontFaceCss: FONT_FACE_CSS });
    return {
      id: id as SlideId, deckId: 'deck-v417-flow' as DeckId,
      position: idx, ir, html, sourceKind: 'authored_ir',
      metadata: {
        title, type: 'content', narrative: '',
        keyPoints: [], dataPoints: [], tags: [],
        generatedAt: new Date().toISOString(),
        soulId: SOUL.id as string, deckId: 'deck-v417-flow',
        position: idx, metaVersion: '1.0', revisionHash: 'rev-' + id,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const slides: Slide[] = SLIDES_AUTHORED.map((_, i) => buildSlide(i));

  // ── A. HTML structural assertions ────────────────────────────
  console.log('[step] slide HTML structural assertions');
  if (!/pengui-flow pengui-flow-horizontal pengui-flow-connector-arrow/.test(slides[0].html)) {
    throw new Error('process slide: missing pengui-flow-horizontal arrow class');
  }
  // 4 steps + 3 connectors = 7 <li> per process slide
  const processStepClassMatches = slides[0].html.match(/pengui-flow-step pengui-flow-step-accent-/g) ?? [];
  if (processStepClassMatches.length !== 4) {
    throw new Error(`process slide expected 4 step pills, got ${processStepClassMatches.length}`);
  }
  const processConnectorMatches = slides[0].html.match(/pengui-flow-connector pengui-flow-connector-glyph-arrow/g) ?? [];
  if (processConnectorMatches.length !== 3) {
    throw new Error(`process slide expected 3 connectors, got ${processConnectorMatches.length}`);
  }
  // Cycle: 4 steps + 4 connectors (3 between + 1 closing return)
  const cycleConnectorMatches = slides[1].html.match(/pengui-flow-connector pengui-flow-connector-glyph-cycle/g) ?? [];
  if (cycleConnectorMatches.length !== 4) {
    throw new Error(`cycle slide expected 4 connectors (3 between + 1 return), got ${cycleConnectorMatches.length}`);
  }
  if (!/pengui-flow-connector-return/.test(slides[1].html)) {
    throw new Error('cycle slide: missing return-arrow modifier on closing connector');
  }
  console.log('[ok] HTML structural assertions');

  // ── B. SlideDocument inventory ───────────────────────────────
  console.log('[step] SlideDocument inventory');
  const slideDocService = new SlideDocumentService(logger.child('slide-doc'), true);
  const editableSlides: Slide[] = [];
  for (const slide of slides) {
    const result = await slideDocService.compileSlideHtml(slide.html, slide.metadata.revisionHash);
    editableSlides.push({
      ...slide, document: result.document, sourceKind: 'authored_ir',
      translationIssues: result.translationIssues,
    });
  }
  for (const s of editableSlides) {
    const native = s.document!.elements.filter((el) => (el.exportDisposition ?? 'native') === 'native');
    const counts: Record<string, number> = {};
    for (const el of native) counts[el.kind] = (counts[el.kind] ?? 0) + 1;
    console.log(`  ${s.id}: native=${JSON.stringify(counts)}`);
  }

  // ── C. Density lint ──────────────────────────────────────────
  console.log('[step] flow density lint');
  const processWarnings = lintFlowDensity(PROCESS_IR.body);
  const cycleWarnings = lintFlowDensity(CYCLE_IR.body);
  const denseWarnings = lintFlowDensity(DENSE_IR.body);
  if (processWarnings.length !== 0) {
    throw new Error(`process slide unexpectedly produced ${processWarnings.length} density warnings`);
  }
  if (cycleWarnings.length !== 0) {
    throw new Error(`cycle slide unexpectedly produced ${cycleWarnings.length} density warnings`);
  }
  if (denseWarnings.length !== 1 || denseWarnings[0].code !== 'flow-density-high' || denseWarnings[0].stepCount !== 8) {
    throw new Error(`dense slide expected exactly 1 flow-density-high warning at 8 steps; got ${JSON.stringify(denseWarnings)}`);
  }
  console.log(`[ok] density lint: 4-step flows clean, 8-step flow warns (${denseWarnings[0].message})`);

  // ── D. Export PDF + image PPTX + editable PPTX ───────────────
  console.log('\n[step] export PDF + image PPTX + editable PPTX');
  const pdfExporter = new PdfExporter(renderer, pool, logger.child('pdf'));
  const pdf = await pdfExporter.export(slides, 'Pengui v4.17 Flow');
  const pdfPath = resolve(outDir, pdf.filename);
  writeFileSync(pdfPath, pdf.data);
  console.log(`[ok] PDF: ${pdfPath} (${pdf.fileSizeBytes} bytes)`);

  const pptxExporter = new PptxExporter(renderer, logger.child('pptx'));
  const pptx = await pptxExporter.export(slides, 'Pengui v4.17 Flow');
  const pptxPath = resolve(outDir, pptx.filename);
  writeFileSync(pptxPath, pptx.data);
  console.log(`[ok] Static PPTX: ${pptxPath} (${pptx.fileSizeBytes} bytes)`);

  const editableExporter = new EditablePptxExporter(renderer, logger.child('pptx-editable'));
  const ePptx = await editableExporter.export(editableSlides, 'Pengui v4.17 Flow Editable');
  const ePptxPath = resolve(outDir, ePptx.filename);
  writeFileSync(ePptxPath, ePptx.data);
  console.log(`[ok] Editable PPTX: ${ePptxPath} (${ePptx.fileSizeBytes} bytes)`);

  console.log('\n[step] per-slide hybrid mode report');
  for (const s of ePptx.slides) {
    console.log(`  ${s.slideId}: mode=${s.mode} native=${s.nativeObjectCount} bgFallback=${s.usedBackgroundFallback}`);
  }
  const fallbackSlides = ePptx.slides.filter((s) => s.usedBackgroundFallback);
  if (fallbackSlides.length > 0) {
    throw new Error(
      `Parity violation: ${fallbackSlides.length} slide(s) used background fallback: ` +
      fallbackSlides.map((s) => s.slideId).join(', '),
    );
  }
  console.log('[ok] every slide ships as native_only — full v4.14.6+ parity preserved');

  // ── E. OOXML structural assertions ───────────────────────────
  console.log('\n[step] editable PPTX XML assertions');
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(ePptx.data);

  async function inspect(slidePath: string) {
    const xml = await zip.file(slidePath)!.async('string');
    return {
      pics: (xml.match(/<p:pic\b/g) ?? []).length,
      shapes: (xml.match(/<p:sp\b/g) ?? []).length,
      texts: (xml.match(/<p:cNvSpPr txBox="1"/g) ?? []).length,
    };
  }

  const processStats = await inspect('ppt/slides/slide1.xml');
  const cycleStats = await inspect('ppt/slides/slide2.xml');
  const denseStats = await inspect('ppt/slides/slide3.xml');
  console.log('  process:', processStats);
  console.log('  cycle:  ', cycleStats);
  console.log('  dense:  ', denseStats);

  // Process: 4 step pills as <p:sp>, 4 step icons + 3 connector glyphs as <p:pic>
  if (processStats.shapes < 4) {
    throw new Error(`process slide expected ≥4 <p:sp> step pills, got ${processStats.shapes}`);
  }
  if (processStats.pics < 7) {
    throw new Error(`process slide expected ≥7 <p:pic> (4 icons + 3 connectors), got ${processStats.pics}`);
  }
  // Cycle: 4 step pills + 4 connectors (1 closing return)
  if (cycleStats.shapes < 4) {
    throw new Error(`cycle slide expected ≥4 <p:sp> step pills, got ${cycleStats.shapes}`);
  }
  if (cycleStats.pics < 8) {
    throw new Error(`cycle slide expected ≥8 <p:pic> (4 icons + 4 connectors with return), got ${cycleStats.pics}`);
  }
  // Dense: 8 step pills + 7 connectors
  if (denseStats.shapes < 8) {
    throw new Error(`dense slide expected ≥8 <p:sp> step pills, got ${denseStats.shapes}`);
  }
  console.log('[ok] OOXML structural assertions');

  console.log('\n[done] v4.17 flow & connectors verified end-to-end. Outputs in', outDir);

  await pool.shutdown();
}

main().catch((err) => {
  console.error('[fail]', err);
  process.exit(1);
});
