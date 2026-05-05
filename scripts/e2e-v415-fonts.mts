#!/usr/bin/env -S npx tsx
/**
 * v4.15 E2E — bundled premium fonts.
 *
 * Validates BOTH parity tracks — Phase A (static / image) and Phase B
 * (editable PPTX OOXML embedding) — by building the same 4-slide deck
 * (cover, content, cards, chart) twice with two souls:
 *
 *   - Soul A "system":   fontDisplay/Body = Helvetica, no bundled font referenced
 *   - Soul B "bundled":  fontDisplay = Inter Display, fontBody = Inter,
 *                        fontMono = JetBrains Mono — all bundled
 *
 * Assertions:
 *
 *   1. Slide HTML for Soul B carries `@font-face` rules with
 *      `data:font/ttf;base64,…` URIs for the referenced families.
 *   2. Slide HTML for Soul A carries no `@font-face` block (system only).
 *   3. PDF + image PPTX render successfully for both souls (Playwright
 *      uses the embedded TTF when present).
 *   4. Editable PPTX for Soul B contains:
 *      - `ppt/fonts/font<N>.fntdata` parts for Inter / Inter Display /
 *        JetBrains Mono
 *      - `[Content_Types].xml` Default extension entry for `fntdata`
 *      - `ppt/_rels/presentation.xml.rels` Relationship entries pointing
 *        at each font part
 *      - `<p:embeddedFontLst>` block in `ppt/presentation.xml` listing
 *        each typeface with regular / bold variants
 *   5. Editable PPTX for Soul A contains NO embedded font parts
 *      (system fonts shouldn't be embedded).
 *   6. File size delta between Soul A and Soul B editable PPTX is bounded:
 *      Soul B should be ~+1MB to +3MB larger (the ~1.5MB of TTFs +
 *      OOXML overhead). Anything >5MB is a regression.
 *
 * Run: `npx tsx scripts/e2e-v415-fonts.mts`
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
import { resolveAssetRefs } from '../src/domain/assets/asset-resolver.js';
import { AssetService } from '../src/domain/assets/asset-service.js';
import { InMemoryAssetStore } from '../src/storage/memory/asset-store.js';
import { generateTokens } from '../src/domain/souls/token-generator.js';
import {
  buildFontFaceCss,
  resolveFontsForEmbedding,
} from '../src/domain/souls/font-registry.js';
import { getFormat, DEFAULT_FORMAT } from '../src/domain/formats/format-registry.js';
import type { SlideIR, DeckChrome } from '../src/domain/ir/index.js';
import type { Slide } from '../src/types/deck.js';
import type { DeckId, SlideId } from '../src/types/common.js';
import type { SoulLayers, DesignSoul } from '../src/types/design-soul.js';
import { soulId } from '../src/types/common.js';

function buildLayers(typo: Pick<SoulLayers['typography'], 'fontDisplay' | 'fontBody' | 'fontMono'>): SoulLayers {
  return {
    color: {
      canvas: '#ffffff', surface: '#f7f9fc', surfaceAlt: '#eef2f7', border: '#dde3ec',
      textPrimary: '#0f172a', textSecondary: '#475569', textTertiary: '#94a3b8', textInverse: '#ffffff',
      accentPrimary: '#5b8def', accentSecondary: '#3ec1a6', accentWarm: '#f59e0b',
      success: '#10b981', warning: '#f59e0b', error: '#ef4444', info: '#3b82f6',
    },
    typography: {
      fontDisplay: typo.fontDisplay, fontBody: typo.fontBody, fontMono: typo.fontMono,
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
}

function buildSoul(id: string, layers: SoulLayers): DesignSoul {
  const tokens = generateTokens(layers);
  return {
    id: soulId(id),
    slug: id, name: id,
    description: '', status: 'approved',
    layers, cssTokens: tokens.cssString,
    tokenNames: tokens.tokenNames, allowedFonts: tokens.allowedFonts,
    utilityCss: '', styleGuide: '',
    createdAt: '2026-05-05T00:00:00.000Z', updatedAt: '2026-05-05T00:00:00.000Z',
  };
}

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 32" width="120" height="32">
  <rect x="2" y="4" width="28" height="24" rx="4" fill="#5b8def"/>
  <text x="16" y="22" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="18" font-weight="800" fill="#ffffff">P</text>
  <text x="38" y="22" font-family="Helvetica,Arial,sans-serif" font-size="14" font-weight="700" fill="#0f172a" letter-spacing="2">PENGUI</text>
</svg>`;

function buildSlideIRs(): Array<{ id: string; ir: SlideIR; title: string }> {
  const COVER_IR: SlideIR = {
    layout: 'centered',
    body: [{
      type: 'hero', align: 'center',
      eyebrow: [{ text: 'PENGUI v4.15 · BUNDLED FONTS' }],
      title: [
        { text: 'Premium typography ' },
        { text: 'travels with the deck', color: 'success', bold: true },
        { text: '.' },
      ],
      subtitle: [{ text: 'Inter, Inter Display, JetBrains Mono — embedded in every export.' }],
    }],
  };
  const CONTENT_IR: SlideIR = {
    body: [
      { type: 'heading', level: 2, text: [{ text: 'Body copy in the bundled face.' }] },
      { type: 'prose', body: [{ text: 'Same render on any host. Fonts ride inside the file — no install required, no fallback to Helvetica, no AI-generated tell.' }] },
    ],
  };
  const CARDS_IR: SlideIR = {
    body: [
      { type: 'heading', level: 2, text: [{ text: 'Cards.' }] },
      {
        type: 'grid', columns: 3, gap: 'md',
        cells: [
          [{
            type: 'card', accent: 'info', icon: 'layers',
            eyebrow: [{ text: 'TYPOGRAPHY' }],
            body: [
              { type: 'heading', level: 4, text: [{ text: 'Display family' }] },
              { type: 'prose', body: [{ text: 'Inter Display Bold for hero headings.' }] },
            ],
          }],
          [{
            type: 'card', accent: 'success', icon: 'check',
            eyebrow: [{ text: 'BODY' }],
            body: [
              { type: 'heading', level: 4, text: [{ text: 'Inter Regular' }] },
              { type: 'prose', body: [{ text: 'Optical sizes for running text.' }] },
            ],
          }],
          [{
            type: 'card', accent: 'accent_warm', icon: 'gauge',
            eyebrow: [{ text: 'CHROME' }],
            body: [
              { type: 'heading', level: 4, text: [{ text: 'JetBrains Mono' }] },
              { type: 'prose', body: [{ text: 'Footer + page-number labels.' }] },
            ],
          }],
        ],
      },
    ],
  };
  const CHART_IR: SlideIR = {
    body: [
      { type: 'heading', level: 2, text: [
        { text: 'Quarterly revenue — ' },
        { text: 'rendered with bundled font', color: 'accent', bold: true },
        { text: '.' },
      ] },
      {
        type: 'chart', chart_type: 'bar',
        data: [[42, 58, 71, 64], [30, 45, 60, 55]],
        series_labels: ['North', 'South'],
        category_labels: ['Q1', 'Q2', 'Q3', 'Q4'],
        x_axis_title: 'Quarter', y_axis_title: 'USD (millions)',
        show_legend: true, show_grid: true, value_format: 'compact',
        caption: [{ text: 'Even chart axis labels use the embedded face.' }],
      },
      { type: 'prose', body: [{ text: 'Editable PPTX exporter writes the TTFs into the package; PowerPoint reads <p:embeddedFontLst> and renders text shapes with the bundled face on any host.' }] },
    ],
  };
  return [
    { id: 'slide-cover',   ir: COVER_IR,   title: 'Cover' },
    { id: 'slide-content', ir: CONTENT_IR, title: 'Content' },
    { id: 'slide-cards',   ir: CARDS_IR,   title: 'Cards' },
    { id: 'slide-chart',   ir: CHART_IR,   title: 'Chart' },
  ];
}

async function buildAndExport(args: {
  label: string;
  soul: DesignSoul;
  outDir: string;
  renderer: SlideRenderer;
  pool: PlaywrightPool;
  logger: Logger;
  assetService: AssetService;
  logoAssetId: string;
}): Promise<{
  htmls: string[];
  editablePptxBytes: Buffer;
  editablePptxPath: string;
  pdfPath: string;
  pptxPath: string;
  fontFaceCss: string;
}> {
  const { label, soul, outDir, renderer, pool, logger, assetService, logoAssetId } = args;
  const SLIDES_AUTHORED = buildSlideIRs();
  const totalCount = SLIDES_AUTHORED.length;
  const fontFaceCss = buildFontFaceCss(soul);
  console.log(`\n[${label}] @font-face block size: ${fontFaceCss.length} chars`);

  const CHROME: DeckChrome = {
    header: {
      left: { kind: 'logo', asset_id: logoAssetId, height: 'md' },
      right: { kind: 'text', content: [{ text: `${label} font test` }] },
    },
    footer: {
      left: { kind: 'text', content: [{ text: 'Pengui v4.15 · Font parity demo' }] },
      right: { kind: 'page_number', format: '1/N' },
    },
    showOnCover: false,
  };

  async function buildSlide(idx: number): Promise<Slide> {
    const { id, ir, title } = SLIDES_AUTHORED[idx];
    const geometry = getFormat(DEFAULT_FORMAT).geometry;
    const isCover = idx === 0;
    const chromeArgs =
      CHROME.showOnCover === true || !isCover
        ? { chrome: CHROME, slidePosition: idx + 1, slideCount: totalCount }
        : {};
    const raw = compileSlideIRToHtml({ ir, soul, geometry, fontFaceCss, ...chromeArgs });
    const charted = resolveChartRefs(raw, soul.layers);
    const html = await resolveAssetRefs(charted, assetService);
    return {
      id: id as SlideId, deckId: `deck-v415-${label}` as DeckId,
      position: idx, ir, html, sourceKind: 'authored_ir',
      metadata: {
        title, type: 'content', narrative: '',
        keyPoints: [], dataPoints: [], tags: [],
        generatedAt: new Date().toISOString(),
        soulId: soul.id as string, deckId: `deck-v415-${label}`,
        position: idx, metaVersion: '1.0', revisionHash: 'rev-' + id,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  const slides: Slide[] = [];
  for (let i = 0; i < totalCount; i++) slides.push(await buildSlide(i));

  // Compile to slide documents
  const slideDocService = new SlideDocumentService(logger.child(`slide-doc-${label}`), true);
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

  // Plug a SoulService stub that returns OUR soul. The exporter accepts
  // a SoulService, but we want to drive it directly without spinning up
  // the full storage stack. Inline a minimal stub.
  const soulServiceStub = {
    get: async (_id: string) => ({ soul }),
  } as unknown as ConstructorParameters<typeof EditablePptxExporter>[2];

  const editableExporter = new EditablePptxExporter(renderer, logger.child(`pptx-editable-${label}`), soulServiceStub);
  const ePptx = await editableExporter.export(editableSlides, `Pengui v4.15 ${label}`, soul.id as string);
  const ePptxPath = resolve(outDir, ePptx.filename);
  writeFileSync(ePptxPath, ePptx.data);
  console.log(`[${label}] Editable PPTX: ${ePptxPath} (${ePptx.fileSizeBytes} bytes)`);

  const pdfExporter = new PdfExporter(renderer, pool, logger.child(`pdf-${label}`));
  const pdf = await pdfExporter.export(slides, `Pengui v4.15 ${label}`);
  const pdfPath = resolve(outDir, pdf.filename);
  writeFileSync(pdfPath, pdf.data);
  console.log(`[${label}] PDF: ${pdfPath} (${pdf.fileSizeBytes} bytes)`);

  const pptxExporter = new PptxExporter(renderer, logger.child(`pptx-${label}`));
  const pptx = await pptxExporter.export(slides, `Pengui v4.15 ${label}`);
  const pptxPath = resolve(outDir, pptx.filename);
  writeFileSync(pptxPath, pptx.data);
  console.log(`[${label}] Static PPTX: ${pptxPath} (${pptx.fileSizeBytes} bytes)`);

  return {
    htmls: slides.map((s) => s.html),
    editablePptxBytes: ePptx.data,
    editablePptxPath: ePptxPath,
    pdfPath, pptxPath, fontFaceCss,
  };
}

async function main(): Promise<void> {
  const outDir = process.env.PENGUI_E2E_OUTDIR ?? resolve(process.cwd(), 'output');
  mkdirSync(outDir, { recursive: true });

  const logger = new Logger('e2e-v415', 'info');
  const clock: Clock = { now: () => new Date().toISOString() };
  const pool = new PlaywrightPool({ headless: true, maxPoolSize: 2 });
  const renderer = new SlideRenderer(pool, logger.child('renderer'));

  const assetStore = new InMemoryAssetStore();
  const assetService = new AssetService(assetStore, clock, logger.child('assets'));
  const logo = await assetService.upload({
    name: 'Pengui logo', filename: 'pengui.svg',
    mimeType: 'image/svg+xml', scope: 'global', role: 'logo',
    dataBase64: Buffer.from(LOGO_SVG, 'utf8').toString('base64'),
  });

  // Soul A — system Helvetica (no bundled match)
  const soulSystem = buildSoul('soul-v415-system', buildLayers({
    fontDisplay: 'Helvetica, sans-serif',
    fontBody: 'Helvetica, sans-serif',
    fontMono: 'Menlo, monospace',
  }));
  // Soul B — bundled Inter family
  const soulBundled = buildSoul('soul-v415-bundled', buildLayers({
    fontDisplay: "'Inter Display', 'Inter', sans-serif",
    fontBody: "'Inter', sans-serif",
    fontMono: "'JetBrains Mono', monospace",
  }));

  // ── Pre-flight: registry resolves the right faces for each soul ─
  console.log('[step] font registry resolution');
  const facesSystem = resolveFontsForEmbedding(soulSystem);
  const facesBundled = resolveFontsForEmbedding(soulBundled);
  console.log(`  system soul → ${facesSystem.length} bundled faces`);
  console.log(`  bundled soul → ${facesBundled.length} bundled faces (${facesBundled.map((f) => `${f.family} ${f.weight}`).join(', ')})`);
  if (facesSystem.length !== 0) {
    throw new Error(`system soul should resolve 0 bundled faces, got ${facesSystem.length}`);
  }
  if (facesBundled.length !== 5) {
    throw new Error(`bundled soul should resolve 5 bundled faces (Inter ×3, Inter Display ×1, JetBrains Mono ×1), got ${facesBundled.length}`);
  }
  console.log('[ok] font registry resolution');

  // ── Build & export both decks ─────────────────────────────────
  const sysOut = await buildAndExport({
    label: 'system', soul: soulSystem, outDir, renderer, pool, logger, assetService,
    logoAssetId: logo.id as string,
  });
  const bunOut = await buildAndExport({
    label: 'bundled', soul: soulBundled, outDir, renderer, pool, logger, assetService,
    logoAssetId: logo.id as string,
  });

  // ── Slide HTML assertions (Phase A — static parity track) ─────
  console.log('\n[step] slide HTML @font-face assertions');
  if (sysOut.fontFaceCss.length !== 0) {
    throw new Error(`system soul should produce empty fontFaceCss, got ${sysOut.fontFaceCss.length} chars`);
  }
  for (const html of sysOut.htmls) {
    if (/data:font\/ttf;base64/.test(html)) {
      throw new Error('system soul slide HTML unexpectedly carries data: font URI');
    }
  }
  console.log('[ok] system soul: no @font-face block in any slide HTML');

  if (bunOut.fontFaceCss.length === 0) {
    throw new Error('bundled soul should produce non-empty fontFaceCss');
  }
  for (const html of bunOut.htmls) {
    if (!/@font-face/.test(html)) {
      throw new Error('bundled soul slide HTML missing @font-face block');
    }
    if (!/data:font\/ttf;base64,/.test(html)) {
      throw new Error('bundled soul slide HTML missing data:font/ttf URI');
    }
    // Each of the 3 family names should appear in a font-family declaration
    for (const family of ["'Inter'", "'Inter Display'", "'JetBrains Mono'"]) {
      if (!html.includes(`font-family: ${family}`)) {
        throw new Error(`bundled soul slide HTML missing @font-face for ${family}`);
      }
    }
  }
  console.log('[ok] bundled soul: every slide HTML has @font-face for Inter / Inter Display / JetBrains Mono');

  // ── Editable PPTX OOXML assertions (Phase B — editable parity) ─
  console.log('\n[step] editable PPTX OOXML font-embedding assertions');
  const { default: JSZip } = await import('jszip');

  // System soul: NO font parts, NO embeddedFontLst
  {
    const zip = await JSZip.loadAsync(sysOut.editablePptxBytes);
    const fontPaths = Object.keys(zip.files).filter(
      (p) => p.startsWith('ppt/fonts/') && !zip.files[p].dir && p.endsWith('.fntdata'),
    );
    if (fontPaths.length !== 0) {
      throw new Error(`system soul editable PPTX should have 0 font parts, got ${fontPaths.length}: ${fontPaths.join(', ')}`);
    }
    const presEntry = zip.file('ppt/presentation.xml');
    const presXml = presEntry ? await presEntry.async('string') : '';
    if (/<p:embeddedFontLst>/.test(presXml)) {
      throw new Error('system soul editable PPTX has unexpected <p:embeddedFontLst>');
    }
    console.log('[ok] system soul: 0 ppt/fonts/* parts, no <p:embeddedFontLst>');
  }

  // Bundled soul: 5 font parts, Default fntdata extension, 5 Relationships,
  // <p:embeddedFontLst> with 3 typefaces (Inter, Inter Display, JetBrains Mono)
  {
    const zip = await JSZip.loadAsync(bunOut.editablePptxBytes);
    const fontPaths = Object.keys(zip.files).filter(
      (p) => p.startsWith('ppt/fonts/') && !zip.files[p].dir && p.endsWith('.fntdata'),
    );
    console.log(`  bundled font parts: ${fontPaths.length} (${fontPaths.join(', ')})`);
    if (fontPaths.length !== 5) {
      throw new Error(`bundled soul editable PPTX expected 5 font parts, got ${fontPaths.length}`);
    }
    for (const fp of fontPaths) {
      const buf = await zip.file(fp)!.async('nodebuffer');
      // TTF magic — first 4 bytes should be 0x00010000 or "OTTO" or "true"
      const magic = buf.subarray(0, 4).toString('hex');
      const truetype = magic === '00010000' || magic === '4f54544f' || magic === '74727565';
      if (!truetype) {
        throw new Error(`${fp} does not start with TTF magic bytes (got 0x${magic})`);
      }
      if (buf.length < 100_000) {
        throw new Error(`${fp} is suspiciously small (${buf.length} bytes) — TTF should be 200KB+`);
      }
    }
    console.log('[ok] all 5 bundled font parts have TTF magic + reasonable size');

    const ctXml = await zip.file('[Content_Types].xml')!.async('string');
    if (!/<Default\s+Extension="fntdata"\s+ContentType="application\/x-fontdata"/.test(ctXml)) {
      throw new Error('bundled soul [Content_Types].xml missing <Default Extension="fntdata"…>');
    }
    console.log('[ok] [Content_Types].xml has fntdata Default extension');

    const relsXml = await zip.file('ppt/_rels/presentation.xml.rels')!.async('string');
    const fontRelMatches = relsXml.match(/Type="http:\/\/schemas\.openxmlformats\.org\/officeDocument\/2006\/relationships\/font"/g);
    if (!fontRelMatches || fontRelMatches.length !== 5) {
      throw new Error(`bundled soul presentation.xml.rels expected 5 font relationships, got ${fontRelMatches?.length ?? 0}`);
    }
    console.log(`[ok] presentation.xml.rels has ${fontRelMatches.length} font Relationship entries`);

    const presXml = await zip.file('ppt/presentation.xml')!.async('string');
    if (!/<p:embeddedFontLst>/.test(presXml)) {
      throw new Error('bundled soul presentation.xml missing <p:embeddedFontLst>');
    }
    const embeddedFonts = presXml.match(/<p:embeddedFont>/g) ?? [];
    if (embeddedFonts.length !== 3) {
      throw new Error(`bundled soul expected 3 <p:embeddedFont> entries (Inter, Inter Display, JetBrains Mono), got ${embeddedFonts.length}`);
    }
    for (const family of ['Inter', 'Inter Display', 'JetBrains Mono']) {
      if (!presXml.includes(`<p:font typeface="${family}"/>`)) {
        throw new Error(`bundled soul presentation.xml <p:embeddedFontLst> missing typeface="${family}"`);
      }
    }
    // Inter embedded font must have BOTH <p:regular> and <p:bold>
    const interBlock = presXml.match(/<p:embeddedFont>(?:(?!<\/p:embeddedFont>)[\s\S])*<p:font typeface="Inter"\/>(?:(?!<\/p:embeddedFont>)[\s\S])*<\/p:embeddedFont>/);
    if (!interBlock || !/<p:regular\b/.test(interBlock[0]) || !/<p:bold\b/.test(interBlock[0])) {
      throw new Error('Inter <p:embeddedFont> missing <p:regular> or <p:bold> slot');
    }
    console.log('[ok] presentation.xml has <p:embeddedFontLst> with 3 typefaces (Inter has regular+bold)');
  }

  // ── File size delta sanity ─────────────────────────────────────
  const delta = bunOut.editablePptxBytes.length - sysOut.editablePptxBytes.length;
  console.log(`\n[step] file-size delta: bundled - system = ${(delta / 1024).toFixed(1)} KB`);
  if (delta < 1_000_000) {
    throw new Error(`bundled PPTX should be ≥1MB larger than system PPTX (got ${delta} bytes) — fonts may not be embedded`);
  }
  if (delta > 5_000_000) {
    throw new Error(`bundled PPTX delta ${delta} bytes exceeds 5MB cap — regression`);
  }
  console.log(`[ok] file-size delta within bounds (1MB ≤ ${(delta / 1024 / 1024).toFixed(2)}MB ≤ 5MB)`);

  console.log('\n[done] v4.15 bundled-fonts parity verified end-to-end. Outputs in', outDir);

  await pool.shutdown();
}

main().catch((err) => {
  console.error('[fail]', err);
  process.exit(1);
});
