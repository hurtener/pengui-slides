#!/usr/bin/env npx tsx
/**
 * Document Demo — v3 continuous-document PDF smoke test.
 *
 * End-to-end exercise of the v3 flow:
 *   1. register + approve a soul
 *   2. create a print_a4_portrait deck (authoringModel auto-set to 'document')
 *   3. update_document_meta with chrome + toc config
 *   4. add ~10 sections of varied kinds
 *   5. export_pdf (runs Document Stage 2 validation + composer + Playwright)
 *
 * Produces: output/A_Short_Field_Guide_to_Pagination.pdf
 *
 * Run after `npm run build`:
 *   npx tsx scripts/document-demo.mts
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

function log(emoji: string, msg: string) {
  console.error(`${emoji} ${msg}`);
}

function jsonBody(result: unknown): Record<string, unknown> {
  const text = (result as { content: Array<{ text: string }> }).content?.[0]?.text;
  if (!text) throw new Error('empty tool response');
  return JSON.parse(text) as Record<string, unknown>;
}

// ── Soul (reuses the cozy parchment palette from coffee-demo) ──

const soulLayers = {
  color: {
    canvas: '#FAF6EE',
    surface: '#F4EDE0',
    surfaceAlt: '#EBE2D2',
    border: 'rgba(168, 144, 110, 0.28)',
    textPrimary: '#2A211A',
    textSecondary: '#5A4B3E',
    textTertiary: '#6B5B4C',
    textInverse: '#FAF6EE',
    accentPrimary: '#2E6F5E',
    accentSecondary: '#4D7994',
    accentWarm: '#9E4F28',
    success: '#5C8E5C',
    warning: '#C49736',
    error: '#B0584C',
    info: '#7B9DB8',
  },
  typography: {
    fontDisplay: 'Iowan Old Style, Palatino, serif',
    fontBody: 'Inter, system-ui, sans-serif',
    fontMono: 'JetBrains Mono, monospace',
    sizeHero: 64,
    sizeH1: 44,
    sizeH2: 28,
    sizeH3: 20,
    sizeBody: 14,
    sizeLabel: 12,
    sizeCaption: 10,
    weightNormal: 400,
    weightMedium: 500,
    weightBold: 700,
    lineHeightHeading: 1.15,
    lineHeightBody: 1.6,
    letterSpacingHeading: '-0.01em',
    letterSpacingBody: '0em',
  },
  spacing: {
    baseUnit: 8,
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 36,
    xxl: 56,
    xxxl: 80,
    safeAreaInset: 48,
  },
  shape: {
    none: '0px',
    sm: '6px',
    md: '10px',
    lg: '18px',
    xl: '28px',
    full: '9999px',
    buttonRadius: '14px',
    cardRadius: '20px',
    inputRadius: '12px',
    badgeRadius: '9999px',
  },
  depth: {
    shadowNone: 'none',
    shadowSoft: '0 1px 3px rgba(42, 33, 26, 0.05)',
    shadowMedium: '0 4px 14px rgba(42, 33, 26, 0.08)',
    shadowElevated: '0 8px 28px rgba(42, 33, 26, 0.12)',
    shadowInner: 'inset 0 1px 3px rgba(42, 33, 26, 0.05)',
    borderWidth: '1px',
    borderOpacity: 0.18,
  },
  components: {
    cardPadding: '20px',
    cardShadow: '0 1px 3px rgba(42, 33, 26, 0.05)',
    cardBorderWidth: '1px',
    buttonPaddingX: '18px',
    buttonPaddingY: '10px',
    inputPaddingX: '14px',
    inputPaddingY: '10px',
    inputBorderWidth: '1px',
    badgePaddingX: '10px',
    badgePaddingY: '3px',
  },
  motion: {
    durationFast: '120ms',
    durationNormal: '240ms',
    durationSlow: '420ms',
    easingDefault: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easingEmphasized: 'cubic-bezier(0.2, 0, 0, 1)',
    northStar:
      'Warm field-guide composition. Generous rhythm, serif display, calm palette.',
    doRules: [
      'Use warm neutrals as the base, mint as emphasis',
      'Let content flow across pages — design is continuous, not page-bound',
      'Tables split gracefully with repeating headers',
    ],
    dontRules: [
      'Fixed-height wrappers that fight pagination',
      'Large figures that exceed one page',
      'Overly decorative borders and shadows',
    ],
  },
};

// ── Section builders ────────────────────────────────────────────

function sectionMeta(title: string, kind: string, narrative: string) {
  return JSON.stringify({ title, kind, narrative, tags: ['demo'] });
}

const sections: Array<{
  kind: string;
  html: string;
  metadata: { title: string; narrative: string };
  break_hints?: Record<string, unknown>;
}> = [
  {
    kind: 'cover',
    html: `<!-- @section-meta ${sectionMeta('A Short Field Guide to Pagination', 'cover', 'Cover of the field guide.')} -->
<section class="pengui-section pengui-cover">
  <div style="display: flex; flex-direction: column; justify-content: center; align-items: flex-start; height: 100%; padding: 80px 60px; background: var(--color-surface); box-sizing: border-box;">
    <span style="font-family: var(--font-mono); font-size: var(--text-label); color: var(--color-accent-primary); letter-spacing: 0.18em; text-transform: uppercase;">A Pengui v3 Demo</span>
    <h1 style="font-family: var(--font-display); font-size: var(--text-hero); font-weight: var(--weight-bold); line-height: var(--line-height-heading); margin: 32px 0 12px; color: var(--color-text-primary); max-width: 720px;">A Short Field Guide to Pagination</h1>
    <p style="font-family: var(--font-body); font-size: 20px; color: var(--color-text-secondary); margin: 0 0 64px; max-width: 540px;">How continuous-document mode composes Sections into a PDF that doesn't fight the paginator.</p>
    <div style="display: flex; gap: 48px; padding-top: 48px; border-top: 2px solid var(--color-accent-primary);">
      <div>
        <span style="font-family: var(--font-mono); font-size: 11px; color: var(--color-text-tertiary); letter-spacing: 0.14em; text-transform: uppercase;">Author</span>
        <p style="font-family: var(--font-body); font-size: var(--text-body); color: var(--color-text-primary); margin: 4px 0 0;">Pengui Slides</p>
      </div>
      <div>
        <span style="font-family: var(--font-mono); font-size: 11px; color: var(--color-text-tertiary); letter-spacing: 0.14em; text-transform: uppercase;">Edition</span>
        <p style="font-family: var(--font-body); font-size: var(--text-body); color: var(--color-text-primary); margin: 4px 0 0;">v3 — 2026</p>
      </div>
    </div>
  </div>
</section>`,
    metadata: { title: 'Cover', narrative: 'Document cover' },
  },
  {
    kind: 'toc',
    html: `<!-- @section-meta ${sectionMeta('Table of Contents', 'toc', 'Auto-generated TOC placeholder.')} -->
<section class="pengui-section pengui-toc"></section>`,
    metadata: { title: 'Table of Contents', narrative: 'Auto-filled by the composer' },
  },
  {
    kind: 'chapter_header',
    html: `<!-- @section-meta ${sectionMeta('Chapter 1 — Why continuous', 'chapter_header', 'Chapter 1 opener.')} -->
<section class="pengui-section pengui-chapter_header">
  <div style="display: flex; flex-direction: column; justify-content: center; align-items: flex-start; height: 100%; padding: 80px 60px; box-sizing: border-box;">
    <span style="font-family: var(--font-mono); font-size: var(--text-caption); color: var(--color-accent-primary); letter-spacing: 0.2em; text-transform: uppercase;">Chapter 01</span>
    <h1 style="font-family: var(--font-display); font-size: var(--text-h1); font-weight: var(--weight-bold); margin: 20px 0 24px; color: var(--color-text-primary); max-width: 640px;">Why continuous beats page-bound</h1>
    <p style="font-family: var(--font-body); font-size: 18px; color: var(--color-text-secondary); margin: 0; max-width: 520px; line-height: 1.6;">A quick case for treating print output as a flowing document rather than a stack of self-contained pages.</p>
  </div>
</section>`,
    metadata: { title: 'Chapter 1 — Why continuous', narrative: 'Chapter opener' },
  },
  {
    kind: 'prose',
    html: `<!-- @section-meta ${sectionMeta('The page-bound tax', 'prose', 'Explaining the cost of per-page authoring.')} -->
<section class="pengui-section pengui-prose">
  <h2 style="font-family: var(--font-display); color: var(--color-text-primary); margin: 0 0 16px;">The page-bound tax</h2>
  <p style="font-family: var(--font-body); color: var(--color-text-primary); line-height: 1.6; margin: 0 0 12px;">Authoring one HTML document per page forces the model to fit content into page-sized boxes before it has a pagination engine in front of it. Even a capable model wastes turns measuring paragraphs, trimming lines, and shrinking figures.</p>
  <p style="font-family: var(--font-body); color: var(--color-text-primary); line-height: 1.6; margin: 0 0 12px;">Every small edit shifts page boundaries in unpredictable ways, which re-triggers the whole overflow dance. That's not a bug in the model — it's a structural mismatch between the page-bound authoring surface and the flowing nature of printed material.</p>
  <p style="font-family: var(--font-body); color: var(--color-text-primary); line-height: 1.6; margin: 0;">Continuous mode puts pagination back where it belongs: in the exporter's rendering engine. The author describes content with natural semantics; Chromium decides the break points.</p>
</section>`,
    metadata: { title: 'The page-bound tax', narrative: '' },
  },
  {
    kind: 'prose',
    html: `<!-- @section-meta ${sectionMeta('What the composer owns', 'prose', 'The composers responsibilities.')} -->
<section class="pengui-section pengui-prose">
  <h2 style="font-family: var(--font-display); color: var(--color-text-primary); margin: 0 0 16px;">What the composer owns</h2>
  <ul style="font-family: var(--font-body); color: var(--color-text-primary); line-height: 1.6; padding-left: 22px; margin: 0;">
    <li><strong>Document frame</strong> — DOCTYPE, &lt;html data-pengui-medium=&quot;print&quot; data-pengui-model=&quot;document&quot;&gt;, shared &lt;head&gt; and &lt;body&gt;.</li>
    <li><strong>Soul tokens</strong> — injected once into a single :root block, not copy-pasted into every fragment.</li>
    <li><strong>@page size + margins</strong> — from geometry and documentMeta.pageMargin.</li>
    <li><strong>Universal break rules</strong> on canonical wrapper classes so figures/charts/diagrams stay whole and tables split with repeating headers.</li>
    <li><strong>Running chrome</strong> rendered as position: fixed HTML with counter(page) / counter(pages).</li>
  </ul>
</section>`,
    metadata: { title: 'What the composer owns', narrative: '' },
  },
  {
    kind: 'figure',
    html: `<!-- @section-meta ${sectionMeta('Figure 1 — The pipeline', 'figure', 'Mindmap showing how sections become a PDF.')} -->
<section class="pengui-section pengui-figure">
  <figure class="pengui-figure">
    <svg viewBox="0 0 720 420" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Pipeline from sections to PDF">
      <rect x="0" y="0" width="720" height="420" fill="var(--color-surface)" rx="12"/>
      <g font-family="var(--font-body)" font-size="14" fill="var(--color-text-primary)">
        <g transform="translate(40,180)">
          <rect width="140" height="60" rx="10" fill="var(--color-accent-primary)" opacity="0.9"/>
          <text x="70" y="36" text-anchor="middle" fill="var(--color-text-inverse)">Section</text>
        </g>
        <g transform="translate(240,60)">
          <rect width="140" height="60" rx="10" fill="var(--color-accent-secondary)" opacity="0.9"/>
          <text x="70" y="36" text-anchor="middle" fill="var(--color-text-inverse)">Section</text>
        </g>
        <g transform="translate(240,180)">
          <rect width="140" height="60" rx="10" fill="var(--color-accent-primary)" opacity="0.9"/>
          <text x="70" y="36" text-anchor="middle" fill="var(--color-text-inverse)">Composer</text>
        </g>
        <g transform="translate(240,300)">
          <rect width="140" height="60" rx="10" fill="var(--color-accent-warm)" opacity="0.9"/>
          <text x="70" y="36" text-anchor="middle" fill="var(--color-text-inverse)">Section</text>
        </g>
        <g transform="translate(440,180)">
          <rect width="140" height="60" rx="10" fill="var(--color-text-primary)"/>
          <text x="70" y="36" text-anchor="middle" fill="var(--color-text-inverse)">Chromium</text>
        </g>
        <g transform="translate(600,180)">
          <rect width="80" height="60" rx="10" fill="var(--color-accent-primary)"/>
          <text x="40" y="36" text-anchor="middle" fill="var(--color-text-inverse)">PDF</text>
        </g>
        <path d="M 180 210 L 240 210" stroke="var(--color-text-secondary)" stroke-width="2" fill="none"/>
        <path d="M 180 210 L 220 90 L 240 90" stroke="var(--color-text-secondary)" stroke-width="2" fill="none"/>
        <path d="M 180 210 L 220 330 L 240 330" stroke="var(--color-text-secondary)" stroke-width="2" fill="none"/>
        <path d="M 380 210 L 440 210" stroke="var(--color-text-secondary)" stroke-width="2" fill="none"/>
        <path d="M 580 210 L 600 210" stroke="var(--color-text-secondary)" stroke-width="2" fill="none"/>
      </g>
    </svg>
    <figcaption style="font-family: var(--font-body); color: var(--color-text-secondary); margin-top: 12px; font-size: 13px;"><strong style="color: var(--color-text-primary);">Figure 1.</strong> Sections feed into the composer; Chromium handles pagination.</figcaption>
  </figure>
</section>`,
    metadata: { title: 'Figure 1 — The pipeline', narrative: 'Pipeline diagram' },
    break_hints: { keep_together: true, break_before: 'page' },
  },
  {
    kind: 'callout',
    html: `<!-- @section-meta ${sectionMeta('Tip: wrap keep-together content', 'callout', 'A tip on break-inside: avoid.')} -->
<section class="pengui-section pengui-callout">
  <aside class="pengui-callout callout-tip" style="background: var(--color-accent-primary); color: var(--color-text-inverse); padding: 20px 24px; border-radius: 12px; margin: 0;">
    <strong style="font-family: var(--font-display); font-size: 14px; letter-spacing: 0.1em; text-transform: uppercase;">Tip</strong>
    <p style="font-family: var(--font-body); margin: 8px 0 0; line-height: 1.55;">Wrap any figure / chart / diagram / callout / quote / image in its canonical <code>.pengui-*</code> class so the composer's universal <code>break-inside: avoid</code> rule catches it. Without the wrapper class, Chromium will split the element.</p>
  </aside>
</section>`,
    metadata: { title: 'Tip: wrap keep-together content', narrative: '' },
  },
  {
    kind: 'table',
    html: `<!-- @section-meta ${sectionMeta('Format matrix', 'table', 'Format -> output matrix.')} -->
<section class="pengui-section pengui-table">
  <h3 style="font-family: var(--font-display); color: var(--color-text-primary); margin: 0 0 12px;">Format → authoring model → export</h3>
  <table style="font-family: var(--font-body); font-size: 13px; color: var(--color-text-primary);">
    <thead style="background: var(--color-accent-primary); color: var(--color-text-inverse);">
      <tr>
        <th style="padding: 10px 14px; text-align: left;">Format</th>
        <th style="padding: 10px 14px; text-align: left;">Authoring model</th>
        <th style="padding: 10px 14px; text-align: left;">Export surfaces</th>
      </tr>
    </thead>
    <tbody>
      <tr><td style="padding: 10px 14px; border-bottom: 1px solid var(--color-border);">slides_16_9</td><td style="padding: 10px 14px; border-bottom: 1px solid var(--color-border);">slides</td><td style="padding: 10px 14px; border-bottom: 1px solid var(--color-border);">PPTX, PDF, HTML, Google Slides</td></tr>
      <tr><td style="padding: 10px 14px; border-bottom: 1px solid var(--color-border);">print_a4_portrait</td><td style="padding: 10px 14px; border-bottom: 1px solid var(--color-border);">document (v3 default)</td><td style="padding: 10px 14px; border-bottom: 1px solid var(--color-border);">PDF only</td></tr>
      <tr><td style="padding: 10px 14px; border-bottom: 1px solid var(--color-border);">print_letter_portrait</td><td style="padding: 10px 14px; border-bottom: 1px solid var(--color-border);">document (v3 default)</td><td style="padding: 10px 14px; border-bottom: 1px solid var(--color-border);">PDF only</td></tr>
      <tr><td style="padding: 10px 14px;">print_a4_portrait + authoringModel: slides</td><td style="padding: 10px 14px;">slides (legacy)</td><td style="padding: 10px 14px;">PDF only</td></tr>
    </tbody>
  </table>
</section>`,
    metadata: { title: 'Format matrix', narrative: '' },
  },
  {
    kind: 'quote',
    html: `<!-- @section-meta ${sectionMeta('Closing quote', 'quote', 'Pull quote.')} -->
<section class="pengui-section pengui-quote">
  <figure class="pengui-quote" style="margin: 0; padding: 28px 32px; border-left: 4px solid var(--color-accent-primary); background: var(--color-surface);">
    <blockquote style="font-family: var(--font-display); font-size: 22px; line-height: 1.4; color: var(--color-text-primary); margin: 0; font-style: italic;">"The page is a unit of rendering, not a unit of authoring."</blockquote>
    <figcaption style="font-family: var(--font-body); color: var(--color-text-secondary); margin-top: 12px; font-size: 12px;">— SPEC-v3, rationale for the shift</figcaption>
  </figure>
</section>`,
    metadata: { title: 'Closing quote', narrative: '' },
  },
  {
    kind: 'bibliography',
    html: `<!-- @section-meta ${sectionMeta('Further reading', 'bibliography', 'References.')} -->
<section class="pengui-section pengui-bibliography">
  <h3 style="font-family: var(--font-display); color: var(--color-text-primary); margin: 0 0 12px;">Further reading</h3>
  <ol style="font-family: var(--font-body); color: var(--color-text-primary); line-height: 1.55; padding-left: 22px; margin: 0;">
    <li><em>CSS Fragmentation Module Level 4</em> — W3C.</li>
    <li><em>CSS Paged Media Module Level 3</em> — W3C.</li>
    <li><em>Playwright page.pdf() — preferCSSPageSize</em> — playwright.dev.</li>
    <li>Pengui Slides, <code>pengui://docs/document-mode</code>.</li>
  </ol>
</section>`,
    metadata: { title: 'Further reading', narrative: '' },
  },
];

// ── Main ────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['build/index.js'],
    env: {
      ...process.env,
      PENGUI_LOG_LEVEL: 'info',
      PENGUI_OUTPUT_DIR: process.env.PENGUI_OUTPUT_DIR ?? './output',
    },
  });

  const client = new Client({ name: 'document-demo', version: '1.0.0' }, {});
  await client.connect(transport);
  log('🔌', 'Connected to Pengui MCP server');

  try {
    const soulResp = jsonBody(
      await client.callTool({
        name: 'register_design_soul',
        arguments: {
          name: 'Field Guide Parchment',
          description: 'Warm serif field-guide style',
          layers: soulLayers,
        },
      }),
    );
    const soulIdStr = soulResp.soul_id as string;
    log('🎨', `Registered soul ${soulIdStr}`);

    await client.callTool({
      name: 'approve_design_soul',
      arguments: { soul_id: soulIdStr },
    });
    log('✅', 'Soul approved');

    const deckResp = jsonBody(
      await client.callTool({
        name: 'create_deck',
        arguments: {
          soul_id: soulIdStr,
          title: 'A Short Field Guide to Pagination',
          author: 'Pengui Slides',
          format: 'print_a4_portrait',
          // authoring_model auto-defaults to 'document'
        },
      }),
    );
    const deckIdStr = deckResp.deck_id as string;
    log('📗', `Created deck ${deckIdStr} (authoring_model=${deckResp.authoring_model})`);

    await client.callTool({
      name: 'update_document_meta',
      arguments: {
        deck_id: deckIdStr,
        meta: {
          chrome: {
            runningTitle: 'A Short Field Guide to Pagination',
            pageNumber: true,
            footerAlign: 'right',
          },
          toc: { includeKinds: ['chapter_header'] },
        },
      },
    });
    log('🧭', 'Document meta configured');

    for (const section of sections) {
      const resp = jsonBody(
        await client.callTool({
          name: 'add_section',
          arguments: {
            deck_id: deckIdStr,
            kind: section.kind,
            html: section.html,
            metadata: section.metadata,
            ...(section.break_hints ? { break_hints: section.break_hints } : {}),
          },
        }),
      );
      log('➕', `${section.kind}: ${section.metadata.title} → ${resp.section_id}`);
    }

    log('📄', 'Exporting PDF …');
    const rawResp = await client.callTool({
      name: 'export_pdf',
      arguments: { deck_id: deckIdStr },
    });
    console.error('--- Raw export_pdf response ---');
    console.error(JSON.stringify(rawResp, null, 2));
    console.error('--- End raw response ---');
    const pdfResp = jsonBody(rawResp);
    log('🎉', `PDF exported: ${pdfResp.file_path}  (${pdfResp.file_size_bytes} bytes, ${pdfResp.slide_count} sections)`);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error('document-demo failed:', err);
  process.exit(1);
});
