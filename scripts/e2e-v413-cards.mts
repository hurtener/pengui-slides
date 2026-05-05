#!/usr/bin/env -S npx tsx
/**
 * v4.13 E2E export — drive the real PdfExporter / PptxExporter against
 * a deck that exercises the new `card` IR node + inline color emphasis
 * + soul-themed charts. Verifies the full pipeline:
 *
 *   IR (with cards + color emphasis) → compileSlideIRToHtml
 *     → resolveChartRefs (ECharts SSR) → SlideRenderer (Playwright)
 *     → PDF / PPTX (image + editable)
 *
 * The deck reproduces the spirit of the Galici "Cinco desafíos críticos"
 * slide — six accented cards in a 3×2 grid with semantic icons. The cover
 * uses inline color emphasis on a single keyword, mirroring the Galici
 * cover's "Cuentas Provinciales" highlight.
 *
 * Writes outputs to ./output/Pengui_v413_*  and asserts each artifact is
 * non-trivially sized + has the right magic bytes.
 *
 * Run: `npx tsx scripts/e2e-v413-cards.mts`
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
import { compileSlideIRToHtml } from '../src/domain/ir/index.js';
import { resolveChartRefs } from '../src/domain/rendering/chart-resolver.js';
import { generateTokens } from '../src/domain/souls/token-generator.js';
import { getFormat, DEFAULT_FORMAT } from '../src/domain/formats/format-registry.js';
import type { SlideIR } from '../src/domain/ir/index.js';
import type { Slide } from '../src/types/deck.js';
import type { DeckId, SlideId } from '../src/types/common.js';
import type { SoulLayers, DesignSoul } from '../src/types/design-soul.js';
import { soulId } from '../src/types/common.js';

// ── Soul: punchier accent than the v4.12 pastel default so the card
// borders + chart palette actually pop. Mint/blue/orange triad inspired
// by the Galici dark theme but adapted to a light surface for clarity. ──

const LAYERS: SoulLayers = {
  color: {
    canvas: '#ffffff',
    surface: '#f7f9fc',
    surfaceAlt: '#eef2f7',
    border: '#dde3ec',
    textPrimary: '#0f172a',
    textSecondary: '#475569',
    textTertiary: '#94a3b8',
    textInverse: '#ffffff',
    accentPrimary: '#5b8def',   // strong blue
    accentSecondary: '#3ec1a6', // mint
    accentWarm: '#f59e0b',      // amber
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },
  typography: {
    fontDisplay: "'Inter', sans-serif",
    fontBody: "'Inter', sans-serif",
    fontMono: "'JetBrains Mono', monospace",
    sizeHero: 72, sizeH1: 48, sizeH2: 36, sizeH3: 28,
    sizeBody: 18, sizeLabel: 14, sizeCaption: 12,
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
  id: soulId('soul-v413-e2e'),
  slug: 'soul-v413-e2e',
  name: 'v4.13 E2E Soul',
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

// ── Slide IRs ─────────────────────────────────────────────────────

// Cover — hero with inline color emphasis on ONE keyword (the v4.13
// surfacing demo). Mirrors Galici's "Cuentas Provinciales" green accent.
const COVER_IR: SlideIR = {
  layout: 'centered',
  body: [
    {
      type: 'hero',
      align: 'center',
      eyebrow: [{ text: 'Pengui v4.13 · MAYO 2026' }],
      title: [
        { text: 'Cards, accents, and ' },
        { text: 'inline color', color: 'success', bold: true },
        { text: '.' },
      ],
      subtitle: [
        { text: 'A grounded reproduction of the design-team card pattern.' },
      ],
    },
  ],
};

// Cinco desafíos — 3×2 grid of accented cards with lucide icons + eyebrows.
// Reproduces the structure of Galici slide 5 ("Cinco desafíos críticos").
const CARDS_IR: SlideIR = {
  body: [
    {
      type: 'heading',
      level: 2,
      text: [
        { text: 'Six challenges: ' },
        { text: 'limited control', color: 'error', bold: true },
        { text: ', operational risk, and ' },
        { text: 'low optimization', color: 'warning', bold: true },
        { text: '.' },
      ],
    },
    {
      type: 'grid',
      columns: 3,
      gap: 'md',
      cells: [
        [{
          type: 'card',
          accent: 'info',
          icon: 'layers',
          eyebrow: [{ text: '01 · TRACEABILITY' }],
          body: [
            { type: 'heading', level: 4, text: [{ text: 'Fragmented control' }] },
            { type: 'prose', body: [{ text: 'Files and accounts are not systematically audited end-to-end.' }] },
          ],
        }],
        [{
          type: 'card',
          accent: 'accent',
          icon: 'eye',
          eyebrow: [{ text: '02 · VISIBILITY' }],
          body: [
            { type: 'heading', level: 4, text: [{ text: 'Isolated operations' }] },
            { type: 'prose', body: [{ text: 'Each branch operates alone — no unified view of total funds.' }] },
          ],
        }],
        [{
          type: 'card',
          accent: 'accent_warm',
          icon: 'gauge',
          eyebrow: [{ text: '03 · OPTIMIZATION' }],
          body: [
            { type: 'heading', level: 4, text: [{ text: 'Idle funds' }] },
            { type: 'prose', body: [{ text: 'Immobilized capital lacks systematic short-term investment.' }] },
          ],
        }],
        [{
          type: 'card',
          accent: 'success',
          icon: 'lock',
          eyebrow: [{ text: '04 · SECURITY' }],
          body: [
            { type: 'heading', level: 4, text: [{ text: 'Informal flows' }] },
            { type: 'prose', body: [{ text: 'Movements do not follow formal digital authorization paths.' }] },
          ],
        }],
        [{
          type: 'card',
          accent: 'accent_alt',
          icon: 'bar-chart',
          eyebrow: [{ text: '05 · REPORTING' }],
          body: [
            { type: 'heading', level: 4, text: [{ text: 'No exec dashboard' }] },
            { type: 'prose', body: [{ text: 'No board view of balances, active accounts, or upcoming maturities.' }] },
          ],
        }],
        [{
          type: 'card',
          accent: 'error',
          icon: 'alert-triangle',
          eyebrow: [{ text: '200K' }],
          body: [
            { type: 'heading', level: 3, text: [{ text: 'active accounts' }] },
            { type: 'prose', body: [{ text: 'Operated today without a centralized system.' }] },
          ],
        }],
      ],
    },
  ],
};

// Soul-themed chart sanity — the v4.12 bar chart against the v4.13 punchier
// accent so the chart-theme-bridge palette is visibly soul-derived.
const CHART_IR: SlideIR = {
  body: [
    {
      type: 'heading',
      level: 2,
      text: [
        { text: 'Quarterly revenue — ' },
        { text: 'soul-themed palette', color: 'accent', bold: true },
        { text: '.' },
      ],
    },
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
      caption: [{ text: 'ECharts colors derived from the soul accent rotation.' }],
    },
  ],
};

// Two-column with cards on each side — proves cards work inside containers.
const TWOCOL_IR: SlideIR = {
  body: [
    { type: 'heading', level: 2, text: [{ text: 'Cards work in two-column too' }] },
    {
      type: 'two_column',
      ratio: '1:1',
      gap: 'lg',
      left: [{
        type: 'card',
        accent: 'success',
        icon: 'check',
        eyebrow: [{ text: 'IN SCOPE' }],
        body: [
          { type: 'heading', level: 4, text: [{ text: 'What ships in v4.13' }] },
          { type: 'list', style: 'bullet', items: [
            [{ text: 'Card IR node with accent + icon' }],
            [{ text: 'Curated lucide icon set (~32 icons)' }],
            [{ text: 'Inline color emphasis surfaced in prompts' }],
            [{ text: 'Soul-themed chart palette validated' }],
          ] },
        ],
      }],
      right: [{
        type: 'card',
        accent: 'warning',
        icon: 'x',
        eyebrow: [{ text: 'DEFERRED' }],
        body: [
          { type: 'heading', level: 4, text: [{ text: 'Lands in v4.14+' }] },
          { type: 'list', style: 'bullet', items: [
            [{ text: 'Slide chrome (persistent header/footer)' }],
            [{ text: 'Premium font pipeline' }],
            [{ text: 'Decoration / ornament node' }],
            [{ text: 'Flow / pipeline node' }],
          ] },
        ],
      }],
    },
  ],
};

// ── Slide builders ───────────────────────────────────────────────

function makeSlide(slideIdStr: string, ir: SlideIR, position: number, title: string): Slide {
  const geometry = getFormat(DEFAULT_FORMAT).geometry;
  const raw = compileSlideIRToHtml({ ir, soul: SOUL, geometry });
  const html = resolveChartRefs(raw, SOUL.layers);
  return {
    id: slideIdStr as SlideId,
    deckId: 'deck-v413-e2e' as DeckId,
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
      deckId: 'deck-v413-e2e',
      position,
      metaVersion: '1.0',
      revisionHash: 'rev-' + slideIdStr,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ── Driver ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const outDir = process.env.PENGUI_E2E_OUTDIR ?? resolve(process.cwd(), 'output');
  mkdirSync(outDir, { recursive: true });

  const logger = new Logger('e2e-v413', 'info');
  const pool = new PlaywrightPool({ headless: true, maxPoolSize: 2 });
  const renderer = new SlideRenderer(pool, logger.child('renderer'));

  const slides: Slide[] = [
    makeSlide('slide-cover',  COVER_IR,  0, 'Cover — inline color emphasis'),
    makeSlide('slide-cards',  CARDS_IR,  1, 'Six accented cards (3×2)'),
    makeSlide('slide-chart',  CHART_IR,  2, 'Soul-themed chart'),
    makeSlide('slide-twocol', TWOCOL_IR, 3, 'Cards in two-column'),
  ];

  // Sanity — every card slide must carry the accent class + icon SVG.
  const cardSlide = slides.find((s) => s.id === 'slide-cards')!;
  if (!cardSlide.html.includes('pengui-card-accent-')) {
    throw new Error('cards slide missing pengui-card-accent-* — accent compilation regressed');
  }
  if (!cardSlide.html.includes('<svg')) {
    throw new Error('cards slide missing inline SVG — icons did not render');
  }
  // Spot-check that AT LEAST one of the lucide-distinctive path
  // fragments is present in the rendered HTML — proves icons.ts is wired.
  const ICON_FRAGMENTS = ['M20 13c0 5', 'M20 6 9 17l-5-5', 'M2 12s3-7'];
  const anyIcon = ICON_FRAGMENTS.some((frag) => cardSlide.html.includes(frag));
  if (!anyIcon) throw new Error('expected at least one curated lucide icon path in cards slide');
  console.log(`[ok] slide-cards: accent classes + ${ICON_FRAGMENTS.filter((f) => cardSlide.html.includes(f)).length} icon paths verified`);

  // Cover sanity — inline color emphasis (pengui-text-success) must be present.
  const cover = slides.find((s) => s.id === 'slide-cover')!;
  if (!cover.html.includes('pengui-text-success')) {
    throw new Error('cover missing pengui-text-success — inline color emphasis regressed');
  }
  console.log('[ok] slide-cover: inline color emphasis present');

  // Chart sanity — make sure the chart-theme-bridge swap fired.
  const chart = slides.find((s) => s.id === 'slide-chart')!;
  if (chart.html.includes('chart pending')) {
    throw new Error('chart slide still has placeholder body — chart resolver did not run');
  }
  if (!chart.html.includes('var(--color-')) {
    throw new Error('chart SVG has no var(--color-*) refs — hex→var swap regressed');
  }
  console.log('[ok] slide-chart: ECharts SSR + soul-token swap verified');

  // ── PDF (image mode — slides_16_9 default) ────────────────────
  console.log('\n[step] PDF export (image mode, slides_16_9)…');
  const pdfExporter = new PdfExporter(renderer, pool, logger.child('pdf'));
  const pdfStart = Date.now();
  const pdf = await pdfExporter.export(slides, 'Pengui v4.13 Cards');
  const pdfMs = Date.now() - pdfStart;
  const pdfPath = resolve(outDir, pdf.filename);
  writeFileSync(pdfPath, pdf.data);
  console.log(`[ok] PDF: ${pdfPath} (${pdf.fileSizeBytes} bytes, ${pdfMs}ms)`);

  if (pdf.fileSizeBytes < 50_000) {
    throw new Error(`PDF unexpectedly small (${pdf.fileSizeBytes}b)`);
  }
  if (!pdf.data.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('PDF does not start with %PDF- magic bytes');
  }

  // ── PPTX (image bundling) ──────────────────────────────────────
  console.log('\n[step] PPTX export (image bundling)…');
  const pptxExporter = new PptxExporter(renderer, logger.child('pptx'));
  const pptxStart = Date.now();
  const pptx = await pptxExporter.export(slides, 'Pengui v4.13 Cards');
  const pptxMs = Date.now() - pptxStart;
  const pptxPath = resolve(outDir, pptx.filename);
  writeFileSync(pptxPath, pptx.data);
  console.log(`[ok] PPTX: ${pptxPath} (${pptx.fileSizeBytes} bytes, ${pptxMs}ms)`);

  if (pptx.fileSizeBytes < 50_000) {
    throw new Error(`PPTX unexpectedly small (${pptx.fileSizeBytes}b)`);
  }
  if (pptx.data[0] !== 0x50 || pptx.data[1] !== 0x4b) {
    throw new Error('PPTX does not start with PK zip magic bytes');
  }

  // ── PPTX (editable hybrid — native shapes where possible) ─────
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
  const ePptx = await editableExporter.export(editableSlides, 'Pengui v4.13 Cards Editable');
  const ePptxMs = Date.now() - ePptxStart;
  const ePptxPath = resolve(outDir, ePptx.filename);
  writeFileSync(ePptxPath, ePptx.data);
  const modeReport = ePptx.slides
    .map((s) => `${s.slideId}: mode=${s.mode} native=${s.nativeObjectCount} bgFallback=${s.usedBackgroundFallback}`)
    .join('\n  ');
  console.log(`[ok] Editable PPTX: ${ePptxPath} (${ePptx.fileSizeBytes} bytes, ${ePptxMs}ms)\n  ${modeReport}`);

  if (ePptx.fileSizeBytes < 50_000) {
    throw new Error(`Editable PPTX unexpectedly small (${ePptx.fileSizeBytes}b)`);
  }

  console.log('\n[done] all v4.13 artifacts produced. outputs in', outDir);

  await pool.shutdown();
}

main().catch((err) => {
  console.error('[fail]', err);
  process.exit(1);
});
