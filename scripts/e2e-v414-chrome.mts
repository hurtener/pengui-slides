#!/usr/bin/env -S npx tsx
/**
 * v4.14 E2E export — drive the real PdfExporter / PptxExporter against
 * a deck that exercises the new DeckChrome feature: persistent dual-logo
 * header + footer with text + page-number across every non-cover slide.
 *
 * Reproduces the spirit of the Galici proposal's chrome:
 *   - Header: left logo (CLEAR TECH) + right logo (GALICIA)
 *   - Footer: left text "PROPUESTA · 2026" + right page number "N / Total"
 *   - Cover: chrome auto-hidden (showOnCover: false)
 *   - Other slides: chrome on every slide automatically
 *
 * Verifies the full pipeline:
 *   IR + DeckChrome → compileSlideIRToHtml (with chrome args)
 *     → resolveAssetRefs (logo data URIs) → SlideRenderer (Playwright)
 *     → PDF / PPTX (image + editable)
 *
 * Run: `npx tsx scripts/e2e-v414-chrome.mts`
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

// ── Soul: same v4.13 punchier palette so cards/charts still pop ──

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
  id: soulId('soul-v414-e2e'),
  slug: 'soul-v414-e2e',
  name: 'v4.14 E2E Soul',
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

// ── Synthetic SVG logos ──────────────────────────────────────────
//
// Two minimal brand marks — a circular "C" mark for "CLEAR TECH" and a
// rounded-rectangle "G" mark for "GALICIA". Inline SVG keeps the test
// self-contained (no real-asset dependencies). Using the soul's text
// color via fill="currentColor" doesn't work through <img> tags, so the
// SVGs hard-code their own brand colors.

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

// ── Driver ───────────────────────────────────────────────────────

async function main(): Promise<void> {
  const outDir = process.env.PENGUI_E2E_OUTDIR ?? resolve(process.cwd(), 'output');
  mkdirSync(outDir, { recursive: true });

  const logger = new Logger('e2e-v414', 'info');
  const clock: Clock = { now: () => new Date().toISOString() };
  const pool = new PlaywrightPool({ headless: true, maxPoolSize: 2 });
  const renderer = new SlideRenderer(pool, logger.child('renderer'));

  // Set up an in-memory asset service and register the two logos.
  const assetStore = new InMemoryAssetStore();
  const assetService = new AssetService(assetStore, clock, logger.child('assets'));
  const clearLogo = await assetService.upload({
    name: 'Clear Tech logo',
    filename: 'clear-tech.svg',
    mimeType: 'image/svg+xml',
    scope: 'global',
    role: 'logo',
    dataBase64: Buffer.from(CLEAR_TECH_LOGO_SVG, 'utf8').toString('base64'),
  });
  const galiciaLogo = await assetService.upload({
    name: 'Galicia logo',
    filename: 'galicia.svg',
    mimeType: 'image/svg+xml',
    scope: 'global',
    role: 'logo',
    dataBase64: Buffer.from(GALICIA_LOGO_SVG, 'utf8').toString('base64'),
  });
  console.log(`[ok] uploaded 2 logo assets: ${clearLogo.id}, ${galiciaLogo.id}`);

  // Build the deck-level chrome.
  const CHROME: DeckChrome = {
    header: {
      left: { kind: 'logo', asset_id: clearLogo.id as string, height: 'md' },
      right: { kind: 'logo', asset_id: galiciaLogo.id as string, height: 'md' },
    },
    footer: {
      left: { kind: 'text', content: [{ text: 'Pengui v4.14 · MAYO 2026' }] },
      right: { kind: 'page_number', format: '1/N' },
    },
    showOnCover: false, // Cover gets a clean canvas.
  };

  // ── Slide IRs ────────────────────────────────────────────────

  // Cover — chrome auto-hidden (showOnCover=false). Reuses the v4.13
  // inline-color-emphasis pattern.
  const COVER_IR: SlideIR = {
    layout: 'centered',
    body: [
      {
        type: 'hero',
        align: 'center',
        eyebrow: [{ text: 'PROPUESTA COMERCIAL · MAYO 2026' }],
        title: [
          { text: 'Sistema de Control de ' },
          { text: 'Cuentas Provinciales', color: 'success', bold: true },
          { text: '.' },
        ],
        subtitle: [{ text: 'A v4.14 chrome demo with dual-brand header + page-numbered footer.' }],
      },
    ],
  };

  // Content slide — heading + prose. Chrome appears.
  const CONTENT_IR: SlideIR = {
    body: [
      {
        type: 'heading',
        level: 2,
        text: [
          { text: 'Una operatoria de alto volumen, ' },
          { text: 'descentralizada', color: 'accent_warm', bold: true },
          { text: ' y manual.' },
        ],
      },
      {
        type: 'prose',
        body: [
          { text: 'El Poder Judicial administra hoy cerca de ' },
          { text: '200.000 cuentas bancarias judiciales', color: 'success', bold: true },
          { text: ', una por cada expediente activo. La operatoria está distribuida entre los juzgados de cada localidad, con esquemas de gestión independientes y sin un sistema centralizado de información.' },
        ],
      },
    ],
  };

  // Cards slide — reuses the v4.13 grid+card pattern. Chrome appears.
  const CARDS_IR: SlideIR = {
    body: [
      { type: 'heading', level: 2, text: [{ text: 'Cinco desafíos críticos.' }] },
      {
        type: 'grid',
        columns: 3,
        gap: 'md',
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
            type: 'card', accent: 'accent', icon: 'eye',
            eyebrow: [{ text: '02 · VISIBILITY' }],
            body: [
              { type: 'heading', level: 4, text: [{ text: 'Isolated operations' }] },
              { type: 'prose', body: [{ text: 'Each branch operates alone — no unified view of total funds.' }] },
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

  // Section divider with chrome_override='hide' — proves per-slide opt-out works.
  const FULLBLEED_IR: SlideIR = {
    layout: 'centered',
    background: 'accent',
    chrome_override: 'hide',
    body: [
      {
        type: 'hero',
        align: 'center',
        title: [
          { text: 'Section: Full-bleed without chrome', color: 'inverse' },
        ],
        subtitle: [
          { text: 'chrome_override = "hide" suppresses deck chrome on this slide only.', color: 'inverse' },
        ],
      },
    ],
  };

  // ── Slide builder — directly threads chrome through (mirrors what
  // deck-service does in production via chromeArgsFor). ─────────

  const SLIDES_AUTHORED = [
    { id: 'slide-cover',    ir: COVER_IR,     title: 'Cover (chrome hidden)' },
    { id: 'slide-content',  ir: CONTENT_IR,   title: 'Content with chrome' },
    { id: 'slide-cards',    ir: CARDS_IR,     title: 'Cards with chrome' },
    { id: 'slide-fullbleed',ir: FULLBLEED_IR, title: 'Full-bleed (override)' },
  ];

  const totalCount = SLIDES_AUTHORED.length;

  async function buildSlide(idx: number): Promise<Slide> {
    const { id, ir, title } = SLIDES_AUTHORED[idx];
    const geometry = getFormat(DEFAULT_FORMAT).geometry;

    // Mirror deck-service.chromeArgsFor: cover suppression when
    // showOnCover is not explicitly true.
    const isCover = idx === 0;
    const chromeArgs =
      CHROME.showOnCover === true || !isCover
        ? { chrome: CHROME, slidePosition: idx + 1, slideCount: totalCount }
        : {};

    const raw = compileSlideIRToHtml({ ir, soul: SOUL, geometry, fontFaceCss: buildFontFaceCss(SOUL), ...chromeArgs });
    const charted = resolveChartRefs(raw, SOUL.layers);
    const html = await resolveAssetRefs(charted, assetService);

    return {
      id: id as SlideId,
      deckId: 'deck-v414-e2e' as DeckId,
      position: idx,
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
        deckId: 'deck-v414-e2e',
        position: idx,
        metaVersion: '1.0',
        revisionHash: 'rev-' + id,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const slides: Slide[] = [];
  for (let i = 0; i < totalCount; i++) {
    slides.push(await buildSlide(i));
  }

  // ── Sanity assertions ────────────────────────────────────────

  // Scope assertions to the <body>...</body> region — the <style> block
  // contains documentation comments that legitimately mention the chrome
  // element strings, so a whole-document substring match would
  // false-positive. The body region is what actually renders.
  function bodyRegion(html: string): string {
    const start = html.indexOf('<body>');
    const end = html.indexOf('</body>');
    if (start === -1 || end === -1) return html;
    return html.substring(start, end);
  }
  const HEADER_ELEMENT = '<header class="pengui-chrome-header">';
  const FOOTER_ELEMENT = '<footer class="pengui-chrome-footer">';
  const HAS_CHROME_BODY = '<main class="pengui-chrome-body">';

  const cover = slides[0];
  const coverBody = bodyRegion(cover.html);
  if (coverBody.includes(HEADER_ELEMENT)) {
    throw new Error('cover slide unexpectedly has chrome — showOnCover=false should suppress');
  }
  if (coverBody.includes(HAS_CHROME_BODY)) {
    throw new Error('cover slide unexpectedly wrapped body in pengui-chrome-body');
  }
  console.log('[ok] cover: chrome correctly suppressed');

  for (const slide of [slides[1], slides[2]]) {
    const body = bodyRegion(slide.html);
    if (!body.includes(HEADER_ELEMENT)) {
      throw new Error(`${slide.id}: missing <header class="pengui-chrome-header"> — chrome compilation regressed`);
    }
    if (!body.includes(FOOTER_ELEMENT)) {
      throw new Error(`${slide.id}: missing <footer class="pengui-chrome-footer">`);
    }
    if (!body.includes(HAS_CHROME_BODY)) {
      throw new Error(`${slide.id}: missing <main class="pengui-chrome-body"> wrapper`);
    }
    // Both logos resolved to data URIs?
    if (!body.includes('data:image/svg+xml;base64,')) {
      throw new Error(`${slide.id}: logo asset:// did not resolve to a data URI`);
    }
    if (body.includes('asset://')) {
      throw new Error(`${slide.id}: unresolved asset:// URI present`);
    }
    // Page-number text rendered? Look for the span class usage.
    if (!body.includes('<span class="pengui-chrome-page-number">')) {
      throw new Error(`${slide.id}: missing page-number element`);
    }
    console.log(`[ok] ${slide.id}: chrome present + 2 logos resolved + page number rendered`);
  }

  const fullbleed = slides[3];
  if (bodyRegion(fullbleed.html).includes(HEADER_ELEMENT)) {
    throw new Error('full-bleed slide should not have chrome (chrome_override=hide)');
  }
  console.log('[ok] slide-fullbleed: chrome_override="hide" honored');

  // Quick page-number text spot-check — content slide is position 2/4,
  // cards is 3/4. Default format is "1/N" → "2 / 4" / "3 / 4".
  if (!slides[1].html.includes('2 / 4')) {
    throw new Error('content slide should show "2 / 4" page number');
  }
  if (!slides[2].html.includes('3 / 4')) {
    throw new Error('cards slide should show "3 / 4" page number');
  }
  console.log('[ok] page numbers compute correctly across positions');

  // ── PDF (image mode) ────────────────────────────────────────
  console.log('\n[step] PDF export (image mode, slides_16_9)…');
  const pdfExporter = new PdfExporter(renderer, pool, logger.child('pdf'));
  const pdfStart = Date.now();
  const pdf = await pdfExporter.export(slides, 'Pengui v4.14 Chrome');
  const pdfMs = Date.now() - pdfStart;
  const pdfPath = resolve(outDir, pdf.filename);
  writeFileSync(pdfPath, pdf.data);
  console.log(`[ok] PDF: ${pdfPath} (${pdf.fileSizeBytes} bytes, ${pdfMs}ms)`);
  if (pdf.fileSizeBytes < 50_000) throw new Error(`PDF unexpectedly small (${pdf.fileSizeBytes}b)`);
  if (!pdf.data.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('PDF does not start with %PDF- magic bytes');
  }

  // ── PPTX (image bundling) ───────────────────────────────────
  console.log('\n[step] PPTX export (image bundling)…');
  const pptxExporter = new PptxExporter(renderer, logger.child('pptx'));
  const pptx = await pptxExporter.export(slides, 'Pengui v4.14 Chrome');
  const pptxPath = resolve(outDir, pptx.filename);
  writeFileSync(pptxPath, pptx.data);
  console.log(`[ok] PPTX: ${pptxPath} (${pptx.fileSizeBytes} bytes)`);
  if (pptx.fileSizeBytes < 50_000) throw new Error(`PPTX unexpectedly small`);
  if (pptx.data[0] !== 0x50 || pptx.data[1] !== 0x4b) {
    throw new Error('PPTX missing PK magic bytes');
  }

  // ── PPTX (editable hybrid — native shapes including chrome) ─
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
  const ePptx = await editableExporter.export(editableSlides, 'Pengui v4.14 Chrome Editable');
  const ePptxPath = resolve(outDir, ePptx.filename);
  writeFileSync(ePptxPath, ePptx.data);
  const modeReport = ePptx.slides
    .map((s) => `${s.slideId}: mode=${s.mode} native=${s.nativeObjectCount}`)
    .join('\n  ');
  console.log(`[ok] Editable PPTX: ${ePptxPath} (${ePptx.fileSizeBytes} bytes)\n  ${modeReport}`);

  // The non-cover slides should produce more native objects than the
  // cover (because chrome adds shapes). Loose check: chrome slides have
  // at least 4 more objects than cover.
  const coverCount = ePptx.slides.find((s) => s.slideId === 'slide-cover')!.nativeObjectCount;
  const contentCount = ePptx.slides.find((s) => s.slideId === 'slide-content')!.nativeObjectCount;
  if (contentCount < coverCount + 4) {
    console.warn(`[warn] expected chrome to add 4+ native objects; cover=${coverCount} content=${contentCount}`);
  } else {
    console.log(`[ok] chrome adds ${contentCount - coverCount} native objects vs cover`);
  }

  console.log('\n[done] all v4.14 artifacts produced. outputs in', outDir);

  await pool.shutdown();
}

main().catch((err) => {
  console.error('[fail]', err);
  process.exit(1);
});
