#!/usr/bin/env -S npx tsx
/**
 * v4.21 architecture-diagram NOIR — same Consolidated Semantic Layer
 * content as the v4.20 stress-test, but rebuilt around a dark
 * editorial aesthetic. Single signature accent (electric violet),
 * monospace technical labels, asymmetric composition, dot-grid texture.
 *
 * Goal: a slide that looks like Linear / Vercel / Anthropic
 * collaborated on it. NOT a remake of the parity render — it shares
 * only the content.
 *
 * Run: `npx tsx scripts/e2e-v421-architecture-noir.mts`
 * Out: `output/v421_architecture_noir/`
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

// ── Soul: noir editorial. Near-black canvas, single electric-violet
//    signature accent, restrained earth tones for the medallion layer.
const LAYERS: SoulLayers = {
  color: {
    canvas: '#0A0B0F',
    surface: '#13161D',
    surfaceAlt: '#1A1F2A',
    border: '#262A35',
    textPrimary: '#F0F2F5',
    textSecondary: '#8B92A0',
    textTertiary: '#525968',
    textInverse: '#0A0B0F',
    accentPrimary: '#A78BFA',   // electric violet — the signature
    accentSecondary: '#7DD3FC', // cool cyan — for AI surfaces
    accentWarm: '#D4A574',      // muted bronze
    success: '#5EEAD4',         // mint — for trusted reporting
    warning: '#FACC15',         // gold (less neon than yellow)
    error: '#F87171',
    info: '#A78BFA',            // align with primary accent (one signature)
  },
  typography: {
    fontDisplay: "'Inter', sans-serif",
    fontBody: "'Inter', sans-serif",
    fontMono: "'JetBrains Mono', monospace",
    sizeHero: 84, sizeH1: 64, sizeH2: 32, sizeH3: 18,
    sizeBody: 14, sizeLabel: 11, sizeCaption: 10,
    weightNormal: 400, weightMedium: 500, weightBold: 800,
    lineHeightHeading: 1.04, lineHeightBody: 1.55,
    letterSpacingHeading: '-0.035em', letterSpacingBody: '0em',
  },
  spacing: { baseUnit: 8, xs: 4, sm: 8, md: 12, lg: 20, xl: 32, xxl: 48, xxxl: 72, safeAreaInset: 56 },
  shape: {
    none: '0', sm: '4px', md: '6px', lg: '10px', xl: '14px', full: '9999px',
    buttonRadius: '6px', cardRadius: '10px', inputRadius: '4px', badgeRadius: '9999px',
  },
  depth: {
    shadowNone: 'none',
    shadowSoft: '0 0 0 1px rgba(167,139,250,0.04), 0 8px 24px rgba(0,0,0,0.5)',
    shadowMedium: '0 0 0 1px rgba(167,139,250,0.08), 0 16px 40px rgba(0,0,0,0.6)',
    shadowElevated: '0 0 0 1px rgba(167,139,250,0.12), 0 24px 60px rgba(0,0,0,0.7)',
    shadowInner: 'inset 0 1px 0 rgba(255,255,255,0.04)',
    borderWidth: '1px', borderOpacity: 0.16,
  },
  components: {
    cardPadding: '20px', cardShadow: 'none', cardBorderWidth: '1px',
    buttonPaddingX: '20px', buttonPaddingY: '10px',
    inputPaddingX: '12px', inputPaddingY: '8px', inputBorderWidth: '1px',
    badgePaddingX: '10px', badgePaddingY: '3px',
  },
  motion: {
    durationFast: '100ms', durationNormal: '200ms', durationSlow: '400ms',
    easingDefault: 'ease', easingEmphasized: 'ease-in',
    northStar: '', doRules: [], dontRules: [],
  },
};

function consolidatedSemanticLayerNoir(): SlideIR {
  return {
    background_color: '#0A0B0F',
    // Subtle dot-grid texture on the slide background — gives the deck
    // a "technical surface" feel without adding visual noise.
    decorations: [
      {
        source: { kind: 'preset', name: 'grid_dots' },
        placement: { anchor: 'middle_center', opacity: 0.08 },
        accent: 'muted',
      },
      // Soft radial glow behind the semantic.metrics centerpiece.
      {
        source: { kind: 'preset', name: 'radial_glow' },
        placement: {
          anchor: 'middle_center',
          offset: { x: 0, y: 80 },
          opacity: 0.15,
          size: { width: 720, height: 720 },
        },
        accent: 'accent',
      },
    ],
    body: [
      // ─── Editorial header: pill + title + subtitle, asymmetric ──────
      {
        type: 'two_column', ratio: '1:2', gap: 'lg',
        left: [
          {
            type: 'chip', accent: 'accent', tone: 'outline', dot: true, size: 'md',
            label: [{ text: 'Solution · Architecture' }],
          },
        ],
        right: [
          {
            type: 'heading', level: 1, align: 'left',
            text: [
              { text: 'Consolidated\n' },
              { text: 'Semantic Layer', color: 'accent' },
              { text: '.' },
            ],
          },
          {
            type: 'prose', align: 'left',
            body: [
              { text: 'One catalog. Four schemas. Three agents. ', color: 'muted' },
              { text: 'Trusted KPIs at scale.', color: 'primary' },
            ],
          },
        ],
      },

      // Thin divider rule sets the editorial tone.
      { type: 'divider' },

      // ─── Stage labels: 01 INGEST · 02 GOVERN · 03 SERVE ──────────────
      {
        type: 'grid', columns: 3, ratio: '2:7:5', gap: 'lg', align_items: 'center',
        cells: [
          [{
            type: 'prose', align: 'left',
            body: [
              { text: '01 ', color: 'accent' },
              { text: '· INGEST', color: 'tertiary' },
            ],
          }],
          [{
            type: 'prose', align: 'left',
            body: [
              { text: '02 ', color: 'accent' },
              { text: '· GOVERN', color: 'tertiary' },
            ],
          }],
          [{
            type: 'prose', align: 'left',
            body: [
              { text: '03 ', color: 'accent' },
              { text: '· SERVE', color: 'tertiary' },
            ],
          }],
        ],
      },

      // ─── Main 3-col architecture ────────────────────────────────────
      {
        type: 'grid', columns: 3, ratio: '2:7:5', gap: 'lg', align_items: 'stretch',
        cells: [
          // Stage 01 — TPE Sources (chrome-less, big icon, mono caption).
          [
            {
              type: 'card', accent: 'muted', icon: 'database', size: 'large',
              border_style: 'none',
              body: [
                { type: 'heading', level: 3, text: [{ text: 'TPE Sources' }] },
                {
                  type: 'prose',
                  body: [{ text: 'Source systems & legacy warehouses. Federated, ingested as-is.', color: 'muted' }],
                },
                {
                  type: 'chip', accent: 'muted', tone: 'outline', size: 'xs',
                  label: [{ text: 'legacy DWH · CDC · API' }],
                },
              ],
            },
          ],

          // Stage 02 — Databricks · Unity Catalog (the centerpiece).
          [
            {
              type: 'card_section',
              accent: 'accent', size: 'compact', elevation: 'raised',
              header_pill: {
                label: [{ text: 'Databricks · Unity Catalog' }],
                accent: 'accent', tone: 'solid', icon: 'gem', align: 'center',
              },
              body: [
                // Lakehouse + arrow + Semantic.
                {
                  type: 'grid', columns: 3, ratio: '7:1:5', gap: 'sm', align_items: 'stretch',
                  cells: [
                    [
                      {
                        type: 'card', accent: 'muted', icon: 'layers', size: 'compact',
                        border_style: 'none',
                        eyebrow: [{ text: 'catalog · lakehouse', color: 'tertiary' }],
                        body: [
                          {
                            type: 'prose',
                            body: [{ text: 'medallion: bronze → silver → gold', color: 'muted' }],
                          },
                        ],
                      },
                      {
                        type: 'grid', columns: 3, gap: 'sm', align_items: 'stretch',
                        cells: [
                          [{
                            type: 'card', accent: 'accent_warm', fill: 'tint', size: 'compact',
                            body: [
                              {
                                type: 'chip', accent: 'accent_warm', tone: 'tint', dot: true, size: 'xs',
                                label: [{ text: 'bronze' }],
                              },
                              { type: 'heading', level: 5, text: [{ text: 'Bronze' }] },
                              { type: 'prose', body: [{ text: 'raw · ingested', color: 'muted' }] },
                            ],
                          }],
                          [{
                            type: 'card', accent: 'muted', fill: 'tint', size: 'compact',
                            body: [
                              {
                                type: 'chip', accent: 'muted', tone: 'tint', dot: true, size: 'xs',
                                label: [{ text: 'silver' }],
                              },
                              { type: 'heading', level: 5, text: [{ text: 'Silver' }] },
                              { type: 'prose', body: [{ text: 'cleansed · conformed', color: 'muted' }] },
                            ],
                          }],
                          [{
                            type: 'card', accent: 'warning', fill: 'tint', size: 'compact',
                            body: [
                              {
                                type: 'chip', accent: 'warning', tone: 'tint', dot: true, size: 'xs',
                                label: [{ text: 'gold' }],
                              },
                              { type: 'heading', level: 5, text: [{ text: 'Gold' }] },
                              { type: 'prose', body: [{ text: 'curated · marts', color: 'muted' }] },
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
                        type: 'card', accent: 'accent', icon: 'star', size: 'compact',
                        fill: 'tint',
                        eyebrow: [{ text: 'catalog · semantic ★', color: 'accent' }],
                        body: [
                          { type: 'heading', level: 5, text: [{ text: 'schema: metrics' }] },
                          {
                            type: 'prose',
                            body: [{ text: 'Governed metrics, KPIs & certified views.', color: 'muted' }],
                          },
                          {
                            type: 'grid', columns: 2, ratio: '3:2', gap: 'sm', align_items: 'center',
                            cells: [
                              [{
                                type: 'chip', accent: 'success', tone: 'tint', dot: true, size: 'sm',
                                label: [{ text: 'views' }],
                              }],
                              [{
                                type: 'prose', align: 'right',
                                body: [{ text: 'CERTIFIED', color: 'tertiary' }],
                              }],
                              [{
                                type: 'chip', accent: 'accent', tone: 'tint', dot: true, size: 'sm',
                                label: [{ text: 'materialized' }],
                              }],
                              [{
                                type: 'prose', align: 'right',
                                body: [{ text: 'PRECOMPUTED', color: 'tertiary' }],
                              }],
                              [{
                                type: 'chip', accent: 'success', tone: 'tint', dot: true, size: 'sm',
                                label: [{ text: 'metric views' }],
                              }],
                              [{
                                type: 'prose', align: 'right',
                                body: [{ text: 'KPIS · GOVERNED', color: 'tertiary' }],
                              }],
                            ],
                          },
                        ],
                      },
                    ],
                  ],
                },

                // Workspaces strip — minimal, full-width.
                {
                  type: 'card', accent: 'muted', size: 'compact', body_layout: 'row',
                  border_style: 'none',
                  body: [
                    {
                      type: 'prose',
                      body: [{ text: 'WORKSPACES', color: 'tertiary' }],
                    },
                    { type: 'chip', accent: 'muted', tone: 'outline', size: 'xs', label: [{ text: 'dev' }] },
                    { type: 'chip', accent: 'accent_alt', tone: 'outline', size: 'xs', label: [{ text: 'qa' }] },
                    { type: 'chip', accent: 'accent_warm', tone: 'outline', size: 'xs', label: [{ text: 'uat' }] },
                    { type: 'chip', accent: 'success', tone: 'outline', size: 'xs', label: [{ text: 'prod' }] },
                    {
                      type: 'prose', align: 'right',
                      body: [{ text: 'isolated · governed by Unity Catalog', color: 'tertiary', italic: true }],
                    },
                  ],
                },
              ],
            },
          ],

          // Stage 03 — AI Platform + Trusted Reporting (vertical stack).
          [
            {
              type: 'card_section',
              accent: 'accent_alt', size: 'compact',
              header_pill: {
                label: [{ text: 'AI Platform' }],
                accent: 'accent_alt', tone: 'solid', icon: 'sparkles', align: 'left',
              },
              body: [
                {
                  type: 'card', accent: 'accent_alt', size: 'compact',
                  border_style: 'none', layout: 'horizontal', icon: 'user',
                  body: [
                    { type: 'heading', level: 5, text: [{ text: 'Insights Agent' }] },
                    { type: 'prose', body: [{ text: 'Answers business questions in NL.', color: 'muted' }] },
                  ],
                },
                {
                  type: 'card', accent: 'accent_alt', size: 'compact',
                  border_style: 'none', layout: 'horizontal', icon: 'trending-up',
                  body: [
                    { type: 'heading', level: 5, text: [{ text: 'Forecast Agent' }] },
                    { type: 'prose', body: [{ text: 'Projects KPIs from certified history.', color: 'muted' }] },
                  ],
                },
                {
                  type: 'card', accent: 'accent_alt', size: 'compact',
                  border_style: 'none', layout: 'horizontal', icon: 'bell',
                  body: [
                    { type: 'heading', level: 5, text: [{ text: 'Ops Agent' }] },
                    { type: 'prose', body: [{ text: 'Monitors thresholds & triggers actions.', color: 'muted' }] },
                  ],
                },
                {
                  type: 'arrow', direction: 'right', accent: 'accent_alt',
                  label: [{ text: 'reads · semantic.metrics' }],
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
                      border_style: 'none',
                      body: [
                        { type: 'heading', level: 6, text: [{ text: 'Dashboards' }] },
                        { type: 'prose', body: [{ text: 'exec & ops', color: 'muted' }] },
                      ],
                    }],
                    [{
                      type: 'card', accent: 'success', size: 'compact', icon: 'file-text',
                      border_style: 'none',
                      body: [
                        { type: 'heading', level: 6, text: [{ text: 'Reports' }] },
                        { type: 'prose', body: [{ text: 'scheduled & ad-hoc', color: 'muted' }] },
                      ],
                    }],
                    [{
                      type: 'card', accent: 'success', size: 'compact', icon: 'search',
                      border_style: 'none',
                      body: [
                        { type: 'heading', level: 6, text: [{ text: 'Self-service' }] },
                        { type: 'prose', body: [{ text: 'analyst exploration', color: 'muted' }] },
                      ],
                    }],
                  ],
                },
              ],
            },
          ],
        ],
      },

      { type: 'divider' },

      // ─── Bottom strip: a north-star stat row + technology legend ─────
      {
        type: 'two_column', ratio: '3:2', gap: 'lg',
        left: [
          {
            type: 'prose', align: 'left',
            body: [
              { text: '1 ', bold: true, color: 'accent' },
              { text: 'Unity Catalog · ', color: 'muted' },
              { text: '4 ', bold: true, color: 'primary' },
              { text: 'schemas · ', color: 'muted' },
              { text: '3 ', bold: true, color: 'accent_alt' },
              { text: 'agents · ', color: 'muted' },
              { text: '∞ ', bold: true, color: 'success' },
              { text: 'trusted KPIs', color: 'muted' },
            ],
          },
        ],
        right: [
          {
            type: 'card', size: 'compact', border_style: 'none', body_layout: 'row',
            body: [
              { type: 'chip', accent: 'success', tone: 'outline', dot: true, size: 'sm', label: [{ text: 'Delta' }] },
              { type: 'chip', accent: 'accent', tone: 'outline', dot: true, size: 'sm', label: [{ text: 'Unity Catalog' }] },
              { type: 'chip', accent: 'accent_alt', tone: 'outline', dot: true, size: 'sm', label: [{ text: 'AI Agents' }] },
            ],
          },
        ],
      },
    ],
  };
}

async function main(): Promise<void> {
  const outDir = process.env.PENGUI_E2E_OUTDIR ?? resolve(process.cwd(), 'output/v421_architecture_noir');
  mkdirSync(outDir, { recursive: true });

  const logger = new Logger('v421-noir', 'info');
  const pool = new PlaywrightPool({ headless: true, maxPoolSize: 1 });
  const renderer = new SlideRenderer(pool, logger.child('renderer'));

  const tokens = generateTokens(LAYERS);
  const SOUL: DesignSoul = {
    id: soulId('soul-v421-noir'), slug: 'soul-v421-noir', name: 'v4.21 Noir Architecture Soul',
    description: 'Dark editorial theme — near-black canvas, electric violet accent, monospace tech labels.',
    status: 'approved', layers: LAYERS, cssTokens: tokens.cssString,
    tokenNames: tokens.tokenNames, allowedFonts: tokens.allowedFonts,
    utilityCss: '', styleGuide: '',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const FONT_FACE_CSS = buildFontFaceCss(SOUL);
  const geometry = getFormat(DEFAULT_FORMAT).geometry;

  console.log('[step] authoring Consolidated Semantic Layer (NOIR)');
  const ir = consolidatedSemanticLayerNoir();
  const html = resolveChartRefs(
    compileSlideIRToHtml({ ir, soul: SOUL, geometry, fontFaceCss: FONT_FACE_CSS }),
    SOUL.layers,
  );
  writeFileSync(resolve(outDir, 'consolidated-semantic-layer-noir.html'), html);
  console.log(`[ok] HTML emitted (${html.length} bytes)`);

  console.log('\n[step] compiling SlideDocument (for editable PPTX)');
  const sds = new SlideDocumentService(logger.child('sds'), false);
  const result = await sds.compileSlideHtml(html, 'rev-v421-noir');
  if (!result.document) {
    console.error('[fail] document compile blocked', result.issues);
    process.exit(1);
  }
  console.log(`[ok] SlideDocument: ${result.document.elements.length} elements, ${result.issues.length} issues`);

  const slide: Slide = {
    id: 'slide-arch-noir' as SlideId,
    deckId: 'deck-v421-noir' as DeckId,
    soulId: SOUL.id,
    position: 0,
    sourceKind: 'authored_ir',
    ir,
    html,
    document: result.document,
    metadata: {
      title: 'Consolidated Semantic Layer · Noir',
      type: 'content',
      narrative: '',
      generatedAt: new Date().toISOString(),
      soulId: SOUL.id as string,
      deckId: 'deck-v421-noir',
      position: 0,
      metaVersion: 1,
      revisionHash: 'rev-v421-noir',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const slides = [slide];

  console.log('\n[step] export PDF + image PPTX + editable PPTX');
  const pdf = await new PdfExporter(renderer, pool, logger.child('pdf'))
    .export(slides, 'v4.21 Noir Consolidated Semantic Layer');
  writeFileSync(resolve(outDir, pdf.filename), pdf.data);
  console.log(`[ok] PDF: ${pdf.filename} (${pdf.fileSizeBytes} bytes)`);

  const pptx = await new PptxExporter(renderer, logger.child('pptx'))
    .export(slides, 'v4.21 Noir Consolidated Semantic Layer');
  writeFileSync(resolve(outDir, pptx.filename), pptx.data);
  console.log(`[ok] Static PPTX: ${pptx.filename} (${pptx.fileSizeBytes} bytes)`);

  const ePptx = await new EditablePptxExporter(renderer, logger.child('pptx-editable'))
    .export(slides, 'v4.21 Noir Consolidated Semantic Layer Editable');
  writeFileSync(resolve(outDir, ePptx.filename), ePptx.data);
  console.log(`[ok] Editable PPTX: ${ePptx.filename} (${ePptx.fileSizeBytes} bytes)`);

  await pool.shutdown();
  console.log(`\n[done] outputs in ${outDir}`);
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
