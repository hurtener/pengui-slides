#!/usr/bin/env -S npx tsx
/**
 * v4.19 architecture-diagram stress test — recreate the user's
 * "Consolidated Semantic Layer" reference slide (Databricks · Unity
 * Catalog medallion architecture) end-to-end through the pengui IR.
 *
 * Tests the new v4.19 primitives:
 *   - card.fill: 'tint' | 'solid'
 *   - card.border_style: 'dashed'
 *   - chip leaf node (with dot + tone variants)
 *   - slide.background_color (CSS hex override)
 *
 * Run: `npx tsx scripts/e2e-v419-architecture.mts`
 * Out: `output/v419_architecture/`
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
import { buildFontFaceCss } from '../src/domain/souls/font-registry.js';
import { generateTokens } from '../src/domain/souls/token-generator.js';
import { getFormat, DEFAULT_FORMAT } from '../src/domain/formats/format-registry.js';
import type { SlideIR } from '../src/domain/ir/index.js';
import type { Slide } from '../src/types/deck.js';
import type { DeckId, SlideId } from '../src/types/common.js';
import type { SoulLayers, DesignSoul } from '../src/types/design-soul.js';
import { soulId } from '../src/types/common.js';

// ── Soul: light lavender backdrop, navy + violet accents ────────
//
// Match the reference slide palette: very light lavender canvas
// (#F0EDFF), deep navy primary (#1E2A6E), bright violet secondary
// (#7B6BFF), and the medallion-architecture amber/gray/yellow trio
// for BRONZE/SILVER/GOLD.
const LAYERS: SoulLayers = {
  color: {
    canvas: '#F4F2FF',
    surface: '#FFFFFF',
    surfaceAlt: '#F0EDFF',
    border: '#D6D0F5',
    textPrimary: '#1E2A6E',
    textSecondary: '#5C6395',
    textTertiary: '#9098C0',
    textInverse: '#FFFFFF',
    accentPrimary: '#1E2A6E',
    accentSecondary: '#7B6BFF',
    accentWarm: '#E8A04A',
    success: '#22C55E',
    warning: '#FFD500',
    error: '#EF4444',
    info: '#7B6BFF',
  },
  typography: {
    fontDisplay: "'Inter', sans-serif",
    fontBody: "'Inter', sans-serif",
    fontMono: "'JetBrains Mono', monospace",
    sizeHero: 56, sizeH1: 44, sizeH2: 38, sizeH3: 22,
    sizeBody: 14, sizeLabel: 12, sizeCaption: 11,
    weightNormal: 400, weightMedium: 500, weightBold: 700,
    lineHeightHeading: 1.15, lineHeightBody: 1.45,
    letterSpacingHeading: '-0.02em', letterSpacingBody: '0em',
  },
  spacing: { baseUnit: 8, xs: 4, sm: 8, md: 12, lg: 20, xl: 28, xxl: 40, xxxl: 56, safeAreaInset: 40 },
  shape: {
    none: '0', sm: '6px', md: '10px', lg: '16px', xl: '24px', full: '9999px',
    buttonRadius: '8px', cardRadius: '14px', inputRadius: '6px', badgeRadius: '9999px',
  },
  depth: {
    shadowNone: 'none', shadowSoft: '0 1px 3px rgba(30,42,110,0.06)',
    shadowMedium: '0 4px 14px rgba(30,42,110,0.10)',
    shadowElevated: '0 12px 28px rgba(30,42,110,0.16)',
    shadowInner: 'inset 0 2px 4px rgba(0,0,0,0.04)',
    borderWidth: '1px', borderOpacity: 0.1,
  },
  components: {
    cardPadding: '18px', cardShadow: '0 1px 3px rgba(30,42,110,0.06)', cardBorderWidth: '1px',
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

function consolidatedSemanticLayer(): SlideIR {
  return {
    background_color: '#F4F2FF',
    body: [
      // Top header row: SOLUTION pill + big title.
      {
        type: 'two_column', ratio: '1:2', gap: 'lg',
        left: [
          {
            type: 'chip', accent: 'info', tone: 'tint', dot: true,
            label: [{ text: 'Solution' }],
          },
        ],
        right: [
          {
            type: 'heading', level: 1, align: 'right', text: [
              { text: 'Consolidated ', color: 'accent' },
              { text: 'Semantic Layer', color: 'info' },
            ],
          },
          {
            type: 'prose', align: 'right',
            body: [{ text: 'Powered by Databricks · Medallion architecture on Unity Catalog', color: 'muted' }],
          },
        ],
      },

      // Main canvas — three-column grid: Sources | Catalogs | Consumers.
      {
        type: 'grid', columns: 3, gap: 'lg',
        cells: [
          // ── Left column: TPE Sources card ─────────────────────
          [
            {
              type: 'card', accent: 'accent', icon: 'database',
              body: [
                { type: 'heading', level: 3, text: [{ text: 'TPE\nSources' }] },
                { type: 'prose', body: [{ text: 'Source systems & legacy warehouses', color: 'muted' }] },
              ],
            },
          ],
          // ── Middle column: Databricks · Unity Catalog (dashed container) ──
          [
            {
              type: 'card',
              accent: 'accent', border_style: 'dashed',
              body: [
                {
                  type: 'chip', accent: 'accent', tone: 'solid',
                  label: [{ text: 'Databricks · Unity Catalog' }],
                },
                {
                  type: 'heading', level: 6,
                  text: [{ text: 'catalog: lakehouse', color: 'accent' }],
                },
                // BRONZE / SILVER / GOLD trio inline — chips per
                // schema with a tinted card background.
                {
                  type: 'chip', accent: 'accent_warm', tone: 'tint', dot: true,
                  label: [{ text: 'Bronze schema — raw, ingested as-is' }],
                },
                {
                  type: 'chip', accent: 'muted', tone: 'tint', dot: true,
                  label: [{ text: 'Silver schema — cleansed, conformed, deduplicated' }],
                },
                {
                  type: 'chip', accent: 'warning', tone: 'tint', dot: true,
                  label: [{ text: 'Gold schema — curated business marts & aggregates' }],
                },
                { type: 'divider' },
                {
                  type: 'heading', level: 6,
                  text: [{ text: 'catalog: semantic', color: 'info' }],
                },
                {
                  type: 'card', accent: 'info', fill: 'tint',
                  body: [
                    { type: 'heading', level: 5, text: [{ text: 'Schema: metrics' }] },
                    { type: 'prose', body: [{ text: 'Governed metrics, KPIs & certified views (Delta).', color: 'muted' }] },
                    {
                      type: 'chip', accent: 'success', tone: 'tint', dot: true,
                      label: [{ text: 'Views — certified' }],
                    },
                    {
                      type: 'chip', accent: 'info', tone: 'tint', dot: true,
                      label: [{ text: 'Materialized views — precomputed' }],
                    },
                    {
                      type: 'chip', accent: 'success', tone: 'tint', dot: true,
                      label: [{ text: 'Metric views — KPIs & governed metrics' }],
                    },
                  ],
                },
                { type: 'divider' },
                // Workspaces strip
                {
                  type: 'heading', level: 6,
                  text: [{ text: 'Workspaces — isolated per environment, governed by Unity Catalog', color: 'muted' }],
                },
                {
                  type: 'chip', accent: 'muted', tone: 'tint', dot: true,
                  label: [{ text: 'dev' }],
                },
                {
                  type: 'chip', accent: 'info', tone: 'tint', dot: true,
                  label: [{ text: 'qa' }],
                },
                {
                  type: 'chip', accent: 'accent_warm', tone: 'tint', dot: true,
                  label: [{ text: 'uat' }],
                },
                {
                  type: 'chip', accent: 'success', tone: 'tint', dot: true,
                  label: [{ text: 'prod' }],
                },
              ],
            },
          ],
          // ── Right column: AI Platform + Trusted Reporting ─────
          [
            {
              type: 'card', accent: 'accent', fill: 'solid', icon: 'sparkles',
              body: [
                { type: 'heading', level: 4, text: [{ text: 'AI Platform' }] },
                { type: 'prose', body: [{ text: 'Insights Agent — answers business questions in natural language.' }] },
                { type: 'prose', body: [{ text: 'Forecast Agent — projects KPIs from certified metric history.' }] },
                { type: 'prose', body: [{ text: 'Ops Agent — monitors thresholds & triggers actions.' }] },
                { type: 'prose', body: [{ text: '→ Reads from semantic.metrics' }] },
              ],
            },
            {
              type: 'card', accent: 'success', icon: 'bar-chart',
              body: [
                { type: 'heading', level: 4, text: [{ text: 'Trusted Reporting', color: 'success' }] },
                { type: 'prose', body: [{ text: 'Dashboards · executive & ops KPIs', color: 'muted' }] },
                { type: 'prose', body: [{ text: 'Reports · scheduled & ad-hoc', color: 'muted' }] },
                { type: 'prose', body: [{ text: 'Self-service · analyst exploration', color: 'muted' }] },
                { type: 'prose', body: [{ text: '→ Reads from semantic.metrics', color: 'success' }] },
              ],
            },
          ],
        ],
      },

      // Bottom legend strip
      {
        type: 'two_column', ratio: '2:1', gap: 'md',
        left: [
          {
            type: 'prose',
            body: [
              { text: 'One ' }, { text: 'Unity Catalog', bold: true, color: 'accent' },
              { text: ' · ' }, { text: 'lakehouse', bold: true },
              { text: ': bronze · silver · gold · ' }, { text: 'semantic', bold: true },
              { text: ': metrics · consumed by reporting & AI agents.', color: 'muted' },
            ],
          },
        ],
        right: [
          { type: 'chip', accent: 'success', tone: 'tint', dot: true, label: [{ text: 'Delta' }] },
          { type: 'chip', accent: 'info', tone: 'tint', dot: true, label: [{ text: 'Unity Catalog' }] },
          { type: 'chip', accent: 'accent', tone: 'tint', dot: true, label: [{ text: 'Agents' }] },
        ],
      },
    ],
  };
}

async function main(): Promise<void> {
  const outDir = process.env.PENGUI_E2E_OUTDIR ?? resolve(process.cwd(), 'output/v419_architecture');
  mkdirSync(outDir, { recursive: true });

  const logger = new Logger('v419', 'info');
  const pool = new PlaywrightPool({ headless: true, maxPoolSize: 1 });
  const renderer = new SlideRenderer(pool, logger.child('renderer'));

  const tokens = generateTokens(LAYERS);
  const SOUL: DesignSoul = {
    id: soulId('soul-v419'), slug: 'soul-v419', name: 'v4.19 Soul',
    description: 'Lavender + navy + violet for architecture diagrams.',
    status: 'approved', layers: LAYERS, cssTokens: tokens.cssString,
    tokenNames: tokens.tokenNames, allowedFonts: tokens.allowedFonts,
    utilityCss: '', styleGuide: '',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const FONT_FACE_CSS = buildFontFaceCss(SOUL);
  const geometry = getFormat(DEFAULT_FORMAT).geometry;

  // Build the slide.
  console.log('[step] authoring Consolidated Semantic Layer slide');
  const ir = consolidatedSemanticLayer();
  const html = resolveChartRefs(
    compileSlideIRToHtml({ ir, soul: SOUL, geometry, fontFaceCss: FONT_FACE_CSS }),
    SOUL.layers,
  );
  writeFileSync(resolve(outDir, 'consolidated-semantic-layer.html'), html);
  console.log(`[ok] HTML emitted (${html.length} bytes)`);

  // Compile to SlideDocument for editable export.
  console.log('\n[step] compiling SlideDocument (for editable PPTX)');
  const sds = new SlideDocumentService(logger.child('sds'), false);
  const result = await sds.compileSlideHtml(html, 'rev-v419');
  if (!result.document) {
    console.error('[fail] document compile blocked', result.issues);
    process.exit(1);
  }
  console.log(`[ok] SlideDocument: ${result.document.elements.length} elements, ${result.issues.length} issues`);

  const slide: Slide = {
    id: 'slide-arch' as SlideId,
    deckId: 'deck-v419' as DeckId,
    soulId: SOUL.id,
    position: 0,
    sourceKind: 'authored_ir',
    ir,
    html,
    document: result.document,
    metadata: {
      title: 'Consolidated Semantic Layer',
      type: 'content',
      narrative: '',
      generatedAt: new Date().toISOString(),
      soulId: SOUL.id as string,
      deckId: 'deck-v419',
      position: 0,
      metaVersion: 1,
      revisionHash: 'rev-v419',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const slides = [slide];

  console.log('\n[step] export PDF + image PPTX + editable PPTX');
  const pdf = await new PdfExporter(renderer, pool, logger.child('pdf'))
    .export(slides, 'v4.19 Consolidated Semantic Layer');
  writeFileSync(resolve(outDir, pdf.filename), pdf.data);
  console.log(`[ok] PDF: ${pdf.filename} (${pdf.fileSizeBytes} bytes)`);

  const pptx = await new PptxExporter(renderer, logger.child('pptx'))
    .export(slides, 'v4.19 Consolidated Semantic Layer');
  writeFileSync(resolve(outDir, pptx.filename), pptx.data);
  console.log(`[ok] Static PPTX: ${pptx.filename} (${pptx.fileSizeBytes} bytes)`);

  const ePptx = await new EditablePptxExporter(renderer, logger.child('pptx-editable'))
    .export(slides, 'v4.19 Consolidated Semantic Layer Editable');
  writeFileSync(resolve(outDir, ePptx.filename), ePptx.data);
  console.log(`[ok] Editable PPTX: ${ePptx.filename} (${ePptx.fileSizeBytes} bytes)`);

  console.log('\n[step] per-slide hybrid mode report');
  for (const s of ePptx.slides) {
    console.log(`  ${s.slideId}: mode=${s.mode} native=${s.nativeObjectCount} bgFallback=${s.usedBackgroundFallback}`);
  }

  await pool.shutdown();
  console.log(`\n[done] outputs in ${outDir}`);
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
