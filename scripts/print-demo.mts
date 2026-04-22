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

  // 3. Add pages
  const pages: Array<{ html: string; meta: Record<string, unknown> }> = [
    {
      html: printPage(cssTokens, `
        <div style="position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:var(--space-lg);padding:var(--space-xxxl);">
          <div style="width:120px;height:6px;background:var(--color-accent-primary);border-radius:var(--radius-full);"></div>
          <h1 style="font-family:var(--font-display);font-size:var(--text-hero);font-weight:var(--weight-bold);line-height:var(--leading-heading);color:var(--color-text-primary);">Inorganic Cosmetics</h1>
          <p style="font-size:var(--text-h3);color:var(--color-text-secondary);">Minerals — Study Summary</p>
          <div style="margin-top:var(--space-xxxl);font-size:var(--text-caption);color:var(--color-text-tertiary);letter-spacing:0.15em;text-transform:uppercase;">Pengui Print Demo &middot; 2026</div>
        </div>
      `, { title: 'Cover', type: 'cover', narrative: 'Title page', tags: ['cover'] },
      { runningTitle: 'Inorganic Cosmetics — Minerals', pageNumber: false, hide: true }),
      meta: { title: 'Cover', type: 'cover', narrative: 'Title page' },
    },
    {
      html: printPage(cssTokens, `
        <h1 style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);margin-bottom:var(--space-xl);">Contents</h1>
        <ol style="font-size:var(--text-body);line-height:1.9;padding-left:var(--space-xl);color:var(--color-text-primary);">
          <li>Minerals — overview taxonomy <span style="float:right;color:var(--color-text-tertiary);">3</span></li>
          <li>Pigments &amp; color <span style="float:right;color:var(--color-text-tertiary);">4</span></li>
          <li>Key takeaways <span style="float:right;color:var(--color-text-tertiary);">5</span></li>
        </ol>
      `, { title: 'Contents', type: 'toc', narrative: 'Table of contents' },
      { runningTitle: 'Inorganic Cosmetics — Minerals', pageNumber: false, hide: true }),
      meta: { title: 'Contents', type: 'toc', narrative: 'Table of contents' },
    },
    {
      html: printPage(cssTokens, `
        <h1 style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);margin-bottom:var(--space-md);">Mineral Taxonomy</h1>
        <p style="font-size:var(--text-body);color:var(--color-text-secondary);margin-bottom:var(--space-xl);max-width:900px;">Minerals used in cosmetic formulations fall into three functional groups — pigments, absorbents, and texturizers. Each group contains several raw materials with characteristic use cases.</p>
        <svg viewBox="0 0 1040 900" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;">
          <g fill="var(--color-surface)" stroke="var(--color-border)" stroke-width="1.5">
            <rect x="20" y="390" width="190" height="80" rx="14"/>
          </g>
          <text x="115" y="425" text-anchor="middle" font-size="22" font-family="var(--font-display)" fill="var(--color-text-primary)" font-weight="700">Minerals</text>
          <text x="115" y="450" text-anchor="middle" font-size="14" font-style="italic" fill="var(--color-text-secondary)">10 raw materials</text>
          <g stroke="var(--color-border)" stroke-width="1.5" fill="none">
            <path d="M210,430 H270 V170 H330"/>
            <path d="M210,430 H270 V430 H330"/>
            <path d="M210,430 H270 V690 H330"/>
          </g>
          <g fill="var(--color-accent-secondary)" stroke="var(--color-border)" stroke-width="1.2" opacity="0.35">
            <rect x="330" y="130" width="260" height="80" rx="14"/>
            <rect x="330" y="390" width="260" height="80" rx="14"/>
            <rect x="330" y="650" width="260" height="80" rx="14"/>
          </g>
          <g font-family="var(--font-display)" font-weight="700" fill="var(--color-text-primary)" text-anchor="middle" font-size="20">
            <text x="460" y="165">Pigments &amp; color</text>
            <text x="460" y="425">Absorbents</text>
            <text x="460" y="685">Texturizers</text>
          </g>
          <g font-size="13" font-style="italic" fill="var(--color-text-secondary)" text-anchor="middle">
            <text x="460" y="190">Provide color or coverage</text>
            <text x="460" y="450">Trap oils and liquids</text>
            <text x="460" y="710">Modify sensorial feel</text>
          </g>
          <g stroke="var(--color-border)" stroke-width="1.2" fill="none">
            <path d="M590,170 H640 V80 H690"/>
            <path d="M590,170 H640 V170 H690"/>
            <path d="M590,170 H640 V260 H690"/>
            <path d="M590,430 H640 V370 H690"/>
            <path d="M590,430 H640 V430 H690"/>
            <path d="M590,430 H640 V490 H690"/>
            <path d="M590,690 H640 V660 H690"/>
            <path d="M590,690 H640 V720 H690"/>
          </g>
          <g stroke="var(--color-border)" stroke-width="1" opacity="0.9">
            <rect x="690" y="50" width="310" height="60" rx="10" fill="var(--color-accent-secondary)" opacity="0.15"/>
            <rect x="690" y="140" width="310" height="60" rx="10" fill="var(--color-accent-secondary)" opacity="0.15"/>
            <rect x="690" y="230" width="310" height="60" rx="10" fill="var(--color-accent-secondary)" opacity="0.15"/>
            <rect x="690" y="340" width="310" height="60" rx="10" fill="var(--color-accent-primary)" opacity="0.15"/>
            <rect x="690" y="400" width="310" height="60" rx="10" fill="var(--color-accent-primary)" opacity="0.15"/>
            <rect x="690" y="460" width="310" height="60" rx="10" fill="var(--color-accent-primary)" opacity="0.15"/>
            <rect x="690" y="630" width="310" height="60" rx="10" fill="var(--color-accent-warm)" opacity="0.15"/>
            <rect x="690" y="690" width="310" height="60" rx="10" fill="var(--color-accent-warm)" opacity="0.15"/>
          </g>
          <g font-family="var(--font-display)" font-weight="600" fill="var(--color-text-primary)" font-size="16">
            <text x="710" y="78">Titanium dioxide</text>
            <text x="710" y="168">Zinc oxide</text>
            <text x="710" y="258">Iron oxides</text>
            <text x="710" y="368">Talc</text>
            <text x="710" y="428">Kaolin</text>
            <text x="710" y="488">Clays</text>
            <text x="710" y="658">Silica</text>
            <text x="710" y="718">Organophilic bentonite</text>
          </g>
          <g font-size="12" font-style="italic" fill="var(--color-text-secondary)">
            <text x="710" y="96">White &amp; SPF 8–12%</text>
            <text x="710" y="186">Solar, baby, acne skin</text>
            <text x="710" y="276">Pigment 2–10%, translucent</text>
            <text x="710" y="386">Mg silicate, up to 98%</text>
            <text x="710" y="446">Fine clay, aerosols</text>
            <text x="710" y="506">Facial masks, acne</text>
            <text x="710" y="676">Cream to powder</text>
            <text x="710" y="736">Thickener in solvents</text>
          </g>
        </svg>
      `, { title: 'Mineral taxonomy', type: 'content_diagram', narrative: 'Tree / mind-map of the three functional groups' },
      { runningTitle: 'Inorganic Cosmetics — Minerals', pageNumber: true, footerAlign: 'right' }),
      meta: { title: 'Mineral taxonomy', type: 'content_diagram', narrative: 'Tree / mind-map' },
    },
    {
      html: printPage(cssTokens, `
        <h1 style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);margin-bottom:var(--space-md);">Pigments &amp; color</h1>
        <p style="font-size:var(--text-body);color:var(--color-text-secondary);margin-bottom:var(--space-xl);line-height:1.6;max-width:900px;">The four pigment materials differ in coverage, transparency, and typical concentration ranges. Titanium dioxide and zinc oxide double as SPF agents; iron oxides provide earth-tone pigment; micas deliver a pearlescent finish with no active function.</p>
        <ul style="font-size:var(--text-body);line-height:1.9;padding-left:var(--space-xl);">
          <li><strong>Titanium dioxide</strong> — white pigment, also SPF. Typical 8–12%.</li>
          <li><strong>Zinc oxide</strong> — solar, baby, acne skin. SPF + calming.</li>
          <li><strong>Iron oxides</strong> — yellow/red/black. 2–10%, translucent.</li>
          <li><strong>Micas</strong> — pearlescent, no active role.</li>
        </ul>
      `, { title: 'Pigments & color', type: 'content', narrative: 'Chapter detail on pigments' },
      { runningTitle: 'Inorganic Cosmetics — Minerals', pageNumber: true, footerAlign: 'right' }),
      meta: { title: 'Pigments & color', type: 'content', narrative: 'Chapter detail' },
    },
    {
      html: printPage(cssTokens, `
        <h1 style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);margin-bottom:var(--space-lg);">Key takeaways</h1>
        <ol style="font-size:var(--text-body);line-height:1.8;padding-left:var(--space-xl);">
          <li><strong>Three functional groups.</strong> Pigments / absorbents / texturizers — each has a distinct formulation role.</li>
          <li><strong>TiO2 and ZnO are dual-purpose.</strong> Color + SPF. Percentage drives both.</li>
          <li><strong>Silica and clays modify touch, not color.</strong> Texturizers sit orthogonal to pigment choice.</li>
          <li><strong>Taxonomy beats list memorization.</strong> Learn the tree; the individual materials slot in.</li>
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
