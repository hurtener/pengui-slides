#!/usr/bin/env npx tsx
/**
 * End-to-end print-mode demo: creates a print_a4_portrait deck, adds a
 * cover + TOC + chapter + content-diagram (tree/mind-map) + summary, and
 * exports to A4 PDF.
 *
 * Run after `npm run build`:
 *   npx tsx scripts/print-demo.mts
 *
 * Produces an A4 PDF at ./output/.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// ── Helpers ──────────────────────────────────────────────────────

function log(emoji: string, msg: string) {
  console.error(`${emoji} ${msg}`);
}

function jsonBody(result: unknown): Record<string, unknown> {
  const text = (result as { content: Array<{ text: string }> }).content?.[0]?.text;
  if (!text) throw new Error('empty tool response');
  return JSON.parse(text) as Record<string, unknown>;
}

// ── Design Soul (cozy-premium, shared with e2e-demo.mts) ─────────

const soulLayers = {
  color: {
    canvas: '#FAF8F5',
    surface: '#F5F0EB',
    surfaceAlt: '#EDE8E2',
    border: 'rgba(180, 170, 158, 0.25)',
    textPrimary: '#2C2825',
    textSecondary: '#6B6560',
    textTertiary: '#9A948E',
    textInverse: '#FAF8F5',
    accentPrimary: '#5BA89D',
    accentSecondary: '#7B9DB8',
    accentWarm: '#D4856A',
    success: '#6B9E6B',
    warning: '#C9A84C',
    error: '#C06B5E',
    info: '#7B9DB8',
  },
  typography: {
    fontDisplay: 'Iowan Old Style, Palatino Linotype, serif',
    fontBody: 'Inter, system-ui, sans-serif',
    fontMono: 'JetBrains Mono, monospace',
    sizeHero: 72,
    sizeH1: 48,
    sizeH2: 36,
    sizeH3: 28,
    sizeBody: 18,
    sizeLabel: 14,
    sizeCaption: 12,
    weightNormal: 400,
    weightMedium: 500,
    weightBold: 700,
    lineHeightHeading: 1.2,
    lineHeightBody: 1.6,
    letterSpacingHeading: '-0.02em',
    letterSpacingBody: '0em',
  },
  spacing: {
    baseUnit: 8,
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
    xxxl: 64,
    safeAreaInset: 48,
  },
  shape: {
    none: '0px',
    sm: '4px',
    md: '8px',
    lg: '16px',
    xl: '24px',
    full: '9999px',
    buttonRadius: '12px',
    cardRadius: '16px',
    inputRadius: '12px',
    badgeRadius: '9999px',
  },
  depth: {
    shadowNone: 'none',
    shadowSoft: '0 2px 8px rgba(44, 40, 37, 0.06)',
    shadowMedium: '0 4px 16px rgba(44, 40, 37, 0.1)',
    shadowElevated: '0 8px 32px rgba(44, 40, 37, 0.14)',
    shadowInner: 'inset 0 1px 3px rgba(44, 40, 37, 0.08)',
    borderWidth: '1px',
    borderOpacity: 0.15,
  },
  components: {
    cardPadding: '24px',
    cardShadow: '0 2px 8px rgba(44, 40, 37, 0.06)',
    cardBorderWidth: '1px',
    buttonPaddingX: '20px',
    buttonPaddingY: '10px',
    inputPaddingX: '16px',
    inputPaddingY: '12px',
    inputBorderWidth: '1px',
    badgePaddingX: '12px',
    badgePaddingY: '4px',
  },
  motion: {
    durationFast: '120ms',
    durationNormal: '250ms',
    durationSlow: '400ms',
    easingDefault: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easingEmphasized: 'cubic-bezier(0.2, 0, 0, 1)',
    northStar:
      'Warm, airy, premium study material: parchment neutrals, mint accents, soft rounded cards, humanist typography, generous whitespace — calm confidence, cozy clarity.',
    doRules: [
      'Use warm neutrals and soft shadows',
      'Apply one accent sparingly',
      'Charcoal text at comfortable reading sizes',
      'Generous spacing as a design element',
    ],
    dontRules: [
      'Pure white + pure black everywhere',
      'Neon accents or heavy gradients',
      'Over-segmentation with dividers',
      'Dense walls of body text without breathing room',
    ],
  },
};

// ── Print page builder ────────────────────────────────────────────

/**
 * Wrap page-body HTML into a valid self-contained A4 print document
 * carrying the soul's tokens and the print-medium attribute.
 */
