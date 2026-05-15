#!/usr/bin/env -S npx tsx
/**
 * v4.22 repro — the SQL-in-callout slide the user reported failing
 * Stage-2 overflow validation. Renders both forms side-by-side so we
 * can verify Phase A (CSS hotfix for inline <code>) and Phase B
 * (block-level code_block primitive) produce readable output.
 *
 * Slide 1: the user's exact IR — callout(kind:note) carrying a long
 *          multi-line SQL string as a single TextRun with code:true.
 *          Pre-v4.22: whitespace collapses, body-font, overflows.
 *          Post-v4.22 Phase A: monospace + pre-wrap, newlines visible.
 *
 * Slide 2: the same SQL wrapped in the new `code_block` primitive.
 *          Block-level chrome, language badge, horizontal scroll.
 *
 * Run: `npx tsx scripts/e2e-v422-sql-callout.mts`
 * Out: `output/v422_sql_callout/`
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger } from '../src/infrastructure/logger.js';
import { PlaywrightPool } from '../src/domain/rendering/playwright-pool.js';
import { SlideRenderer } from '../src/domain/rendering/slide-renderer.js';
import { PdfExporter } from '../src/domain/rendering/pdf-exporter.js';
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

const SQL = `WITH params AS (
  SELECT run_id, start_date, end_date
  FROM us_data_science.data_science.ar_parameter_metadata_prod
  WHERE run_id = :run_id AND LENGTH(run_id) > 1
),
deal_perf AS (
  SELECT run_id, deal_id,
    SUM(impressions)     AS impressions,
    SUM(clicks)          AS clicks,
    SUM(ip_long_reach)   AS ip_long_reach,
    SUM(device_id_reach) AS device_id_reach,
    SUM(completes)       AS completes
  FROM us_data_science.data_science.AR_deals_imps_reach_output_prod
  WHERE run_id = :run_id AND LENGTH(run_id) > 1
  GROUP BY run_id, deal_id
)
SELECT
  dp.deal_id AS Deal_Id,
  ''         AS Deal_Names,
  CAST(dp.impressions     AS BIGINT) AS Impressions,
  CAST(dp.ip_long_reach   AS BIGINT) AS Ip_Long_Reach,
  CAST(dp.device_id_reach AS BIGINT) AS Device_Id_Reach,
  ROUND(dp.impressions / NULLIF(dp.ip_long_reach, 0), 2) AS Freq,
  ROUND(dp.completes  / NULLIF(dp.impressions, 0), 2)      AS VCR,
  ROUND(dp.clicks     / NULLIF(dp.impressions, 0) * 100, 2) AS CTR,
  campaign_period_short
FROM deal_perf dp
CROSS JOIN params p
ORDER BY dp.impressions DESC
LIMIT 10;`;

// Bumped typography baseline — see Phase D in PLAN_v4.22_impl.md.
const LAYERS: SoulLayers = {
  color: {
    canvas: '#FAFAFA',
    surface: '#FFFFFF',
    surfaceAlt: '#F1F3F6',
    border: '#E5E7EB',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textTertiary: '#94A3B8',
    textInverse: '#FFFFFF',
    accentPrimary: '#4F46E5',
    accentSecondary: '#0EA5E9',
    accentWarm: '#F97316',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#0EA5E9',
  },
  typography: {
    fontDisplay: "'Inter', sans-serif",
    fontBody: "'Inter', sans-serif",
    fontMono: "'JetBrains Mono', monospace",
    sizeHero: 64, sizeH1: 44, sizeH2: 32, sizeH3: 22,
    sizeBody: 18, sizeLabel: 14, sizeCaption: 12,
    weightNormal: 400, weightMedium: 500, weightBold: 700,
    lineHeightHeading: 1.15, lineHeightBody: 1.5,
    letterSpacingHeading: '-0.02em', letterSpacingBody: '0em',
  },
  spacing: { baseUnit: 8, xs: 4, sm: 8, md: 12, lg: 20, xl: 28, xxl: 40, xxxl: 56, safeAreaInset: 48 },
  shape: {
    none: '0', sm: '4px', md: '8px', lg: '14px', xl: '22px', full: '9999px',
    buttonRadius: '8px', cardRadius: '12px', inputRadius: '6px', badgeRadius: '9999px',
  },
  depth: {
    shadowNone: 'none', shadowSoft: '0 1px 3px rgba(15,23,42,0.06)',
    shadowMedium: '0 4px 12px rgba(15,23,42,0.08)',
    shadowElevated: '0 12px 28px rgba(15,23,42,0.10)',
    shadowInner: 'inset 0 2px 4px rgba(0,0,0,0.04)',
    borderWidth: '1px', borderOpacity: 0.1,
  },
  components: {
    cardPadding: '20px', cardShadow: '0 1px 3px rgba(15,23,42,0.06)', cardBorderWidth: '1px',
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

function slideCallout(): SlideIR {
  return {
    background: 'canvas',
    body: [
      { type: 'heading', level: 2, text: [{ text: 'Query · callout (legacy IR)' }] },
      {
        type: 'callout',
        kind: 'note',
        body: [{ code: true, text: SQL }],
      },
    ],
  };
}

function slideCodeBlock(): SlideIR {
  return {
    background: 'canvas',
    body: [
      { type: 'heading', level: 2, text: [{ text: 'Query · code_block (v4.22)' }] },
      {
        type: 'code_block',
        language: 'sql',
        code: SQL,
        caption: [{ text: 'us_data_science.data_science · deal performance roll-up' }],
      },
    ],
  };
}

async function compileAndExport(
  ir: SlideIR,
  filename: string,
  soul: DesignSoul,
  fontFaceCss: string,
  pool: PlaywrightPool,
  logger: Logger,
  outDir: string,
): Promise<void> {
  const geometry = getFormat(DEFAULT_FORMAT).geometry;
  const html = resolveChartRefs(
    compileSlideIRToHtml({ ir, soul, geometry, fontFaceCss }),
    soul.layers,
  );
  writeFileSync(resolve(outDir, `${filename}.html`), html);
  console.log(`[ok] ${filename}.html (${html.length} bytes)`);

  const slide: Slide = {
    id: filename as SlideId,
    deckId: 'deck-v422' as DeckId,
    soulId: soul.id,
    position: 0,
    sourceKind: 'authored_ir',
    ir,
    html,
    metadata: {
      title: filename,
      type: 'content',
      narrative: '',
      generatedAt: new Date().toISOString(),
      soulId: soul.id as string,
      deckId: 'deck-v422',
      position: 0,
      metaVersion: 1,
      revisionHash: 'rev-v422',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const renderer = new SlideRenderer(pool, logger.child('renderer'));
  const pdf = await new PdfExporter(renderer, pool, logger.child('pdf'))
    .export([slide], filename);
  writeFileSync(resolve(outDir, pdf.filename), pdf.data);
  console.log(`[ok] ${pdf.filename} (${pdf.fileSizeBytes} bytes)`);
}

async function main(): Promise<void> {
  const outDir = resolve(process.cwd(), 'output/v422_sql_callout');
  mkdirSync(outDir, { recursive: true });

  const logger = new Logger('v422', 'info');
  const pool = new PlaywrightPool({ headless: true, maxPoolSize: 1 });

  const tokens = generateTokens(LAYERS);
  const SOUL: DesignSoul = {
    id: soulId('soul-v422'), slug: 'soul-v422', name: 'v4.22 Code Soul',
    description: 'Slate canvas, indigo accent, mono code blocks.',
    status: 'approved', layers: LAYERS, cssTokens: tokens.cssString,
    tokenNames: tokens.tokenNames, allowedFonts: tokens.allowedFonts,
    utilityCss: '', styleGuide: '',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  const fontFaceCss = buildFontFaceCss(SOUL);

  console.log('[step] slide 1 — callout(kind:note) with code:true text');
  await compileAndExport(slideCallout(), 'callout', SOUL, fontFaceCss, pool, logger, outDir);

  console.log('\n[step] slide 2 — code_block primitive');
  await compileAndExport(slideCodeBlock(), 'code-block', SOUL, fontFaceCss, pool, logger, outDir);

  await pool.shutdown();
  console.log(`\n[done] outputs in ${outDir}`);
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
