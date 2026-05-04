#!/usr/bin/env -S npx tsx
/**
 * v4.12 E2E export smoke — drive the real PdfExporter / PptxExporter
 * against a chart-bearing slide. Verifies the full pipeline:
 *
 *   chart IR → compileSlideIRToHtml → resolveChartRefs (ECharts SSR)
 *     → SlideRenderer (Playwright) → PDF / PPTX
 *
 * Writes the outputs to /tmp/pengui-v4.12-charts/* and asserts each
 * artifact is non-trivially sized.
 *
 * Run: `npx tsx scripts/e2e-chart-export.mts`
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger } from '../src/infrastructure/logger.js';
import { PlaywrightPool } from '../src/domain/rendering/playwright-pool.js';
import { SlideRenderer } from '../src/domain/rendering/slide-renderer.js';
import { PdfExporter } from '../src/domain/rendering/pdf-exporter.js';
import { PptxExporter } from '../src/domain/rendering/pptx-exporter.js';
import { EditablePptxExporter } from '../src/domain/rendering/editable-pptx-exporter.js';
import { SlideDocumentService } from '../src/domain/documents/slide-document-service.js';
import { compileSlideIRToHtml, compileSectionIRToHtml } from '../src/domain/ir/index.js';
import { resolveChartRefs } from '../src/domain/rendering/chart-resolver.js';
import { generateTokens } from '../src/domain/souls/token-generator.js';
import { getFormat, DEFAULT_FORMAT } from '../src/domain/formats/format-registry.js';
import type { SlideIR, SectionIR } from '../src/domain/ir/index.js';
import type { Slide, Deck, DocumentMeta } from '../src/types/deck.js';
import type { Section, SectionKind } from '../src/types/section.js';
import type { DeckId, SlideId, SectionId } from '../src/types/common.js';
import type { SoulLayers, DesignSoul } from '../src/types/design-soul.js';
import { soulId } from '../src/types/common.js';

// ── Soul layers ────────────────────────────────────────────────────

const LAYERS: SoulLayers = {
  color: {
    canvas: '#ffffff', surface: '#f8f9fa', surfaceAlt: '#e9ecef', border: '#dee2e6',
    textPrimary: '#212529', textSecondary: '#495057', textTertiary: '#868e96', textInverse: '#ffffff',
    accentPrimary: '#228be6', accentSecondary: '#15aabf', accentWarm: '#fd7e14',
    success: '#40c057', warning: '#fab005', error: '#fa5252', info: '#228be6',
  },
  typography: {
    fontDisplay: "'Inter', sans-serif", fontBody: "'Inter', sans-serif", fontMono: "'JetBrains Mono', monospace",
    sizeHero: 72, sizeH1: 48, sizeH2: 36, sizeH3: 28, sizeBody: 18, sizeLabel: 14, sizeCaption: 12,
    weightNormal: 400, weightMedium: 500, weightBold: 700,
    lineHeightHeading: 1.2, lineHeightBody: 1.6,
    letterSpacingHeading: '-0.02em', letterSpacingBody: '0em',
  },
  spacing: { baseUnit: 8, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64, safeAreaInset: 48 },
  shape: { none: '0', sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px',
    buttonRadius: '8px', cardRadius: '12px', inputRadius: '6px', badgeRadius: '9999px' },
  depth: { shadowNone: 'none', shadowSoft: '0 1px 3px rgba(0,0,0,0.08)', shadowMedium: '0 4px 12px rgba(0,0,0,0.12)',
    shadowElevated: '0 8px 24px rgba(0,0,0,0.16)', shadowInner: 'inset 0 2px 4px rgba(0,0,0,0.06)',
    borderWidth: '1px', borderOpacity: 0.1 },
  components: {
    cardPadding: '24px', cardShadow: '0 1px 3px rgba(0,0,0,0.08)', cardBorderWidth: '1px',
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
  id: soulId('soul-e2e'),
  slug: 'soul-e2e',
  name: 'E2E Test Soul',
  description: '',
  status: 'approved',
  layers: LAYERS,
  cssTokens: tokens.cssString,
  tokenNames: tokens.tokenNames,
  allowedFonts: tokens.allowedFonts,
  utilityCss: '',
  styleGuide: '',
  createdAt: '2026-05-04T00:00:00.000Z',
  updatedAt: '2026-05-04T00:00:00.000Z',
};

// ── Slide IRs ──────────────────────────────────────────────────────

const HERO_IR: SlideIR = {
  body: [{ type: 'hero', title: [{ text: 'Pengui Charts E2E' }], subtitle: [{ text: 'v4.12 + ECharts v6' }] }],
};

const BAR_CHART_IR: SlideIR = {
  body: [
    { type: 'heading', level: 2, text: [{ text: 'Quarterly revenue' }] },
    {
      type: 'chart',
      chart_type: 'bar',
      data: [[42, 58, 71, 64], [30, 45, 60, 55]],
      series_labels: ['North', 'South'],
      category_labels: ['Q1', 'Q2', 'Q3', 'Q4'],
      x_axis_title: 'Quarter',
      y_axis_title: 'USD (millions)',
      show_legend: true,
      show_grid: true,
      value_format: 'compact',
      caption: [{ text: 'Two regions, four quarters.' }],
    },
  ],
};

const PIE_CHART_IR: SlideIR = {
  body: [
    { type: 'heading', level: 2, text: [{ text: 'Market share' }] },
    {
      type: 'chart',
      chart_type: 'pie',
      data: [[35, 22, 18, 15, 10]],
      category_labels: ['Acme', 'Beta', 'Gamma', 'Delta', 'Other'],
      show_legend: true,
    },
  ],
};

// Mixed-content slide: heading + chart + body prose. Tests that the
// chart's SVG `width: 100%; height: auto` rule lets it share vertical
// space with sibling blocks.
const MIXED_IR: SlideIR = {
  body: [
    { type: 'heading', level: 2, text: [{ text: 'Quarterly revenue (mixed)' }] },
    {
      type: 'chart',
      chart_type: 'line',
      data: [[42, 58, 71, 64]],
      series_labels: ['Revenue'],
      category_labels: ['Q1', 'Q2', 'Q3', 'Q4'],
      x_axis_title: 'Quarter',
      y_axis_title: 'USD (M)',
      show_legend: false,
    },
    {
      type: 'prose',
      body: [
        { text: 'Q3 was the inflection — bookings ramped after the May launch and held through July. Q4 dipped slightly on the seasonality we expected.' },
      ],
    },
  ],
};

// Two-column layout with chart in one column and text in the other —
// stress test for chart rendering inside a flex cell.
const TWO_COLUMN_IR: SlideIR = {
  body: [
    { type: 'heading', level: 2, text: [{ text: 'Two-column with chart' }] },
    {
      type: 'two_column',
      ratio: '1:1',
      left: [
        {
          type: 'chart',
          chart_type: 'donut',
          data: [[40, 30, 20, 10]],
          category_labels: ['Direct', 'Search', 'Referral', 'Other'],
          show_legend: true,
        },
      ],
      right: [
        { type: 'heading', level: 3, text: [{ text: 'Channel mix' }] },
        { type: 'list', style: 'bullet', items: [
          [{ text: 'Direct dominates at 40%' }],
          [{ text: 'Search converts best per visitor' }],
          [{ text: 'Referral is the cheapest channel' }],
        ] },
      ],
    },
  ],
};

// ── Slide builders ────────────────────────────────────────────────

function makeSlide(slideIdStr: string, ir: SlideIR, position: number, title: string): Slide {
  const geometry = getFormat(DEFAULT_FORMAT).geometry;
  const raw = compileSlideIRToHtml({ ir, soul: SOUL, geometry });
  const html = resolveChartRefs(raw, SOUL.layers);
  return {
    id: slideIdStr as SlideId,
    deckId: 'deck-e2e' as DeckId,
    position,
    ir,
    html,
    sourceKind: 'authored_ir',
    metadata: {
      title,
      type: 'content',
      narrative: '',
      keyPoints: [],
      dataPoints: [],
      tags: [],
      generatedAt: new Date().toISOString(),
      soulId: SOUL.id as string,
      deckId: 'deck-e2e',
      position,
      metaVersion: '1.0',
      revisionHash: 'rev-' + slideIdStr,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Driver ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Write to the project's standard ./output/ folder (matches
  // PenguiConfig.outputDir default) so the artifacts are easy to find.
  // Override with PENGUI_E2E_OUTDIR=/some/path if needed.
  const outDir = process.env.PENGUI_E2E_OUTDIR ?? resolve(process.cwd(), 'output');
  mkdirSync(outDir, { recursive: true });

  const logger = new Logger('e2e-charts', 'info');
  const pool = new PlaywrightPool({ headless: true, maxPoolSize: 2 });
  const renderer = new SlideRenderer(pool, logger.child('renderer'));

  const slides: Slide[] = [
    makeSlide('slide-hero', HERO_IR, 0, 'Cover'),
    makeSlide('slide-bar', BAR_CHART_IR, 1, 'Quarterly revenue'),
    makeSlide('slide-pie', PIE_CHART_IR, 2, 'Market share'),
    makeSlide('slide-mixed', MIXED_IR, 3, 'Mixed: heading + chart + prose'),
    makeSlide('slide-2col', TWO_COLUMN_IR, 4, 'Two-column with chart'),
  ];

  // Quick sanity: chart slides should carry resolved SVG (not the
  // "chart pending" placeholder text).
  for (const slide of slides) {
    if (slide.ir?.body.some((n) => n.type === 'chart')) {
      if (slide.html.includes('chart pending')) {
        throw new Error(`${slide.id}: still has placeholder body — chart resolver did not run`);
      }
      if (!slide.html.includes('var(--color-')) {
        throw new Error(`${slide.id}: rendered SVG has no var(--color-*) refs — hex→var swap regressed`);
      }
      console.log(`[ok] ${slide.id} chart resolved (html=${slide.html.length}b)`);
    }
  }

  // ── PDF (image mode — slides_16_9 default) ──────────────────────
  console.log('\n[step] PDF export (image mode, slides_16_9)…');
  const pdfExporter = new PdfExporter(renderer, pool, logger.child('pdf'));
  const pdfStart = Date.now();
  const pdf = await pdfExporter.export(slides, 'Pengui v4.12 Charts E2E');
  const pdfMs = Date.now() - pdfStart;
  const pdfPath = resolve(outDir, pdf.filename);
  writeFileSync(pdfPath, pdf.data);
  console.log(`[ok] PDF: ${pdfPath} (${pdf.fileSizeBytes} bytes, ${pdfMs}ms)`);

  if (pdf.fileSizeBytes < 50_000) {
    throw new Error(`PDF unexpectedly small (${pdf.fileSizeBytes}b) — chart probably missing`);
  }
  if (!pdf.data.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('PDF does not start with %PDF- magic bytes');
  }

  // ── PPTX (image-mode bundling — every slide is a full-bleed PNG) ──
  console.log('\n[step] PPTX export (image bundling)…');
  const pptxExporter = new PptxExporter(renderer, logger.child('pptx'));
  const pptxStart = Date.now();
  const pptx = await pptxExporter.export(slides, 'Pengui v4.12 Charts E2E');
  const pptxMs = Date.now() - pptxStart;
  const pptxPath = resolve(outDir, pptx.filename);
  writeFileSync(pptxPath, pptx.data);
  console.log(`[ok] PPTX: ${pptxPath} (${pptx.fileSizeBytes} bytes, ${pptxMs}ms)`);

  if (pptx.fileSizeBytes < 50_000) {
    throw new Error(`PPTX unexpectedly small (${pptx.fileSizeBytes}b) — chart probably missing`);
  }
  if (pptx.data[0] !== 0x50 || pptx.data[1] !== 0x4b) {
    throw new Error('PPTX does not start with PK zip magic bytes');
  }

  // ── PPTX (editable hybrid — native shapes + chart-as-background) ──
  // This is the path Track D landed in v4.12: native PPTX shapes for
  // text / table / line, with chart figures intentionally flattened
  // into the slide background via the html-slide-document-compiler's
  // chartHandled set. Verifies the chart raster lives in the
  // hybrid_background screenshot, not as broken pengui-chart:// images.
  console.log('\n[step] PPTX export (editable hybrid)…');
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
  const editableExporter = new EditablePptxExporter(renderer, logger.child('pptx-editable'));
  const ePptxStart = Date.now();
  const ePptx = await editableExporter.export(editableSlides, 'Pengui v4.12 Charts Editable');
  const ePptxMs = Date.now() - ePptxStart;
  const ePptxPath = resolve(outDir, ePptx.filename);
  writeFileSync(ePptxPath, ePptx.data);

  // Inspect per-slide modes — chart-bearing slides should land in
  // hybrid_background; chart-free slides should be native_only.
  const modeReport = ePptx.slides
    .map((s) => `${s.slideId}: mode=${s.mode} native=${s.nativeObjectCount} bgFallback=${s.usedBackgroundFallback}`)
    .join('\n  ');
  console.log(`[ok] Editable PPTX: ${ePptxPath} (${ePptx.fileSizeBytes} bytes, ${ePptxMs}ms)\n  ${modeReport}`);

  // Sanity: at least one chart slide must be flagged native_only OR
  // hybrid_background — mode='hybrid_background' is the expected mode
  // for chart-bearing slides because chart figures opt into background
  // via the v4.12 walker.
  const chartSlideModes = ePptx.slides.filter((s) =>
    ['slide-bar', 'slide-pie', 'slide-mixed', 'slide-2col'].includes(s.slideId),
  );
  const allChartsHybrid = chartSlideModes.every((s) => s.usedBackgroundFallback);
  if (!allChartsHybrid) {
    const offenders = chartSlideModes.filter((s) => !s.usedBackgroundFallback).map((s) => s.slideId);
    console.warn(`[warn] chart slides expected hybrid_background but got native_only: ${offenders.join(', ')}`);
  }

  // Hero slide has no chart → expect native_only.
  const hero = ePptx.slides.find((s) => s.slideId === 'slide-hero');
  if (hero && hero.usedBackgroundFallback) {
    console.warn('[warn] hero slide unexpectedly used background fallback');
  }

  if (ePptx.fileSizeBytes < 50_000) {
    throw new Error(`Editable PPTX unexpectedly small (${ePptx.fileSizeBytes}b)`);
  }

  // ── Document-mode A4 PDF (sections, not slides) ──────────────
  console.log('\n[step] Document-mode A4 PDF (chart sections)…');

  const a4Geometry = getFormat('print_a4_portrait').geometry;

  function makeSection(
    sectionIdStr: string,
    kind: SectionKind,
    ir: SectionIR,
    position: number,
    title: string,
  ): Section {
    // Section compile is soul-agnostic; the composer resolves charts.
    const html = compileSectionIRToHtml({ ir, kind });
    return {
      id: sectionIdStr as SectionId,
      deckId: 'deck-doc-e2e' as DeckId,
      position,
      ir,
      html,
      kind,
      breakHints: {},
      metadata: {
        title,
        kind,
        narrative: '',
        generatedAt: new Date().toISOString(),
        soulId: SOUL.id as string,
        deckId: 'deck-doc-e2e',
        position,
        metaVersion: '3.0',
        revisionHash: 'rev-' + sectionIdStr,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const sections: Section[] = [
    makeSection(
      'sec-cover', 'cover',
      { body: [{ type: 'hero', title: [{ text: 'Pengui Charts — A4 report' }] }] },
      0, 'Cover',
    ),
    makeSection(
      'sec-bar', 'chart',
      {
        body: [
          {
            type: 'chart',
            chart_type: 'bar',
            data: [[42, 58, 71, 64], [30, 45, 60, 55]],
            series_labels: ['North', 'South'],
            category_labels: ['Q1', 'Q2', 'Q3', 'Q4'],
            x_axis_title: 'Quarter',
            y_axis_title: 'USD (M)',
            show_legend: true,
            caption: [{ text: 'Two regions, four quarters.' }],
          },
        ],
      },
      1, 'Quarterly revenue',
    ),
    makeSection(
      'sec-mixed', 'prose',
      {
        body: [
          { type: 'heading', level: 2, text: [{ text: 'Channel mix discussion' }] },
          { type: 'prose', body: [{ text: 'The donut chart below is rendered inline in a prose section — no kind=chart wrapper required because chart is a leaf node and prose sections accept arbitrary leaves.' }] },
          {
            type: 'chart',
            chart_type: 'donut',
            data: [[40, 30, 20, 10]],
            category_labels: ['Direct', 'Search', 'Referral', 'Other'],
            show_legend: true,
          },
          { type: 'prose', body: [{ text: 'Direct continues to dominate, but search converts the best per visitor and is the channel we should invest in for Q4.' }] },
        ],
      },
      2, 'Channel mix discussion',
    ),
  ];

  // Sanity: section.html must STILL contain the placeholder (composer
  // resolves at compose time). Slide path is the opposite — slide.html
  // already has resolved SVG.
  for (const sec of sections) {
    if (sec.ir.body.some((n) => n.type === 'chart')) {
      if (!sec.html.includes('data-pengui-chart-spec=')) {
        throw new Error(`${sec.id}: expected chart placeholder spec attribute in section.html`);
      }
      console.log(`[ok] ${sec.id} placeholder stored (html=${sec.html.length}b) — composer will resolve`);
    }
  }

  // Build the minimum Deck shape DocumentComposer needs.
  const docDeck: Deck = {
    id: 'deck-doc-e2e' as DeckId,
    slug: 'pengui-charts-a4',
    soulId: SOUL.id,
    title: 'Pengui v4.12 Charts — A4 Document',
    author: 'e2e',
    format: 'print_a4_portrait',
    authoringModel: 'document',
    slideIds: [],
    sectionIds: sections.map((s) => s.id),
    revisions: [],
    documentMeta: { tone: 'neutral' } as DocumentMeta,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Deck;
  const documentMeta: DocumentMeta = docDeck.documentMeta!;

  const docPdfStart = Date.now();
  const docPdf = await pdfExporter.exportDocument({
    sections,
    deck: docDeck,
    soul: SOUL,
    deckTitle: 'Pengui v4.12 Charts A4',
    documentMeta,
    geometry: a4Geometry,
  });
  const docPdfMs = Date.now() - docPdfStart;
  const docPdfPath = resolve(outDir, docPdf.filename);
  writeFileSync(docPdfPath, docPdf.data);
  console.log(`[ok] A4 PDF: ${docPdfPath} (${docPdf.fileSizeBytes} bytes, ${docPdfMs}ms)`);

  if (docPdf.fileSizeBytes < 50_000) {
    throw new Error(`A4 PDF unexpectedly small (${docPdf.fileSizeBytes}b)`);
  }
  if (!docPdf.data.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('A4 PDF does not start with %PDF- magic bytes');
  }

  console.log('\n[done] all artifacts produced. outputs in', outDir);

  await pool.shutdown();
}

main().catch((err) => {
  console.error('[fail]', err);
  process.exit(1);
});