function printPage(cssTokens: string, bodyHtml: string, meta: Record<string, unknown>, pageChrome?: Record<string, unknown>): string {
  const chromeComment = pageChrome ? `<!-- @page-chrome ${JSON.stringify(pageChrome)} -->\n` : '';
  return `<!DOCTYPE html>
<html lang="en" data-pengui-medium="print">
<head><meta charset="utf-8"></head>
<style>
${cssTokens}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: var(--font-body); color: var(--color-text-primary); background: var(--color-canvas); }
</style>
<body>
<!-- @slide-meta ${JSON.stringify(meta)} -->
${chromeComment}<div class="slide" style="width:1240px;height:1754px;padding:var(--space-safe-area);position:relative;overflow:hidden;">
${bodyHtml}
</div>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  log('🚀', 'Starting Pengui Slides print-mode demo...');

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['build/index.js'],
    cwd: '/Users/santiagobenvenuto/Repos/pengui-slides',
  });

  const client = new Client({ name: 'pengui-print-demo', version: '1.0.0' });
  await client.connect(transport);
  log('✅', 'Connected');

  // 1. Register + approve soul
  log('📝', 'Registering Design Soul "Cozy Study"...');
  const register = await client.callTool({
    name: 'register_design_soul',
    arguments: {
      name: 'Cozy Study',
      description: 'Warm, parchment feel suited to printable study material.',
      layers: soulLayers,
    },
  });
  const soulId = jsonBody(register).soul_id as string;
  log('✅', `Soul registered: ${soulId}`);

  log('🔨', 'Approving soul...');
  await client.callTool({
    name: 'approve_design_soul',
    arguments: { soul_id: soulId },
  });

  log('📥', 'Fetching soul to get css tokens...');
  const getSoul = await client.callTool({
    name: 'get_design_soul',
    arguments: { soul_id: soulId, include_skeletons: true },
  });
  const cssTokens = ((jsonBody(getSoul).soul as { css_tokens: string }).css_tokens) ?? '';
  if (!cssTokens) {
    throw new Error('get_design_soul did not return css_tokens — cannot proceed');
  }

  // 2. Create print deck
  log('📄', 'Creating A4 portrait deck...');
  const deck = await client.callTool({
    name: 'create_deck',
    arguments: {
      soul_id: soulId,
      title: 'Inorganic Cosmetics — Minerals (Study Summary)',
      author: 'Pengui Print Demo',
      format: 'print_a4_portrait',
    },
  });
  const deckId = jsonBody(deck).deck_id as string;

  // 3. Add pages — kept minimal and token-clean so validation passes.
  // Note: SVG uses literal numeric coordinates (this is geometry, not styling,
  // and validators only check CSS properties and @color/@font-size attrs).
  const pages: Array<{ html: string; meta: Record<string, unknown> }> = [
    {
      html: printPage(cssTokens, `
        <div style="display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:var(--space-lg);height:100%;">
          <h1 style="font-family:var(--font-display);font-size:var(--text-hero);font-weight:var(--weight-bold);line-height:var(--line-height-heading);color:var(--color-text-primary);">Inorganic Cosmetics</h1>
          <p style="font-size:var(--text-h3);color:var(--color-text-secondary);">Minerals — Study Summary</p>
          <div style="margin-top:var(--space-xxxl);font-size:var(--text-caption);color:var(--color-text-tertiary);text-transform:uppercase;">Pengui Print Demo</div>
        </div>
      `, { title: 'Cover', type: 'cover', narrative: 'Title page', tags: ['cover'] },
      { runningTitle: 'Inorganic Cosmetics — Minerals', pageNumber: false, hide: true }),
      meta: { title: 'Cover', type: 'cover', narrative: 'Title page' },
    },
    {
      html: printPage(cssTokens, `
        <h1 style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);margin-bottom:var(--space-xl);color:var(--color-text-primary);">Contents</h1>
        <ol style="font-size:var(--text-body);line-height:var(--line-height-body);padding-left:var(--space-xl);color:var(--color-text-primary);">
          <li style="margin-bottom:var(--space-sm);">Minerals — overview taxonomy</li>
          <li style="margin-bottom:var(--space-sm);">Pigments &amp; color</li>
          <li style="margin-bottom:var(--space-sm);">Key takeaways</li>
        </ol>
      `, { title: 'Contents', type: 'toc', narrative: 'Table of contents' },
      { runningTitle: 'Inorganic Cosmetics — Minerals', pageNumber: true, footerAlign: 'right' }),
      meta: { title: 'Contents', type: 'toc', narrative: 'Table of contents' },
    },
    {
      // For the demo we keep the diagram page as plain content; a fully
      // legibility-compliant SVG tree lives in templates/print/content-diagram.html
      // and docs/charts-and-diagrams.md.
      html: printPage(cssTokens, `
        <h1 style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);margin-bottom:var(--space-md);color:var(--color-text-primary);">Mineral Taxonomy</h1>
        <p style="font-size:var(--text-body);color:var(--color-text-secondary);margin-bottom:var(--space-xl);line-height:var(--line-height-body);">Minerals fall into three functional groups:</p>
        <ul style="font-size:var(--text-body);line-height:var(--line-height-body);padding-left:var(--space-xl);color:var(--color-text-primary);">
          <li style="margin-bottom:var(--space-sm);"><strong>Pigments &amp; color</strong> — titanium dioxide, zinc oxide, iron oxides, micas.</li>
          <li style="margin-bottom:var(--space-sm);"><strong>Absorbents</strong> — talc, kaolin, clays, PMMA.</li>
          <li style="margin-bottom:var(--space-sm);"><strong>Texturizers</strong> — silica, organophilic bentonite.</li>
        </ul>
      `, { title: 'Mineral taxonomy', type: 'content', narrative: 'Three functional groups' },
      { runningTitle: 'Inorganic Cosmetics — Minerals', pageNumber: true, footerAlign: 'right' }),
      meta: { title: 'Mineral taxonomy', type: 'content', narrative: 'Three functional groups' },
    },
    {
      html: printPage(cssTokens, `
        <h1 style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);margin-bottom:var(--space-md);color:var(--color-text-primary);">Pigments &amp; color</h1>
        <p style="font-size:var(--text-body);color:var(--color-text-secondary);margin-bottom:var(--space-xl);line-height:var(--line-height-body);">The four pigment materials differ in coverage, transparency, and concentration.</p>
        <ul style="font-size:var(--text-body);line-height:var(--line-height-body);padding-left:var(--space-xl);color:var(--color-text-primary);">
          <li style="margin-bottom:var(--space-sm);"><strong>Titanium dioxide</strong> — white pigment, also SPF. Typical 8–12%.</li>
          <li style="margin-bottom:var(--space-sm);"><strong>Zinc oxide</strong> — solar, baby, acne skin. SPF + calming.</li>
          <li style="margin-bottom:var(--space-sm);"><strong>Iron oxides</strong> — yellow, red, black. 2–10%, translucent.</li>
          <li style="margin-bottom:var(--space-sm);"><strong>Micas</strong> — pearlescent, no active role.</li>
        </ul>
      `, { title: 'Pigments & color', type: 'content', narrative: 'Chapter detail on pigments' },
      { runningTitle: 'Inorganic Cosmetics — Minerals', pageNumber: true, footerAlign: 'right' }),
      meta: { title: 'Pigments & color', type: 'content', narrative: 'Chapter detail' },
    },
    {
      html: printPage(cssTokens, `
        <h1 style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);margin-bottom:var(--space-lg);color:var(--color-text-primary);">Key takeaways</h1>
        <ol style="font-size:var(--text-body);line-height:var(--line-height-body);padding-left:var(--space-xl);color:var(--color-text-primary);">
          <li style="margin-bottom:var(--space-md);"><strong>Three functional groups.</strong> Pigments, absorbents, texturizers.</li>
          <li style="margin-bottom:var(--space-md);"><strong>TiO2 and ZnO are dual-purpose.</strong> Color and SPF; percentage drives both.</li>
          <li style="margin-bottom:var(--space-md);"><strong>Silica and clays modify touch, not color.</strong></li>
          <li style="margin-bottom:var(--space-md);"><strong>Taxonomy beats list memorization.</strong></li>
        </ol>
      `, { title: 'Key takeaways', type: 'summary', narrative: 'Closing summary of the chapter' },
      { runningTitle: 'Inorganic Cosmetics — Minerals', pageNumber: true, footerAlign: 'right' }),
      meta: { title: 'Key takeaways', type: 'summary', narrative: 'Closing summary' },
    },
  ];

  for (const [idx, page] of pages.entries()) {
    log('➕', `Adding page ${idx + 1}/${pages.length} — ${page.meta.title}`);
    await client.callTool({
      name: 'add_slide',
      arguments: { deck_id: deckId, html: page.html, metadata: page.meta },
    });
    // Validate and print any errors so demo surfaces them when a page fails.
    const v = await client.callTool({
      name: 'validate_slide',
      arguments: { html: page.html, soul_id: soulId, deck_id: deckId, depth: 'full' },
    });
    const vBody = jsonBody(v);
    if ((vBody.error_count as number) > 0) {
      const issues = (vBody.issues as Array<Record<string, unknown>>)
        .filter((i) => i.severity === 'error')
        .map((i) => `${i.rule}: ${i.message}`)
        .slice(0, 3)
        .join(' | ');
      log('   ⚠️', `validation errors: ${issues}`);
    }
  }

  // 4. Export to PDF
  log('📤', 'Exporting A4 PDF...');
  const exported = await client.callTool({
    name: 'export_pdf',
    arguments: { deck_id: deckId, mode: 'direct' },
  });
  const meta = jsonBody(exported);
  log('✅', `PDF exported → ${meta.file_path}`);
  log('📊', `${meta.slide_count} pages, ${Math.round((meta.file_size_bytes as number) / 1024)} KB`);

  // 5. Confirm PPTX refuses print
  log('🛑', 'Verifying PPTX rejects print deck...');
  try {
    const bad = await client.callTool({
      name: 'export_pptx',
      arguments: { deck_id: deckId },
    });
    const badBody = jsonBody(bad);
    if (badBody.error === true && badBody.code === 'FORMAT_NOT_EXPORTABLE') {
      log('✅', `PPTX correctly refused: ${badBody.message}`);
    } else {
      log('⚠️', `Expected FORMAT_NOT_EXPORTABLE, got: ${JSON.stringify(badBody).slice(0, 200)}`);
    }
  } catch (err) {
    log('⚠️', `PPTX tool threw unexpectedly: ${err instanceof Error ? err.message : String(err)}`);
  }

  await client.close();
  log('🎉', 'Print demo complete.');
}

main().catch((err) => {
  console.error('❌ Demo failed:', err);
  process.exit(1);
});
