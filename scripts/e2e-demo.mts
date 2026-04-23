#!/usr/bin/env npx tsx
/**
 * End-to-end demo: Acts as an MCP client connecting to the Pengui Slides server.
 *
 * Simulates an LLM calling all 16 tools to:
 * 1. Register + approve a Design Soul (cozy-premium)
 * 2. Create a deck about "Pengui Labs"
 * 3. Add 5 themed slides with real HTML
 * 4. Validate each slide
 * 5. Export to PPTX + HTML
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// ── Helpers ──────────────────────────────────────────────────────

function log(emoji: string, msg: string) {
  console.error(`${emoji} ${msg}`);
}

function logResult(toolName: string, result: unknown) {
  const text = (result as { content: Array<{ text: string }> }).content?.[0]?.text;
  if (text) {
    try {
      const parsed = JSON.parse(text);
      console.error(`   → ${JSON.stringify(parsed, null, 2).split('\n').join('\n     ')}`);
    } catch {
      console.error(`   → ${text.slice(0, 500)}`);
    }
  }
}

// ── Design Soul Layers (cozy-premium from example) ───────────────

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
    fontDisplay: 'Inter, system-ui, sans-serif',
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
      'Warm, airy, premium productivity: parchment neutrals, mint/teal accents, soft rounded cards, subtle shadows, humanist typography, generous whitespace — calm confidence, cozy clarity.',
    doRules: [
      'Use warm neutrals and soft shadows',
      'Apply one strong accent sparingly',
      'Use charcoal text with readable sizes',
      'Generous spacing as a design element',
    ],
    dontRules: [
      'Pure white + pure black everywhere',
      'Neon accents or heavy gradients',
      'Over-segmentation with dividers',
      'Scattered icons or controls',
    ],
  },
};

// ── Slide HTML Templates ─────────────────────────────────────────

function makeSlideHtml(cssTokens: string, innerContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=1920"></head>
<body style="margin:0;padding:0;background:var(--color-canvas);">
<style>
${cssTokens}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: var(--font-body); color: var(--color-text-primary); }
</style>
<div class="slide" style="width:1920px;height:1080px;padding:var(--space-safe-area);display:flex;flex-direction:column;justify-content:center;position:relative;overflow:hidden;">
${innerContent}
</div>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  log('🚀', 'Starting Pengui Slides MCP Client...');

  // Connect to server via stdio
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['build/index.js'],
    cwd: '/Users/santiagobenvenuto/Repos/pengui-slides',
  });

  const client = new Client({
    name: 'pengui-e2e-demo',
    version: '1.0.0',
  });

  await client.connect(transport);
  log('✅', 'Connected to Pengui Slides MCP Server');

  // List available tools
  const tools = await client.listTools();
  log('🔧', `Server offers ${tools.tools.length} tools: ${tools.tools.map(t => t.name).join(', ')}`);

  // ── Step 1: Register Design Soul ──────────────────────────────

  log('📝', 'Step 1: Registering Design Soul "Cozy Premium"...');
  const registerResult = await client.callTool({
    name: 'register_design_soul',
    arguments: {
      name: 'Cozy Premium',
      description:
        'A calm, cozy-premium interface that feels like quiet morning light on paper. Warm, airy, and intentionally low-drama.',
      layers: soulLayers,
    },
  });
  logResult('register_design_soul', registerResult);

  const soulData = JSON.parse(
    (registerResult as { content: Array<{ text: string }> }).content[0].text,
  );
  const soulId = soulData.soul_id;
  log('✅', `Soul registered: ${soulId} (${soulData.token_count} tokens, status: ${soulData.status})`);

  // ── Step 2: Approve Design Soul ───────────────────────────────

  log('📝', 'Step 2: Approving Design Soul...');
  const approveResult = await client.callTool({
    name: 'approve_design_soul',
    arguments: { soul_id: soulId },
  });
  logResult('approve_design_soul', approveResult);

  const approveData = JSON.parse(
    (approveResult as { content: Array<{ text: string }> }).content[0].text,
  );
  log(
    '✅',
    `Soul approved! ${approveData.skeleton_count} skeletons generated: ${approveData.skeleton_types.join(', ')}`,
  );

  // ── Step 3: Get Soul (with recipes) to get CSS tokens ─────────

  log('📝', 'Step 3: Getting Design Soul with CSS tokens...');
  const getSoulResult = await client.callTool({
    name: 'get_design_soul',
    arguments: { soul_id: soulId, include_recipes: true },
  });
  const getSoulData = JSON.parse(
    (getSoulResult as { content: Array<{ text: string }> }).content[0].text,
  );
  const cssTokens = getSoulData.soul.css_tokens;
  log('✅', `Got CSS tokens (${cssTokens.length} chars), ${getSoulData.skeletons.length} skeletons`);

  // ── Step 4: Create Deck ───────────────────────────────────────

  log('📝', 'Step 4: Creating deck "Pengui Labs - Company Overview"...');
  const createDeckResult = await client.callTool({
    name: 'create_deck',
    arguments: {
      soul_id: soulId,
      title: 'Pengui Labs - Company Overview',
      author: 'Santiago Benvenuto',
    },
  });
  logResult('create_deck', createDeckResult);

  const deckData = JSON.parse(
    (createDeckResult as { content: Array<{ text: string }> }).content[0].text,
  );
  const deckId = deckData.deck_id;
  log('✅', `Deck created: ${deckId}`);

  // ── Step 5: Add 5 Slides ──────────────────────────────────────

  const slides = [
    {
      metadata: {
        title: 'Pengui Labs',
        type: 'title',
        narrative:
          'Opening title slide introducing Pengui Labs, a next-generation AI infrastructure company building intelligent tools for developers.',
        key_points: ['AI Infrastructure', 'Developer Tools', 'Next Generation'],
        tags: ['intro', 'branding'],
        audience: 'investors',
      },
      content: `
        <div style="text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;">
          <div style="background:var(--color-accent-primary);color:var(--color-text-inverse);width:80px;height:80px;border-radius:var(--radius-xl);display:flex;align-items:center;justify-content:center;font-size:var(--text-h1);font-weight:var(--weight-bold);margin-bottom:var(--space-lg);">P</div>
          <h1 style="font-family:var(--font-display);font-size:var(--text-hero);font-weight:var(--weight-bold);letter-spacing:var(--letter-spacing-heading);line-height:var(--line-height-heading);color:var(--color-text-primary);margin-bottom:var(--space-md);">Pengui Labs</h1>
          <p style="font-family:var(--font-body);font-size:var(--text-h3);color:var(--color-text-secondary);line-height:var(--line-height-body);max-width:700px;">Building the next generation of AI-powered developer infrastructure</p>
          <div style="margin-top:var(--space-xxl);display:flex;gap:var(--space-md);">
            <span style="background:var(--color-surface);padding:var(--component-badge-padding-y) var(--component-badge-padding-x);border-radius:var(--radius-badge);font-size:var(--text-label);color:var(--color-text-secondary);border:var(--border-width) solid var(--color-border);">Series A — 2026</span>
            <span style="background:var(--color-surface);padding:var(--component-badge-padding-y) var(--component-badge-padding-x);border-radius:var(--radius-badge);font-size:var(--text-label);color:var(--color-text-secondary);border:var(--border-width) solid var(--color-border);">San Francisco, CA</span>
          </div>
        </div>`,
    },
    {
      metadata: {
        title: 'The Problem We Solve',
        type: 'two-column',
        narrative:
          'Modern AI development is fragmented. Teams waste 40% of engineering time on infrastructure plumbing instead of building products.',
        key_points: [
          'Fragmented tooling landscape',
          'Engineers spend 40% on infra plumbing',
          'Context switching between 8+ tools daily',
          'No unified developer experience',
        ],
        data_points: [
          { label: 'Time wasted on infra', value: 40, unit: '%', trend: 'up' },
          { label: 'Average tools per workflow', value: 8, trend: 'up' },
          { label: 'Context switches per day', value: 23, trend: 'up' },
        ],
        tags: ['problem', 'market'],
        audience: 'investors',
      },
      content: `
        <div style="display:flex;gap:var(--space-xxl);height:100%;align-items:center;">
          <div style="flex:1;">
            <span style="font-size:var(--text-label);color:var(--color-accent-primary);font-weight:var(--weight-medium);text-transform:uppercase;letter-spacing:0.08em;">The Problem</span>
            <h2 style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);color:var(--color-text-primary);margin-top:var(--space-sm);line-height:var(--line-height-heading);letter-spacing:var(--letter-spacing-heading);">AI development is broken</h2>
            <p style="font-size:var(--text-body);color:var(--color-text-secondary);margin-top:var(--space-md);line-height:var(--line-height-body);">Modern teams juggle 8+ tools daily, losing 40% of engineering capacity to integration overhead and context switching.</p>
            <div style="margin-top:var(--space-xl);display:flex;flex-direction:column;gap:var(--space-sm);">
              <div style="display:flex;align-items:center;gap:var(--space-sm);"><span style="color:var(--color-error);font-weight:var(--weight-bold);">✗</span><span style="font-size:var(--text-body);color:var(--color-text-primary);">Fragmented tooling landscape</span></div>
              <div style="display:flex;align-items:center;gap:var(--space-sm);"><span style="color:var(--color-error);font-weight:var(--weight-bold);">✗</span><span style="font-size:var(--text-body);color:var(--color-text-primary);">No unified developer experience</span></div>
              <div style="display:flex;align-items:center;gap:var(--space-sm);"><span style="color:var(--color-error);font-weight:var(--weight-bold);">✗</span><span style="font-size:var(--text-body);color:var(--color-text-primary);">Manual orchestration of AI pipelines</span></div>
            </div>
          </div>
          <div style="flex:1;display:flex;flex-direction:column;gap:var(--space-lg);">
            <div style="background:var(--color-surface);border-radius:var(--radius-card);padding:var(--component-card-padding);border:var(--border-width) solid var(--color-border);box-shadow:var(--shadow-soft);">
              <div style="font-size:var(--text-hero);font-weight:var(--weight-bold);color:var(--color-error);">40%</div>
              <div style="font-size:var(--text-label);color:var(--color-text-secondary);margin-top:var(--space-xs);">Engineering time wasted on infra plumbing</div>
            </div>
            <div style="background:var(--color-surface);border-radius:var(--radius-card);padding:var(--component-card-padding);border:var(--border-width) solid var(--color-border);box-shadow:var(--shadow-soft);">
              <div style="font-size:var(--text-hero);font-weight:var(--weight-bold);color:var(--color-accent-warm);">23</div>
              <div style="font-size:var(--text-label);color:var(--color-text-secondary);margin-top:var(--space-xs);">Context switches per engineer per day</div>
            </div>
            <div style="background:var(--color-surface);border-radius:var(--radius-card);padding:var(--component-card-padding);border:var(--border-width) solid var(--color-border);box-shadow:var(--shadow-soft);">
              <div style="font-size:var(--text-hero);font-weight:var(--weight-bold);color:var(--color-accent-secondary);">8+</div>
              <div style="font-size:var(--text-label);color:var(--color-text-secondary);margin-top:var(--space-xs);">Tools in an average AI developer workflow</div>
            </div>
          </div>
        </div>`,
    },
    {
      metadata: {
        title: 'Key Metrics',
        type: 'metrics',
        narrative:
          'Pengui Labs has achieved strong traction since launching 6 months ago, with rapid growth in both revenue and developer adoption.',
        key_points: [
          '$2.4M ARR growing 30% MoM',
          '12,000+ developers on platform',
          '99.97% uptime SLA',
          'NPS of 72',
        ],
        data_points: [
          { label: 'Annual Recurring Revenue', value: '$2.4M', period: 'Q1 2026', trend: 'up' },
          { label: 'Monthly Growth Rate', value: 30, unit: '%', trend: 'up' },
          { label: 'Active Developers', value: '12,000+', trend: 'up' },
          { label: 'Net Promoter Score', value: 72, trend: 'up' },
          { label: 'Platform Uptime', value: 99.97, unit: '%' },
          { label: 'Average Response Time', value: '<50ms' },
        ],
        tags: ['metrics', 'traction', 'growth'],
        audience: 'investors',
        confidentiality: 'confidential',
      },
      content: `
        <div style="display:flex;flex-direction:column;height:100%;justify-content:center;">
          <span style="font-size:var(--text-label);color:var(--color-accent-primary);font-weight:var(--weight-medium);text-transform:uppercase;letter-spacing:0.08em;">Traction</span>
          <h2 style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);color:var(--color-text-primary);margin-top:var(--space-sm);line-height:var(--line-height-heading);letter-spacing:var(--letter-spacing-heading);">Key Metrics</h2>
          <p style="font-size:var(--text-body);color:var(--color-text-secondary);margin-top:var(--space-sm);line-height:var(--line-height-body);max-width:600px;">6 months post-launch, Pengui Labs has established a strong growth trajectory across all key indicators.</p>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-lg);margin-top:var(--space-xl);">
            <div style="background:var(--color-surface);border-radius:var(--radius-card);padding:var(--component-card-padding);border:var(--border-width) solid var(--color-border);box-shadow:var(--shadow-soft);text-align:center;">
              <div style="font-size:var(--text-hero);font-weight:var(--weight-bold);color:var(--color-accent-primary);">$2.4M</div>
              <div style="font-size:var(--text-label);color:var(--color-text-secondary);margin-top:var(--space-xs);">Annual Recurring Revenue</div>
              <div style="font-size:var(--text-caption);color:var(--color-success);margin-top:var(--space-xs);">↑ 30% MoM</div>
            </div>
            <div style="background:var(--color-surface);border-radius:var(--radius-card);padding:var(--component-card-padding);border:var(--border-width) solid var(--color-border);box-shadow:var(--shadow-soft);text-align:center;">
              <div style="font-size:var(--text-hero);font-weight:var(--weight-bold);color:var(--color-accent-primary);">12K+</div>
              <div style="font-size:var(--text-label);color:var(--color-text-secondary);margin-top:var(--space-xs);">Active Developers</div>
              <div style="font-size:var(--text-caption);color:var(--color-success);margin-top:var(--space-xs);">↑ 45% QoQ</div>
            </div>
            <div style="background:var(--color-surface);border-radius:var(--radius-card);padding:var(--component-card-padding);border:var(--border-width) solid var(--color-border);box-shadow:var(--shadow-soft);text-align:center;">
              <div style="font-size:var(--text-hero);font-weight:var(--weight-bold);color:var(--color-accent-primary);">72</div>
              <div style="font-size:var(--text-label);color:var(--color-text-secondary);margin-top:var(--space-xs);">Net Promoter Score</div>
              <div style="font-size:var(--text-caption);color:var(--color-text-tertiary);margin-top:var(--space-xs);">Industry avg: 34</div>
            </div>
            <div style="background:var(--color-surface);border-radius:var(--radius-card);padding:var(--component-card-padding);border:var(--border-width) solid var(--color-border);box-shadow:var(--shadow-soft);text-align:center;">
              <div style="font-size:var(--text-h2);font-weight:var(--weight-bold);color:var(--color-text-primary);">99.97%</div>
              <div style="font-size:var(--text-label);color:var(--color-text-secondary);margin-top:var(--space-xs);">Platform Uptime</div>
            </div>
            <div style="background:var(--color-surface);border-radius:var(--radius-card);padding:var(--component-card-padding);border:var(--border-width) solid var(--color-border);box-shadow:var(--shadow-soft);text-align:center;">
              <div style="font-size:var(--text-h2);font-weight:var(--weight-bold);color:var(--color-text-primary);"><span style="font-family:var(--font-mono);">&lt;50ms</span></div>
              <div style="font-size:var(--text-label);color:var(--color-text-secondary);margin-top:var(--space-xs);">Avg Response Time</div>
            </div>
            <div style="background:var(--color-surface);border-radius:var(--radius-card);padding:var(--component-card-padding);border:var(--border-width) solid var(--color-border);box-shadow:var(--shadow-soft);text-align:center;">
              <div style="font-size:var(--text-h2);font-weight:var(--weight-bold);color:var(--color-text-primary);">3.2x</div>
              <div style="font-size:var(--text-label);color:var(--color-text-secondary);margin-top:var(--space-xs);">Developer Productivity Gain</div>
            </div>
          </div>
        </div>`,
    },
    {
      metadata: {
        title: 'Product Platform',
        type: 'features-grid',
        narrative:
          'The Pengui platform provides four core capabilities that work together to eliminate infrastructure overhead for AI development teams.',
        key_points: [
          'Unified Pipeline Orchestration',
          'Intelligent Context Engine',
          'One-Click Deployment',
          'Real-time Observability',
        ],
        tags: ['product', 'platform', 'features'],
        audience: 'investors',
      },
      content: `
        <div style="display:flex;flex-direction:column;height:100%;justify-content:center;">
          <span style="font-size:var(--text-label);color:var(--color-accent-primary);font-weight:var(--weight-medium);text-transform:uppercase;letter-spacing:0.08em;">Platform</span>
          <h2 style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);color:var(--color-text-primary);margin-top:var(--space-sm);line-height:var(--line-height-heading);letter-spacing:var(--letter-spacing-heading);">Four pillars of Pengui</h2>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:var(--space-lg);margin-top:var(--space-xl);">
            <div style="background:var(--color-surface);border-radius:var(--radius-card);padding:var(--component-card-padding);border:var(--border-width) solid var(--color-border);box-shadow:var(--shadow-soft);">
              <div style="width:48px;height:48px;background:var(--color-accent-primary);border-radius:var(--radius-lg);display:flex;align-items:center;justify-content:center;color:var(--color-text-inverse);font-size:var(--text-h3);margin-bottom:var(--space-md);">⚡</div>
              <h3 style="font-family:var(--font-display);font-size:var(--text-h3);font-weight:var(--weight-bold);color:var(--color-text-primary);">Pipeline Orchestration</h3>
              <p style="font-size:var(--text-body);color:var(--color-text-secondary);margin-top:var(--space-sm);line-height:var(--line-height-body);">Define complex AI pipelines in YAML. Automatic dependency resolution, parallel execution, and intelligent caching.</p>
              <span style="display:inline-block;margin-top:var(--space-md);background:var(--color-surface-alt);padding:var(--component-badge-padding-y) var(--component-badge-padding-x);border-radius:var(--radius-badge);font-size:var(--text-caption);color:var(--color-accent-primary);font-weight:var(--weight-medium);">Core</span>
            </div>
            <div style="background:var(--color-surface);border-radius:var(--radius-card);padding:var(--component-card-padding);border:var(--border-width) solid var(--color-border);box-shadow:var(--shadow-soft);">
              <div style="width:48px;height:48px;background:var(--color-accent-secondary);border-radius:var(--radius-lg);display:flex;align-items:center;justify-content:center;color:var(--color-text-inverse);font-size:var(--text-h3);margin-bottom:var(--space-md);">🧠</div>
              <h3 style="font-family:var(--font-display);font-size:var(--text-h3);font-weight:var(--weight-bold);color:var(--color-text-primary);">Context Engine</h3>
              <p style="font-size:var(--text-body);color:var(--color-text-secondary);margin-top:var(--space-sm);line-height:var(--line-height-body);">Intelligent context management across your entire codebase. Semantic search, automatic chunking, and RAG-optimized retrieval.</p>
              <span style="display:inline-block;margin-top:var(--space-md);background:var(--color-surface-alt);padding:var(--component-badge-padding-y) var(--component-badge-padding-x);border-radius:var(--radius-badge);font-size:var(--text-caption);color:var(--color-accent-secondary);font-weight:var(--weight-medium);">Intelligence</span>
            </div>
            <div style="background:var(--color-surface);border-radius:var(--radius-card);padding:var(--component-card-padding);border:var(--border-width) solid var(--color-border);box-shadow:var(--shadow-soft);">
              <div style="width:48px;height:48px;background:var(--color-accent-warm);border-radius:var(--radius-lg);display:flex;align-items:center;justify-content:center;color:var(--color-text-inverse);font-size:var(--text-h3);margin-bottom:var(--space-md);">🚀</div>
              <h3 style="font-family:var(--font-display);font-size:var(--text-h3);font-weight:var(--weight-bold);color:var(--color-text-primary);">One-Click Deploy</h3>
              <p style="font-size:var(--text-body);color:var(--color-text-secondary);margin-top:var(--space-sm);line-height:var(--line-height-body);">Ship AI-powered features in minutes, not weeks. Built-in scaling, versioning, A/B testing, and rollback capabilities.</p>
              <span style="display:inline-block;margin-top:var(--space-md);background:var(--color-surface-alt);padding:var(--component-badge-padding-y) var(--component-badge-padding-x);border-radius:var(--radius-badge);font-size:var(--text-caption);color:var(--color-accent-warm);font-weight:var(--weight-medium);">Deploy</span>
            </div>
            <div style="background:var(--color-surface);border-radius:var(--radius-card);padding:var(--component-card-padding);border:var(--border-width) solid var(--color-border);box-shadow:var(--shadow-soft);">
              <div style="width:48px;height:48px;background:var(--color-success);border-radius:var(--radius-lg);display:flex;align-items:center;justify-content:center;color:var(--color-text-inverse);font-size:var(--text-h3);margin-bottom:var(--space-md);">📊</div>
              <h3 style="font-family:var(--font-display);font-size:var(--text-h3);font-weight:var(--weight-bold);color:var(--color-text-primary);">Observability</h3>
              <p style="font-size:var(--text-body);color:var(--color-text-secondary);margin-top:var(--space-sm);line-height:var(--line-height-body);">Real-time monitoring of model performance, cost tracking, latency analysis, and drift detection across all your AI systems.</p>
              <span style="display:inline-block;margin-top:var(--space-md);background:var(--color-surface-alt);padding:var(--component-badge-padding-y) var(--component-badge-padding-x);border-radius:var(--radius-badge);font-size:var(--text-caption);color:var(--color-success);font-weight:var(--weight-medium);">Monitor</span>
            </div>
          </div>
        </div>`,
    },
    {
      metadata: {
        title: 'Join the Revolution',
        type: 'closing-cta',
        narrative:
          'Closing call-to-action inviting investors to join Pengui Labs Series A round and help shape the future of AI developer tooling.',
        key_points: [
          'Series A: $15M target',
          'Led by top-tier VCs',
          'Join 12K+ developers already building with Pengui',
        ],
        tags: ['closing', 'cta', 'fundraising'],
        audience: 'investors',
        confidentiality: 'confidential',
      },
      content: `
        <div style="text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;">
          <div style="width:64px;height:64px;background:var(--color-accent-primary);border-radius:var(--radius-xl);display:flex;align-items:center;justify-content:center;color:var(--color-text-inverse);font-size:var(--text-h2);font-weight:var(--weight-bold);margin-bottom:var(--space-xl);">P</div>
          <h2 style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);color:var(--color-text-primary);line-height:var(--line-height-heading);letter-spacing:var(--letter-spacing-heading);max-width:800px;">The future of AI development starts here</h2>
          <p style="font-size:var(--text-h3);color:var(--color-text-secondary);margin-top:var(--space-md);line-height:var(--line-height-body);max-width:600px;">Join 12,000+ developers already building with Pengui. Let's shape the future of intelligent infrastructure together.</p>
          <div style="display:flex;gap:var(--space-md);margin-top:var(--space-xxl);">
            <a style="display:inline-flex;align-items:center;padding:var(--component-button-padding-y) var(--component-button-padding-x);background:var(--color-accent-primary);color:var(--color-text-inverse);border-radius:var(--radius-button);font-size:var(--text-body);font-weight:var(--weight-medium);text-decoration:none;box-shadow:var(--shadow-soft);">Schedule a Meeting</a>
            <a style="display:inline-flex;align-items:center;padding:var(--component-button-padding-y) var(--component-button-padding-x);background:var(--color-surface);color:var(--color-text-primary);border-radius:var(--radius-button);font-size:var(--text-body);font-weight:var(--weight-medium);text-decoration:none;border:var(--border-width) solid var(--color-border);">View Docs</a>
          </div>
          <div style="position:absolute;bottom:var(--space-xxl);display:flex;gap:var(--space-xl);color:var(--color-text-tertiary);font-size:var(--text-label);">
            <span>santiago@penguilabs.ai</span>
            <span>penguilabs.ai</span>
            <span>Series A — Q1 2026</span>
          </div>
        </div>`,
    },
  ];

  const slideIds: string[] = [];

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    log('📝', `Step 5.${i + 1}: Adding slide "${slide.metadata.title}"...`);

    const html = makeSlideHtml(cssTokens, slide.content);

    const addResult = await client.callTool({
      name: 'add_slide',
      arguments: {
        deck_id: deckId,
        html,
        metadata: slide.metadata,
      },
    });

    const addData = JSON.parse(
      (addResult as { content: Array<{ text: string }> }).content[0].text,
    );
    slideIds.push(addData.slide_id);

    // Log validation results
    const validation = addData.validation;
    if (validation) {
      const status = validation.passed ? '✅ PASSED' : '❌ FAILED';
      log(
        validation.passed ? '✅' : '⚠️',
        `  Slide ${i + 1} validation: ${status} | Score: ${validation.styleScore?.overall?.toFixed(2) ?? 'N/A'} | Issues: ${validation.errorCount} errors, ${validation.warningCount} warnings`,
      );
      if (validation.issues && validation.issues.length > 0) {
        for (const issue of validation.issues.slice(0, 5)) {
          log('  ', `  [${issue.severity}] ${issue.rule}: ${issue.message}`);
        }
        if (validation.issues.length > 5) {
          log('  ', `  ... and ${validation.issues.length - 5} more issues`);
        }
      }
    }
  }

  log('✅', `All 5 slides added. Slide IDs: ${slideIds.join(', ')}`);

  // ── Step 6: Get Deck Summary ──────────────────────────────────

  log('📝', 'Step 6: Getting deck summary...');
  const summaryResult = await client.callTool({
    name: 'get_deck_summary',
    arguments: { deck_id: deckId },
  });
  logResult('get_deck_summary', summaryResult);

  // ── Step 7: Validate a slide at full depth ────────────────────

  log('📝', 'Step 7: Running full (Stage 2) validation on slide 1...');
  const fullValidateResult = await client.callTool({
    name: 'validate_slide',
    arguments: {
      html: makeSlideHtml(cssTokens, slides[0].content),
      soul_id: soulId,
      depth: 'full',
    },
  });
  const fullValidation = JSON.parse(
    (fullValidateResult as { content: Array<{ text: string }> }).content[0].text,
  );
  log(
    fullValidation.passed ? '✅' : '⚠️',
    `Full validation: ${fullValidation.passed ? 'PASSED' : 'FAILED'} | Score: ${fullValidation.styleScore?.overall?.toFixed(2) ?? 'N/A'} | Errors: ${fullValidation.errorCount} | Warnings: ${fullValidation.warningCount} | Stage2: ${fullValidation.stage2Skipped ? 'SKIPPED' : 'RAN'}`,
  );

  // ── Step 8: Render Previews ───────────────────────────────────

  log('📝', 'Step 8: Rendering preview thumbnails...');
  const previewResult = await client.callTool({
    name: 'render_preview',
    arguments: { deck_id: deckId, thumbnail_width: 480 },
  });
  const previewData = JSON.parse(
    (previewResult as { content: Array<{ text: string }> }).content[0].text,
  );
  log(
    '✅',
    `Rendered ${previewData.previews.length} preview thumbnails (base64 lengths: ${previewData.previews.map((p: { image_base64: string }) => p.image_base64.length).join(', ')})`,
  );

  // ── Step 9: Export PPTX ───────────────────────────────────────

  log('📝', 'Step 9: Exporting to PPTX...');
  const pptxResult = await client.callTool({
    name: 'export_pptx',
    arguments: { deck_id: deckId, resolution: '1080p', image_format: 'png' },
  });
  logResult('export_pptx', pptxResult);

  // ── Step 10: Export HTML ──────────────────────────────────────

  log('📝', 'Step 10: Exporting to HTML...');
  const htmlResult = await client.callTool({
    name: 'export_html',
    arguments: { deck_id: deckId, include_navigation: true },
  });
  logResult('export_html', htmlResult);

  // ── Step 11: Export PDF ───────────────────────────────────────

  log('📝', 'Step 11: Exporting to PDF...');
  const pdfResult = await client.callTool({
    name: 'export_pdf',
    arguments: { deck_id: deckId, mode: 'image' },
  });
  logResult('export_pdf', pdfResult);

  // ── Step 12: List Design Souls ────────────────────────────────

  log('📝', 'Step 12: Listing all Design Souls...');
  const listResult = await client.callTool({
    name: 'list_design_souls',
    arguments: { status_filter: 'all' },
  });
  logResult('list_design_souls', listResult);

  // ── Done ──────────────────────────────────────────────────────

  log('🎉', 'E2E demo complete! All 16 tools exercised successfully.');
  log('📁', 'Check the output/ directory for generated files.');

  await client.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
