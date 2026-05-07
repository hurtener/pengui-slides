#!/usr/bin/env -S npx tsx
/**
 * v4.20 architecture-diagram stress test — recreate the user's
 * "Consolidated Semantic Layer" reference slide (Databricks · Unity
 * Catalog medallion architecture) end-to-end through the pengui IR.
 *
 * Tests the full v4.20 primitive suite:
 *   - card.size: 'compact' | 'large'
 *   - card.elevation: 'raised'
 *   - card.header_pill: { label, accent, tone, icon, align }
 *   - card_section: top-level container w/ slide-level body
 *   - arrow: inline SVG glyph + optional caption
 *   - chip.size: 'xs' | 'sm' | 'md' | 'lg'
 *   - SlideIR.canvas: outer rounded card wrapper
 *
 * Plus the v4.19 carry-overs (card.fill, card.border_style,
 * SlideIR.background_color, chip).
 *
 * Run: `npx tsx scripts/e2e-v420-architecture.mts`
 * Out: `output/v420_architecture/`
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
// Palette extracted from the reference slide:
//   - Slide bg: light lavender (#F4F2FF)
//   - Canvas card: white (#FFFFFF) on top of slide bg
//   - Navy primary: #1E2A6E (Databricks pill, Consolidated heading)
//   - Violet secondary: #7B6BFF (Semantic heading, Unity Catalog)
//   - Bronze: #E8A04A, Silver: #B8C0D0, Gold: #F4D03F
//   - Mint success: #22C55E (Trusted Reporting / Delta)
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
    warning: '#F4D03F',
    error: '#EF4444',
    info: '#7B6BFF',
  },
  typography: {
    fontDisplay: "'Inter', sans-serif",
    fontBody: "'Inter', sans-serif",
    fontMono: "'JetBrains Mono', monospace",
    sizeHero: 56, sizeH1: 44, sizeH2: 32, sizeH3: 18,
    sizeBody: 13, sizeLabel: 11, sizeCaption: 10,
    weightNormal: 400, weightMedium: 500, weightBold: 700,
    lineHeightHeading: 1.15, lineHeightBody: 1.45,
    letterSpacingHeading: '-0.02em', letterSpacingBody: '0em',
  },
  spacing: { baseUnit: 8, xs: 4, sm: 8, md: 12, lg: 20, xl: 28, xxl: 40, xxxl: 56, safeAreaInset: 36 },
  shape: {
    none: '0', sm: '6px', md: '10px', lg: '20px', xl: '28px', full: '9999px',
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
    cardPadding: '16px', cardShadow: '0 1px 3px rgba(30,42,110,0.06)', cardBorderWidth: '1px',
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
    canvas: {
      background: '#FFFFFF',
      padding: '32px',
      radius: '24px',
      shadow: 'soft',
    },
    body: [
      // Top header row: SOLUTION pill + big title.
      {
        type: 'two_column', ratio: '1:1', gap: 'lg',
        left: [
          {
            type: 'chip', accent: 'info', tone: 'tint', dot: true, size: 'lg',
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

      // Main 3-col canvas: TPE Sources | Databricks container | AI/Reporting.
      // Ratio matches the target (TPE narrow, Databricks wide, right rail medium).
      {
        type: 'grid', columns: 3, ratio: '2:7:5', gap: 'lg', align_items: 'stretch',
        cells: [
          // ── Left column ─────────────────────────────────────
          // TPE Sources is chrome-less in the target — just icon + title +
          // caption stacked, no border / no fill.
          [
            {
              type: 'card', accent: 'accent', icon: 'database', size: 'large',
              border_style: 'none',
              body: [
                { type: 'heading', level: 3, text: [{ text: 'TPE Sources' }] },
                { type: 'prose', body: [{ text: 'Source systems & legacy warehouses', color: 'muted' }] },
              ],
            },
            {
              type: 'arrow', direction: 'right', accent: 'accent',
            },
          ],

          // ── Middle column: Databricks · Unity Catalog ───────
          [
            {
              type: 'card_section',
              accent: 'accent', border_style: 'dashed', size: 'compact',
              header_pill: {
                label: [{ text: 'Databricks · Unity Catalog' }],
                accent: 'accent', tone: 'solid', icon: 'gem', align: 'center',
              },
              body: [
                // 3-col: lakehouse (wide) | arrow | semantic (narrow).
                {
                  type: 'grid', columns: 3, ratio: '7:1:5', gap: 'sm', align_items: 'center',
                  cells: [
                    [
                      {
                        type: 'card', accent: 'accent', icon: 'database', size: 'compact',
                        eyebrow: [{ text: 'catalog: lakehouse — 3 schemas', color: 'accent' }],
                        body: [
                          {
                            type: 'prose',
                            body: [{ text: 'Medallion architecture: bronze raw → silver cleansed → gold curated.', color: 'muted' }],
                          },
                        ],
                      },
                      {
                        type: 'grid', columns: 3, gap: 'sm', align_items: 'stretch',
                        cells: [
                          [{
                            type: 'card', accent: 'accent_warm', fill: 'tint', size: 'compact',
                            body: [
                              { type: 'heading', level: 5, text: [{ text: 'Bronze', color: 'accent_warm' }] },
                              { type: 'prose', body: [{ text: 'schema: bronze', color: 'muted' }] },
                              { type: 'prose', body: [{ text: 'Raw, ingested as-is from federated sources' }] },
                            ],
                          }],
                          [{
                            type: 'card', accent: 'muted', fill: 'tint', size: 'compact',
                            body: [
                              { type: 'heading', level: 5, text: [{ text: 'Silver', color: 'muted' }] },
                              { type: 'prose', body: [{ text: 'schema: silver', color: 'muted' }] },
                              { type: 'prose', body: [{ text: 'Cleansed, conformed, deduplicated tables' }] },
                            ],
                          }],
                          [{
                            type: 'card', accent: 'warning', fill: 'tint', size: 'compact',
                            body: [
                              { type: 'heading', level: 5, text: [{ text: 'Gold', color: 'warning' }] },
                              { type: 'prose', body: [{ text: 'schema: gold', color: 'muted' }] },
                              { type: 'prose', body: [{ text: 'Curated business marts & aggregates' }] },
                            ],
                          }],
                        ],
                      },
                    ],
                    [
                      { type: 'arrow', direction: 'right', accent: 'accent' },
                    ],
                    [
                      {
                        type: 'card', accent: 'info', icon: 'globe', size: 'compact',
                        eyebrow: [{ text: 'catalog: semantic — 1 schema', color: 'info' }],
                        body: [
                          { type: 'heading', level: 5, text: [{ text: 'Schema: metrics' }] },
                          { type: 'prose', body: [{ text: 'Governed metrics, KPIs & certified views (Delta).', color: 'muted' }] },
                          // Definition-table rows: bulleted label | annotation.
                          {
                            type: 'grid', columns: 2, ratio: '3:2', gap: 'sm', align_items: 'center',
                            cells: [
                              [{ type: 'chip', accent: 'success', tone: 'tint', dot: true, size: 'sm', label: [{ text: 'Views' }] }],
                              [{ type: 'prose', align: 'right', body: [{ text: 'CERTIFIED', color: 'muted' }] }],
                              [{ type: 'chip', accent: 'info', tone: 'tint', dot: true, size: 'sm', label: [{ text: 'Materialized Views' }] }],
                              [{ type: 'prose', align: 'right', body: [{ text: 'PRECOMPUTED', color: 'muted' }] }],
                              [{ type: 'chip', accent: 'success', tone: 'tint', dot: true, size: 'sm', label: [{ text: 'Metric Views' }] }],
                              [{ type: 'prose', align: 'right', body: [{ text: 'KPIS & GOVERNED', color: 'muted' }] }],
                            ],
                          },
                        ],
                      },
                    ],
                  ],
                },

                // Workspaces strip — full-width horizontal chip row beneath,
                // with a right-aligned italic governance annotation.
                {
                  type: 'card', accent: 'muted', fill: 'tint', size: 'compact', body_layout: 'row',
                  body: [
                    { type: 'heading', level: 6, text: [{ text: 'Workspaces', color: 'muted' }] },
                    { type: 'chip', accent: 'muted',       tone: 'tint', dot: true, size: 'xs', label: [{ text: 'dev'  }] },
                    { type: 'chip', accent: 'info',        tone: 'tint', dot: true, size: 'xs', label: [{ text: 'qa'   }] },
                    { type: 'chip', accent: 'accent_warm', tone: 'tint', dot: true, size: 'xs', label: [{ text: 'uat'  }] },
                    { type: 'chip', accent: 'success',     tone: 'tint', dot: true, size: 'xs', label: [{ text: 'prod' }] },
                    {
                      type: 'prose', align: 'right',
                      body: [{ text: 'isolated per environment, governed by Unity Catalog', color: 'muted', italic: true }],
                    },
                  ],
                },
              ],
            },
          ],

          // ── Right column: AI Platform + Trusted Reporting ───
          [
            {
              type: 'card_section',
              accent: 'accent', size: 'compact',
              header_pill: {
                label: [{ text: 'AI Platform' }],
                accent: 'accent', tone: 'solid', icon: 'sparkles', align: 'left',
              },
              body: [
                {
                  type: 'card', accent: 'accent', size: 'compact', border_style: 'none',
                  layout: 'horizontal', icon: 'user',
                  body: [
                    { type: 'heading', level: 5, text: [{ text: 'Insights Agent' }] },
                    { type: 'prose', body: [{ text: 'Answers business questions in natural language.', color: 'muted' }] },
                  ],
                },
                {
                  type: 'card', accent: 'accent', size: 'compact', border_style: 'none',
                  layout: 'horizontal', icon: 'trending-up',
                  body: [
                    { type: 'heading', level: 5, text: [{ text: 'Forecast Agent' }] },
                    { type: 'prose', body: [{ text: 'Projects KPIs from certified metric history.', color: 'muted' }] },
                  ],
                },
                {
                  type: 'card', accent: 'accent', size: 'compact', border_style: 'none',
                  layout: 'horizontal', icon: 'bell',
                  body: [
                    { type: 'heading', level: 5, text: [{ text: 'Ops Agent' }] },
                    { type: 'prose', body: [{ text: 'Monitors thresholds & triggers actions.', color: 'muted' }] },
                  ],
                },
                {
                  type: 'arrow', direction: 'right', accent: 'accent',
                  label: [{ text: 'Reads from semantic.metrics' }],
                },
              ],
            },
            {
              type: 'card_section',
              accent: 'success', size: 'compact',
              header_pill: {
                label: [{ text: 'Trusted Reporting' }],
                accent: 'success', tone: 'solid', icon: 'bar-chart', align: 'left',
              },
              body: [
                {
                  type: 'grid', columns: 3, gap: 'sm', align_items: 'stretch',
                  cells: [
                    [{
                      type: 'card', accent: 'success', size: 'compact', icon: 'bar-chart',
                      body: [
                        { type: 'heading', level: 5, text: [{ text: 'Dashboards' }] },
                        { type: 'prose', body: [{ text: 'Executive & ops KPIs', color: 'muted' }] },
                      ],
                    }],
                    [{
                      type: 'card', accent: 'success', size: 'compact', icon: 'file-text',
                      body: [
                        { type: 'heading', level: 5, text: [{ text: 'Reports' }] },
                        { type: 'prose', body: [{ text: 'Scheduled & ad-hoc', color: 'muted' }] },
                      ],
                    }],
                    [{
                      type: 'card', accent: 'success', size: 'compact', icon: 'trending-up',
                      body: [
                        { type: 'heading', level: 5, text: [{ text: 'Self-service' }] },
                        { type: 'prose', body: [{ text: 'Analyst exploration', color: 'muted' }] },
                      ],
                    }],
                  ],
                },
                {
                  type: 'arrow', direction: 'right', accent: 'success',
                  label: [{ text: 'Reads from semantic.metrics' }],
                },
              ],
            },
          ],
        ],
      },

      // Bottom legend — prose left, chip cluster right-aligned.
      {
        type: 'two_column', ratio: '2:1', gap: 'md',
        left: [
          {
            type: 'prose',
            body: [
              { text: 'One ' }, { text: 'Unity Catalog', bold: true, color: 'accent' },
              { text: ' · lakehouse: bronze · silver · gold · ' },
              { text: 'semantic', bold: true, color: 'info' },
              { text: ': metrics · consumed by reporting & AI agents.', color: 'muted' },
            ],
          },
        ],
        right: [
          {
            type: 'card', size: 'compact', border_style: 'none', body_layout: 'row',
            body: [
              { type: 'chip', accent: 'success', tone: 'tint', dot: true, size: 'sm', label: [{ text: 'Delta' }] },
              { type: 'chip', accent: 'info',    tone: 'tint', dot: true, size: 'sm', label: [{ text: 'Unity Catalog' }] },
              { type: 'chip', accent: 'accent',  tone: 'tint', dot: true, size: 'sm', label: [{ text: 'Agents' }] },
            ],
          },
        ],
      },
    ],
  };
}

async function main(): Promise<void> {
  const outDir = process.env.PENGUI_E2E_OUTDIR ?? resolve(process.cwd(), 'output/v420_architecture');
  mkdirSync(outDir, { recursive: true });

  const logger = new Logger('v420', 'info');
  const pool = new PlaywrightPool({ headless: true, maxPoolSize: 1 });
  const renderer = new SlideRenderer(pool, logger.child('renderer'));

  const tokens = generateTokens(LAYERS);
  const SOUL: DesignSoul = {
    id: soulId('soul-v420'), slug: 'soul-v420', name: 'v4.20 Architecture Soul',
    description: 'Lavender canvas + navy/violet accents for architecture diagrams.',
    status: 'approved', layers: LAYERS, cssTokens: tokens.cssString,
    tokenNames: tokens.tokenNames, allowedFonts: tokens.allowedFonts,
    utilityCss: '', styleGuide: '',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const FONT_FACE_CSS = buildFontFaceCss(SOUL);
  const geometry = getFormat(DEFAULT_FORMAT).geometry;

  console.log('[step] authoring Consolidated Semantic Layer slide');
  const ir = consolidatedSemanticLayer();
  const html = resolveChartRefs(
    compileSlideIRToHtml({ ir, soul: SOUL, geometry, fontFaceCss: FONT_FACE_CSS }),
    SOUL.layers,
  );
  writeFileSync(resolve(outDir, 'consolidated-semantic-layer.html'), html);
  console.log(`[ok] HTML emitted (${html.length} bytes)`);

  console.log('\n[step] compiling SlideDocument (for editable PPTX)');
  const sds = new SlideDocumentService(logger.child('sds'), false);
  const result = await sds.compileSlideHtml(html, 'rev-v420');
  if (!result.document) {
    console.error('[fail] document compile blocked', result.issues);
    process.exit(1);
  }
  console.log(`[ok] SlideDocument: ${result.document.elements.length} elements, ${result.issues.length} issues`);

  const slide: Slide = {
    id: 'slide-arch' as SlideId,
    deckId: 'deck-v420' as DeckId,
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
      deckId: 'deck-v420',
      position: 0,
      metaVersion: 1,
      revisionHash: 'rev-v420',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const slides = [slide];

  console.log('\n[step] export PDF + image PPTX + editable PPTX');
  const pdf = await new PdfExporter(renderer, pool, logger.child('pdf'))
    .export(slides, 'v4.20 Consolidated Semantic Layer');
  writeFileSync(resolve(outDir, pdf.filename), pdf.data);
  console.log(`[ok] PDF: ${pdf.filename} (${pdf.fileSizeBytes} bytes)`);

  const pptx = await new PptxExporter(renderer, logger.child('pptx'))
    .export(slides, 'v4.20 Consolidated Semantic Layer');
  writeFileSync(resolve(outDir, pptx.filename), pptx.data);
  console.log(`[ok] Static PPTX: ${pptx.filename} (${pptx.fileSizeBytes} bytes)`);

  const ePptx = await new EditablePptxExporter(renderer, logger.child('pptx-editable'))
    .export(slides, 'v4.20 Consolidated Semantic Layer Editable');
  writeFileSync(resolve(outDir, ePptx.filename), ePptx.data);
  console.log(`[ok] Editable PPTX: ${ePptx.filename} (${ePptx.fileSizeBytes} bytes)`);

  console.log('\n[step] per-slide hybrid mode report');
  for (const s of ePptx.slides) {
    console.log(`  ${s.slideId}: mode=${s.mode} native=${s.nativeObjectCount} bgFallback=${s.usedBackgroundFallback}`);
  }

  // Debug: dump elements that triggered background disposition.
  const bgElements = (result.document?.elements ?? []).filter((el) => el.exportDisposition === 'background');
  if (bgElements.length > 0) {
    console.log(`\n[debug] ${bgElements.length} element(s) flagged as 'background':`);
    for (const el of bgElements.slice(0, 8)) {
      console.log(`  - kind=${el.kind} selector=${el.selector ?? ''} reason=${el.fallbackReason ?? ''}`);
    }
  }
  console.log(`\n[debug] document.backgroundImage = ${result.document?.backgroundImage ?? 'NONE'}`);

  await pool.shutdown();
  console.log(`\n[done] outputs in ${outDir}`);
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
