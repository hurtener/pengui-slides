#!/usr/bin/env npx tsx
/**
 * Coffee Brewing — A 5-page A4 print demo using the cozy parchment soul.
 *
 *   1. Cover         — title, subtitle, decorative cup mark
 *   2. The Spectrum  — horizontal tree/mind-map of brewing methods
 *   3. Pour-over vs French Press — side-by-side comparison page
 *   4. The Variables — ratio chart + variable wheel
 *   5. Key Principles — numbered takeaways + closing quote
 *
 * Run after `npm run build`:
 *   npx tsx scripts/coffee-demo.mts
 *
 * Produces a PDF at ./output/The_Art_of_Coffee_Brewing.pdf
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

const RUNNING_TITLE = 'The Art of Coffee Brewing';

// ── Cozy parchment soul (shared aesthetic with print-demo.mts) ────

const soulLayers = {
  color: {
    canvas: '#FAF6EE',
    surface: '#F4EDE0',
    surfaceAlt: '#EBE2D2',
    border: 'rgba(168, 144, 110, 0.28)',
    textPrimary: '#2A211A',
    textSecondary: '#695A4C',
    textTertiary: '#9C8B79',
    textInverse: '#FAF6EE',
    accentPrimary: '#3F8E78',
    accentSecondary: '#7B9DB8',
    accentWarm: '#C46A3F',
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
    sizeH2: 32,
    sizeH3: 22,
    sizeBody: 16,
    sizeLabel: 13,
    sizeCaption: 11,
    weightNormal: 400,
    weightMedium: 500,
    weightBold: 700,
    lineHeightHeading: 1.1,
    lineHeightBody: 1.55,
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
    cardPadding: '28px',
    cardShadow: '0 1px 3px rgba(42, 33, 26, 0.05)',
    cardBorderWidth: '1px',
    buttonPaddingX: '22px',
    buttonPaddingY: '12px',
    inputPaddingX: '16px',
    inputPaddingY: '12px',
    inputBorderWidth: '1px',
    badgePaddingX: '12px',
    badgePaddingY: '4px',
  },
  motion: {
    durationFast: '120ms',
    durationNormal: '240ms',
    durationSlow: '420ms',
    easingDefault: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easingEmphasized: 'cubic-bezier(0.2, 0, 0, 1)',
    northStar:
      'Warm parchment field guide. Generous whitespace, serif display, mint accents — confident and quietly tactile, the way a well-loved cookbook feels.',
    doRules: [
      'Use warm neutrals as the base, mint sparingly for emphasis',
      'Generous spacing between sections — let the page breathe',
      'Serif display for titles, sans for body, mono for measurements',
      'Diagrams in muted pastel groups, never neon',
    ],
    dontRules: [
      'Pure white or pure black backgrounds',
      'Heavy borders or hard dividers',
      'Dense walls of body text without breaks',
      'Saturated accent colors as decoration',
    ],
  },
};

// ── Page builder ────────────────────────────────────────────────

function printPage(
  cssTokens: string,
  body: string,
  meta: Record<string, unknown>,
  chrome?: Record<string, unknown>,
): string {
  const chromeComment = chrome ? `<!-- @page-chrome ${JSON.stringify(chrome)} -->\n` : '';
  return `<!DOCTYPE html>
<html lang="en" data-pengui-medium="print">
<head><meta charset="utf-8"></head>
<style>
${cssTokens}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: var(--font-body); color: var(--color-text-primary); background: var(--color-canvas); }
.eyebrow { font-family: var(--font-mono); font-size: var(--text-caption); letter-spacing: 0.18em; text-transform: uppercase; color: var(--color-accent-primary); }
.lede { font-size: var(--text-h3); color: var(--color-text-secondary); line-height: var(--line-height-body); }
.body { font-size: var(--text-body); color: var(--color-text-primary); line-height: var(--line-height-body); }
.muted { color: var(--color-text-secondary); }
</style>
<body>
<!-- @slide-meta ${JSON.stringify(meta)} -->
${chromeComment}<div class="slide" style="width:1240px;height:1754px;padding:var(--space-safe-area);position:relative;overflow:hidden;">
${body}
</div>
</body>
</html>`;
}

// ── Page bodies ─────────────────────────────────────────────────

const PAGE_COVER = `
<div style="display:flex;flex-direction:column;justify-content:space-between;height:100%;padding:var(--space-xxl) var(--space-xl);">
  <div>
    <div class="eyebrow">A Field Guide</div>
    <div style="margin-top:var(--space-md);height:2px;width:80px;background:var(--color-accent-primary);"></div>
  </div>

  <div style="display:flex;align-items:center;gap:var(--space-xxl);">
    <svg viewBox="0 0 220 260" xmlns="http://www.w3.org/2000/svg" style="width:160px;height:auto;flex-shrink:0;">
      <!-- handle -->
      <path d="M170,90 Q210,90 210,140 Q210,190 170,190" fill="none" stroke="var(--color-text-primary)" stroke-width="6" stroke-linecap="round"/>
      <!-- cup body -->
      <path d="M30,80 L170,80 L160,210 Q160,230 140,230 L60,230 Q40,230 40,210 Z" fill="var(--color-surface)" stroke="var(--color-text-primary)" stroke-width="6" stroke-linejoin="round"/>
      <!-- coffee surface -->
      <ellipse cx="100" cy="80" rx="70" ry="10" fill="var(--color-accent-warm)" opacity="0.85"/>
      <!-- saucer -->
      <ellipse cx="100" cy="248" rx="92" ry="9" fill="none" stroke="var(--color-text-primary)" stroke-width="5"/>
      <!-- steam -->
      <path d="M70,55 Q60,40 70,25 Q80,10 70,0" fill="none" stroke="var(--color-text-tertiary)" stroke-width="4" stroke-linecap="round" opacity="0.55"/>
      <path d="M100,52 Q90,38 100,22 Q110,8 100,-2" fill="none" stroke="var(--color-text-tertiary)" stroke-width="4" stroke-linecap="round" opacity="0.55"/>
      <path d="M130,55 Q120,40 130,25 Q140,10 130,0" fill="none" stroke="var(--color-text-tertiary)" stroke-width="4" stroke-linecap="round" opacity="0.55"/>
    </svg>

    <div>
      <h1 style="font-family:var(--font-display);font-size:var(--text-hero);font-weight:var(--weight-bold);line-height:var(--line-height-heading);letter-spacing:var(--letter-spacing-heading);color:var(--color-text-primary);">The Art of<br/>Coffee Brewing</h1>
      <p style="margin-top:var(--space-md);font-size:var(--text-h3);color:var(--color-text-secondary);">A short guide to better cups at home.</p>
    </div>
  </div>

  <div style="display:flex;justify-content:space-between;align-items:flex-end;">
    <div>
      <div class="eyebrow">Volume</div>
      <div style="font-family:var(--font-display);font-size:var(--text-h2);color:var(--color-text-primary);margin-top:var(--space-xs);">No. 01</div>
    </div>
    <div style="text-align:right;">
      <div class="eyebrow">Pengui Print</div>
      <div style="font-size:var(--text-caption);color:var(--color-text-tertiary);margin-top:var(--space-xs);">Five pages · A4</div>
    </div>
  </div>
</div>
`;

const PAGE_SPECTRUM = `
<div class="eyebrow">Chapter One</div>
<h1 style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);line-height:var(--line-height-heading);letter-spacing:var(--letter-spacing-heading);color:var(--color-text-primary);margin-top:var(--space-sm);">The Brewing Spectrum</h1>
<p class="lede" style="margin-top:var(--space-md);max-width:920px;">Every brewing method is one of three interactions between water and ground coffee — filtration, immersion, or pressure. Understanding the family tree is the fastest way to choose the right tool for the cup you want.</p>

<svg viewBox="0 0 1080 760" xmlns="http://www.w3.org/2000/svg" style="margin-top:var(--space-xl);width:100%;height:auto;" role="img" aria-label="Tree diagram of coffee brewing methods">
  <!-- Connectors first so nodes paint over them -->
  <g stroke="var(--color-border)" stroke-width="1.6" fill="none">
    <!-- root -> 3 categories -->
    <path d="M210,380 H280 V120 H360"/>
    <path d="M210,380 H280 V380 H360"/>
    <path d="M210,380 H280 V640 H360"/>

    <!-- filter -> leaves -->
    <path d="M620,120 H680 V60 H740"/>
    <path d="M620,120 H680 V120 H740"/>
    <path d="M620,120 H680 V180 H740"/>

    <!-- immersion -> leaves -->
    <path d="M620,380 H680 V320 H740"/>
    <path d="M620,380 H680 V380 H740"/>
    <path d="M620,380 H680 V440 H740"/>

    <!-- pressure -> leaves -->
    <path d="M620,640 H680 V580 H740"/>
    <path d="M620,640 H680 V640 H740"/>
    <path d="M620,640 H680 V700 H740"/>
  </g>

  <!-- Root node -->
  <g>
    <rect x="40" y="340" width="170" height="80" rx="14" fill="var(--color-surface)" stroke="var(--color-border)" stroke-width="1.5"/>
    <text x="125" y="372" text-anchor="middle" font-family="var(--font-display)" font-weight="700" font-size="var(--text-h3)" fill="var(--color-text-primary)">Coffee</text>
    <text x="125" y="395" text-anchor="middle" font-style="italic" font-size="var(--text-caption)" fill="var(--color-text-secondary)">water meets grounds</text>
  </g>

  <!-- Categories -->
  <g>
    <rect x="360" y="80" width="260" height="80" rx="14" fill="var(--color-category-a)" stroke="var(--color-border)" stroke-width="1.2"/>
    <text x="490" y="112" text-anchor="middle" font-family="var(--font-display)" font-weight="700" font-size="var(--text-h3)" fill="var(--color-text-primary)">Filter</text>
    <text x="490" y="138" text-anchor="middle" font-style="italic" font-size="var(--text-caption)" fill="var(--color-text-secondary)">water passes through</text>
  </g>
  <g>
    <rect x="360" y="340" width="260" height="80" rx="14" fill="var(--color-category-b)" stroke="var(--color-border)" stroke-width="1.2"/>
    <text x="490" y="372" text-anchor="middle" font-family="var(--font-display)" font-weight="700" font-size="var(--text-h3)" fill="var(--color-text-primary)">Immersion</text>
    <text x="490" y="398" text-anchor="middle" font-style="italic" font-size="var(--text-caption)" fill="var(--color-text-secondary)">grounds steep in water</text>
  </g>
  <g>
    <rect x="360" y="600" width="260" height="80" rx="14" fill="var(--color-category-c)" stroke="var(--color-border)" stroke-width="1.2"/>
    <text x="490" y="632" text-anchor="middle" font-family="var(--font-display)" font-weight="700" font-size="var(--text-h3)" fill="var(--color-text-primary)">Pressure</text>
    <text x="490" y="658" text-anchor="middle" font-style="italic" font-size="var(--text-caption)" fill="var(--color-text-secondary)">force water through</text>
  </g>

  <!-- Leaves: Filter -->
  <g>
    <rect x="740" y="30" width="300" height="60" rx="12" fill="var(--color-category-a-tint)" stroke="var(--color-border)" stroke-width="1"/>
    <text x="760" y="58" font-family="var(--font-body)" font-weight="600" font-size="var(--text-body)" fill="var(--color-text-primary)">Pour-over</text>
    <text x="760" y="78" font-style="italic" font-size="var(--text-caption)" fill="var(--color-text-secondary)">V60, Kalita — clarity, control</text>
  </g>
  <g>
    <rect x="740" y="90" width="300" height="60" rx="12" fill="var(--color-category-a-tint)" stroke="var(--color-border)" stroke-width="1"/>
    <text x="760" y="118" font-family="var(--font-body)" font-weight="600" font-size="var(--text-body)" fill="var(--color-text-primary)">Drip Machine</text>
    <text x="760" y="138" font-style="italic" font-size="var(--text-caption)" fill="var(--color-text-secondary)">scheduled, hands-off</text>
  </g>
  <g>
    <rect x="740" y="150" width="300" height="60" rx="12" fill="var(--color-category-a-tint)" stroke="var(--color-border)" stroke-width="1"/>
    <text x="760" y="178" font-family="var(--font-body)" font-weight="600" font-size="var(--text-body)" fill="var(--color-text-primary)">Chemex</text>
    <text x="760" y="198" font-style="italic" font-size="var(--text-caption)" fill="var(--color-text-secondary)">thick filter, glassy body</text>
  </g>

  <!-- Leaves: Immersion -->
  <g>
    <rect x="740" y="290" width="300" height="60" rx="12" fill="var(--color-category-b-tint)" stroke="var(--color-border)" stroke-width="1"/>
    <text x="760" y="318" font-family="var(--font-body)" font-weight="600" font-size="var(--text-body)" fill="var(--color-text-primary)">French Press</text>
    <text x="760" y="338" font-style="italic" font-size="var(--text-caption)" fill="var(--color-text-secondary)">heavy body, full flavor</text>
  </g>
  <g>
    <rect x="740" y="350" width="300" height="60" rx="12" fill="var(--color-category-b-tint)" stroke="var(--color-border)" stroke-width="1"/>
    <text x="760" y="378" font-family="var(--font-body)" font-weight="600" font-size="var(--text-body)" fill="var(--color-text-primary)">AeroPress</text>
    <text x="760" y="398" font-style="italic" font-size="var(--text-caption)" fill="var(--color-text-secondary)">versatile, travel-friendly</text>
  </g>
  <g>
    <rect x="740" y="410" width="300" height="60" rx="12" fill="var(--color-category-b-tint)" stroke="var(--color-border)" stroke-width="1"/>
    <text x="760" y="438" font-family="var(--font-body)" font-weight="600" font-size="var(--text-body)" fill="var(--color-text-primary)">Cold Brew</text>
    <text x="760" y="458" font-style="italic" font-size="var(--text-caption)" fill="var(--color-text-secondary)">12–18 h steep, low acidity</text>
  </g>

  <!-- Leaves: Pressure -->
  <g>
    <rect x="740" y="550" width="300" height="60" rx="12" fill="var(--color-category-c-tint)" stroke="var(--color-border)" stroke-width="1"/>
    <text x="760" y="578" font-family="var(--font-body)" font-weight="600" font-size="var(--text-body)" fill="var(--color-text-primary)">Espresso</text>
    <text x="760" y="598" font-style="italic" font-size="var(--text-caption)" fill="var(--color-text-secondary)">9 bar, intense extraction</text>
  </g>
  <g>
    <rect x="740" y="610" width="300" height="60" rx="12" fill="var(--color-category-c-tint)" stroke="var(--color-border)" stroke-width="1"/>
    <text x="760" y="638" font-family="var(--font-body)" font-weight="600" font-size="var(--text-body)" fill="var(--color-text-primary)">Moka Pot</text>
    <text x="760" y="658" font-style="italic" font-size="var(--text-caption)" fill="var(--color-text-secondary)">stovetop, ~1.5 bar</text>
  </g>
  <g>
    <rect x="740" y="670" width="300" height="60" rx="12" fill="var(--color-category-c-tint)" stroke="var(--color-border)" stroke-width="1"/>
    <text x="760" y="698" font-family="var(--font-body)" font-weight="600" font-size="var(--text-body)" fill="var(--color-text-primary)">AeroPress (pressed)</text>
    <text x="760" y="718" font-style="italic" font-size="var(--text-caption)" fill="var(--color-text-secondary)">hand pressure, concentrated</text>
  </g>
</svg>
`;

const PAGE_COMPARE = `
<div class="eyebrow">Chapter Two</div>
<h1 style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);line-height:var(--line-height-heading);letter-spacing:var(--letter-spacing-heading);color:var(--color-text-primary);margin-top:var(--space-sm);">Pour-over vs French Press</h1>
<p class="lede" style="margin-top:var(--space-md);max-width:920px;">The two most common manual methods sit at opposite ends of the brewing spectrum. One filters; the other immerses. The choice is less about technique and more about the cup you want.</p>

<div style="display:grid;grid-template-columns:1fr 64px 1fr;gap:var(--space-lg);margin-top:var(--space-xl);">
  <!-- Pour-over column -->
  <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--space-xl);">
    <div style="display:flex;align-items:center;gap:var(--space-md);">
      <svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" style="width:44px;height:44px;flex-shrink:0;">
        <path d="M10,15 L50,15 L40,45 L20,45 Z" fill="none" stroke="var(--color-text-primary)" stroke-width="2.5" stroke-linejoin="round"/>
        <line x1="10" y1="15" x2="20" y2="45" stroke="var(--color-text-secondary)" stroke-width="1" stroke-dasharray="2 2"/>
        <line x1="50" y1="15" x2="40" y2="45" stroke="var(--color-text-secondary)" stroke-width="1" stroke-dasharray="2 2"/>
        <ellipse cx="30" cy="48" rx="14" ry="3" fill="var(--color-accent-warm)" opacity="0.6"/>
      </svg>
      <h2 style="font-family:var(--font-display);font-size:var(--text-h2);font-weight:var(--weight-bold);color:var(--color-text-primary);">Pour-over</h2>
    </div>
    <p style="margin-top:var(--space-md);color:var(--color-text-secondary);font-size:var(--text-body);line-height:var(--line-height-body);">Hot water poured slowly through medium-fine grounds in a paper filter. Body is light, flavor is clean and articulate.</p>

    <dl style="margin-top:var(--space-lg);display:grid;grid-template-columns:auto 1fr;gap:var(--space-sm) var(--space-md);font-size:var(--text-body);">
      <dt class="muted" style="font-family:var(--font-mono);font-size:var(--text-caption);text-transform:uppercase;letter-spacing:0.08em;">Grind</dt>
      <dd style="color:var(--color-text-primary);">medium-fine, like table salt</dd>
      <dt class="muted" style="font-family:var(--font-mono);font-size:var(--text-caption);text-transform:uppercase;letter-spacing:0.08em;">Ratio</dt>
      <dd style="color:var(--color-text-primary);">1 : 16  (60 g per 1 L)</dd>
      <dt class="muted" style="font-family:var(--font-mono);font-size:var(--text-caption);text-transform:uppercase;letter-spacing:0.08em;">Time</dt>
      <dd style="color:var(--color-text-primary);">2:30–3:30 minutes total</dd>
      <dt class="muted" style="font-family:var(--font-mono);font-size:var(--text-caption);text-transform:uppercase;letter-spacing:0.08em;">Body</dt>
      <dd style="color:var(--color-text-primary);">light, tea-like</dd>
      <dt class="muted" style="font-family:var(--font-mono);font-size:var(--text-caption);text-transform:uppercase;letter-spacing:0.08em;">Best for</dt>
      <dd style="color:var(--color-text-primary);">single-origin coffees, floral notes</dd>
    </dl>
  </section>

  <!-- VS divider -->
  <div style="display:flex;align-items:center;justify-content:center;">
    <div style="width:64px;height:64px;border-radius:var(--radius-full);background:var(--color-accent-primary);color:var(--color-text-inverse);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:var(--weight-bold);font-size:var(--text-h3);">vs</div>
  </div>

  <!-- French Press column -->
  <section style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--space-xl);">
    <div style="display:flex;align-items:center;gap:var(--space-md);">
      <svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" style="width:44px;height:44px;flex-shrink:0;">
        <rect x="14" y="10" width="32" height="44" rx="3" fill="none" stroke="var(--color-text-primary)" stroke-width="2.5"/>
        <line x1="14" y1="22" x2="46" y2="22" stroke="var(--color-text-primary)" stroke-width="2"/>
        <rect x="14" y="22" width="32" height="20" fill="var(--color-accent-warm)" opacity="0.5"/>
        <line x1="30" y1="2" x2="30" y2="22" stroke="var(--color-text-primary)" stroke-width="2.5"/>
        <circle cx="30" cy="2" r="3" fill="var(--color-text-primary)"/>
      </svg>
      <h2 style="font-family:var(--font-display);font-size:var(--text-h2);font-weight:var(--weight-bold);color:var(--color-text-primary);">French Press</h2>
    </div>
    <p style="margin-top:var(--space-md);color:var(--color-text-secondary);font-size:var(--text-body);line-height:var(--line-height-body);">Coarse grounds steeped in hot water, then separated by a metal mesh plunger. Body is heavy, oils and fines stay in the cup.</p>

    <dl style="margin-top:var(--space-lg);display:grid;grid-template-columns:auto 1fr;gap:var(--space-sm) var(--space-md);font-size:var(--text-body);">
      <dt class="muted" style="font-family:var(--font-mono);font-size:var(--text-caption);text-transform:uppercase;letter-spacing:0.08em;">Grind</dt>
      <dd style="color:var(--color-text-primary);">coarse, like sea salt</dd>
      <dt class="muted" style="font-family:var(--font-mono);font-size:var(--text-caption);text-transform:uppercase;letter-spacing:0.08em;">Ratio</dt>
      <dd style="color:var(--color-text-primary);">1 : 15  (66 g per 1 L)</dd>
      <dt class="muted" style="font-family:var(--font-mono);font-size:var(--text-caption);text-transform:uppercase;letter-spacing:0.08em;">Time</dt>
      <dd style="color:var(--color-text-primary);">4 minutes steep + plunge</dd>
      <dt class="muted" style="font-family:var(--font-mono);font-size:var(--text-caption);text-transform:uppercase;letter-spacing:0.08em;">Body</dt>
      <dd style="color:var(--color-text-primary);">heavy, full-mouth</dd>
      <dt class="muted" style="font-family:var(--font-mono);font-size:var(--text-caption);text-transform:uppercase;letter-spacing:0.08em;">Best for</dt>
      <dd style="color:var(--color-text-primary);">dark roasts, chocolatey blends</dd>
    </dl>
  </section>
</div>

<aside style="margin-top:var(--space-xl);padding:var(--space-lg);background:var(--color-surface-alt);border-left:3px solid var(--color-accent-primary);border-radius:var(--radius-sm);">
  <p style="font-style:italic;color:var(--color-text-secondary);font-size:var(--text-body);line-height:var(--line-height-body);">If pour-over is a pencil sketch — every line visible — French Press is an oil painting, opaque and rich. Pick the medium that matches what you want to say with the bean.</p>
</aside>
`;

const PAGE_VARIABLES = `
<div class="eyebrow">Chapter Three</div>
<h1 style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);line-height:var(--line-height-heading);letter-spacing:var(--letter-spacing-heading);color:var(--color-text-primary);margin-top:var(--space-sm);">The Variables</h1>
<p class="lede" style="margin-top:var(--space-md);max-width:920px;">Coffee is a four-variable equation. Hold three constant and the fourth becomes a tunable knob. The coffee-to-water ratio is the most predictable place to start.</p>

<!-- Variable wheel -->
<div style="margin-top:var(--space-xl);display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-md);">
  <div style="padding:var(--space-lg);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);text-align:center;">
    <div style="font-family:var(--font-display);font-size:var(--text-h2);color:var(--color-accent-primary);">01</div>
    <div style="font-family:var(--font-display);font-size:var(--text-h3);font-weight:var(--weight-bold);color:var(--color-text-primary);margin-top:var(--space-xs);">Grind</div>
    <p class="muted" style="font-size:var(--text-caption);margin-top:var(--space-sm);line-height:1.4;">Finer = more surface = faster extraction.</p>
  </div>
  <div style="padding:var(--space-lg);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);text-align:center;">
    <div style="font-family:var(--font-display);font-size:var(--text-h2);color:var(--color-accent-primary);">02</div>
    <div style="font-family:var(--font-display);font-size:var(--text-h3);font-weight:var(--weight-bold);color:var(--color-text-primary);margin-top:var(--space-xs);">Water</div>
    <p class="muted" style="font-size:var(--text-caption);margin-top:var(--space-sm);line-height:1.4;">93–96 °C, low mineral content.</p>
  </div>
  <div style="padding:var(--space-lg);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);text-align:center;">
    <div style="font-family:var(--font-display);font-size:var(--text-h2);color:var(--color-accent-primary);">03</div>
    <div style="font-family:var(--font-display);font-size:var(--text-h3);font-weight:var(--weight-bold);color:var(--color-text-primary);margin-top:var(--space-xs);">Ratio</div>
    <p class="muted" style="font-size:var(--text-caption);margin-top:var(--space-sm);line-height:1.4;">1 : 15 to 1 : 18 by weight.</p>
  </div>
  <div style="padding:var(--space-lg);background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);text-align:center;">
    <div style="font-family:var(--font-display);font-size:var(--text-h2);color:var(--color-accent-primary);">04</div>
    <div style="font-family:var(--font-display);font-size:var(--text-h3);font-weight:var(--weight-bold);color:var(--color-text-primary);margin-top:var(--space-xs);">Time</div>
    <p class="muted" style="font-size:var(--text-caption);margin-top:var(--space-sm);line-height:1.4;">Method-dependent: 25 s to 18 h.</p>
  </div>
</div>

<h2 style="font-family:var(--font-display);font-size:var(--text-h2);font-weight:var(--weight-bold);color:var(--color-text-primary);margin-top:var(--space-xxl);">Coffee : Water Ratios</h2>
<p class="muted" style="font-size:var(--text-caption);margin-top:var(--space-xs);">Grams of coffee per liter of water — typical starting points.</p>

<svg viewBox="0 0 1080 380" xmlns="http://www.w3.org/2000/svg" style="margin-top:var(--space-md);width:100%;height:auto;" role="img" aria-label="Bar chart comparing coffee to water ratios across brewing methods">
  <!-- Y-axis baseline -->
  <line x1="220" y1="20" x2="220" y2="340" stroke="var(--color-border)" stroke-width="1"/>
  <!-- Gridlines -->
  <g stroke="var(--color-border)" stroke-width="0.5" stroke-dasharray="2 4">
    <line x1="220" y1="20"  x2="1060" y2="20"/>
    <line x1="220" y1="100" x2="1060" y2="100"/>
    <line x1="220" y1="180" x2="1060" y2="180"/>
    <line x1="220" y1="260" x2="1060" y2="260"/>
    <line x1="220" y1="340" x2="1060" y2="340"/>
  </g>
  <!-- X-axis baseline -->
  <line x1="220" y1="340" x2="1060" y2="340" stroke="var(--color-border)" stroke-width="1"/>

  <!-- Y-axis labels (g/L) -->
  <g font-family="var(--font-mono)" font-size="var(--text-caption)" fill="var(--color-text-tertiary)" text-anchor="end">
    <text x="200" y="25">80</text>
    <text x="200" y="105">60</text>
    <text x="200" y="185">40</text>
    <text x="200" y="265">20</text>
    <text x="200" y="345">0</text>
  </g>

  <!-- Bars: each method, height = grams * 4 -->
  <!-- Cold Brew 100 g/L (clipped at 80) - actually using 90 -->
  <!-- Pour-over 60 -->
  <rect class="series" x="260" y="100" width="100" height="240" rx="6" fill="var(--color-category-a-tint)" stroke="var(--color-border)" stroke-width="1"/>
  <text x="310" y="92" text-anchor="middle" font-family="var(--font-mono)" font-size="var(--text-caption)" fill="var(--color-text-secondary)">60</text>
  <text x="310" y="365" text-anchor="middle" font-family="var(--font-body)" font-weight="500" font-size="var(--text-body)" fill="var(--color-text-primary)">Pour-over</text>

  <!-- French Press 66 -->
  <rect class="series" x="400" y="76" width="100" height="264" rx="6" fill="var(--color-category-b-tint)" stroke="var(--color-border)" stroke-width="1"/>
  <text x="450" y="68" text-anchor="middle" font-family="var(--font-mono)" font-size="var(--text-caption)" fill="var(--color-text-secondary)">66</text>
  <text x="450" y="365" text-anchor="middle" font-family="var(--font-body)" font-weight="500" font-size="var(--text-body)" fill="var(--color-text-primary)">French Press</text>

  <!-- AeroPress 70 -->
  <rect class="series" x="540" y="60" width="100" height="280" rx="6" fill="var(--color-category-b-tint)" stroke="var(--color-border)" stroke-width="1"/>
  <text x="590" y="52" text-anchor="middle" font-family="var(--font-mono)" font-size="var(--text-caption)" fill="var(--color-text-secondary)">70</text>
  <text x="590" y="365" text-anchor="middle" font-family="var(--font-body)" font-weight="500" font-size="var(--text-body)" fill="var(--color-text-primary)">AeroPress</text>

  <!-- Espresso (per shot eq.) 200 g/L conceptually but for visual purposes show 80 -->
  <rect class="series" x="680" y="20" width="100" height="320" rx="6" fill="var(--color-category-c-tint)" stroke="var(--color-border)" stroke-width="1"/>
  <text x="730" y="12" text-anchor="middle" font-family="var(--font-mono)" font-size="var(--text-caption)" fill="var(--color-text-secondary)">80</text>
  <text x="730" y="365" text-anchor="middle" font-family="var(--font-body)" font-weight="500" font-size="var(--text-body)" fill="var(--color-text-primary)">Espresso</text>

  <!-- Cold Brew 90 (clipped) -->
  <rect class="series" x="820" y="20" width="100" height="320" rx="6" fill="var(--color-category-b-tint)" stroke="var(--color-border)" stroke-width="1" opacity="0.65"/>
  <text x="870" y="12" text-anchor="middle" font-family="var(--font-mono)" font-size="var(--text-caption)" fill="var(--color-text-secondary)">90</text>
  <text x="870" y="365" text-anchor="middle" font-family="var(--font-body)" font-weight="500" font-size="var(--text-body)" fill="var(--color-text-primary)">Cold Brew</text>

  <!-- Legend -->
  <g class="legend" transform="translate(960,30)">
    <rect x="0" y="0" width="14" height="14" rx="3" fill="var(--color-category-a-tint)" stroke="var(--color-border)" stroke-width="1"/>
    <text x="22" y="11" font-family="var(--font-body)" font-size="var(--text-caption)" fill="var(--color-text-secondary)">Filter</text>
    <rect x="0" y="22" width="14" height="14" rx="3" fill="var(--color-category-b-tint)" stroke="var(--color-border)" stroke-width="1"/>
    <text x="22" y="33" font-family="var(--font-body)" font-size="var(--text-caption)" fill="var(--color-text-secondary)">Immersion</text>
    <rect x="0" y="44" width="14" height="14" rx="3" fill="var(--color-category-c-tint)" stroke="var(--color-border)" stroke-width="1"/>
    <text x="22" y="55" font-family="var(--font-body)" font-size="var(--text-caption)" fill="var(--color-text-secondary)">Pressure</text>
  </g>
</svg>
`;

const PAGE_TAKEAWAYS = `
<div class="eyebrow">Closing</div>
<h1 style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);line-height:var(--line-height-heading);letter-spacing:var(--letter-spacing-heading);color:var(--color-text-primary);margin-top:var(--space-sm);">Five Principles</h1>
<p class="lede" style="margin-top:var(--space-md);max-width:920px;">Across every method, these stay true. Internalize them and you can make a decent cup with anything.</p>

<ol style="list-style:none;padding:0;margin-top:var(--space-xl);display:grid;gap:var(--space-lg);">
  <li style="display:grid;grid-template-columns:80px 1fr;gap:var(--space-lg);align-items:start;">
    <div style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);color:var(--color-accent-primary);line-height:1;">1</div>
    <div>
      <h3 style="font-family:var(--font-display);font-size:var(--text-h3);font-weight:var(--weight-bold);color:var(--color-text-primary);">Weigh, don't scoop.</h3>
      <p class="body muted" style="margin-top:var(--space-xs);">A kitchen scale is the single biggest upgrade you can make. Scoops vary by ~30% — weights don't.</p>
    </div>
  </li>
  <li style="display:grid;grid-template-columns:80px 1fr;gap:var(--space-lg);align-items:start;">
    <div style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);color:var(--color-accent-primary);line-height:1;">2</div>
    <div>
      <h3 style="font-family:var(--font-display);font-size:var(--text-h3);font-weight:var(--weight-bold);color:var(--color-text-primary);">Grind right before brewing.</h3>
      <p class="body muted" style="margin-top:var(--space-xs);">Whole beans hold their aromatics. Once ground, they oxidize within minutes.</p>
    </div>
  </li>
  <li style="display:grid;grid-template-columns:80px 1fr;gap:var(--space-lg);align-items:start;">
    <div style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);color:var(--color-accent-primary);line-height:1;">3</div>
    <div>
      <h3 style="font-family:var(--font-display);font-size:var(--text-h3);font-weight:var(--weight-bold);color:var(--color-text-primary);">Water is 98% of the cup.</h3>
      <p class="body muted" style="margin-top:var(--space-xs);">Filter your tap or use bottled water with low TDS. If your water tastes flat, your coffee will too.</p>
    </div>
  </li>
  <li style="display:grid;grid-template-columns:80px 1fr;gap:var(--space-lg);align-items:start;">
    <div style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);color:var(--color-accent-primary);line-height:1;">4</div>
    <div>
      <h3 style="font-family:var(--font-display);font-size:var(--text-h3);font-weight:var(--weight-bold);color:var(--color-text-primary);">Adjust grind, not ratio.</h3>
      <p class="body muted" style="margin-top:var(--space-xs);">If the cup is sour, grind finer. If bitter, grind coarser. Keep the ratio fixed while you tune.</p>
    </div>
  </li>
  <li style="display:grid;grid-template-columns:80px 1fr;gap:var(--space-lg);align-items:start;">
    <div style="font-family:var(--font-display);font-size:var(--text-h1);font-weight:var(--weight-bold);color:var(--color-accent-primary);line-height:1;">5</div>
    <div>
      <h3 style="font-family:var(--font-display);font-size:var(--text-h3);font-weight:var(--weight-bold);color:var(--color-text-primary);">Drink it fresh.</h3>
      <p class="body muted" style="margin-top:var(--space-xs);">Coffee changes as it cools — by 15 minutes the volatiles are gone. Serve in pre-warmed cups.</p>
    </div>
  </li>
</ol>

<aside style="margin-top:var(--space-xxl);padding:var(--space-lg) var(--space-xl);background:var(--color-surface);border-radius:var(--radius-lg);text-align:center;">
  <p style="font-family:var(--font-display);font-style:italic;font-size:var(--text-h3);color:var(--color-text-primary);line-height:1.4;">"There is no such thing as a perfect cup. There is only the cup you make today, and the one you will make tomorrow."</p>
  <p class="muted" style="margin-top:var(--space-sm);font-size:var(--text-caption);">— Pengui Print, Volume 01</p>
</aside>
`;

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  log('☕', 'Starting Coffee Brewing print demo...');

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['build/index.js'],
    cwd: '/Users/santiagobenvenuto/Repos/pengui-slides',
  });
  const client = new Client({ name: 'coffee-demo', version: '1.0.0' });
  await client.connect(transport);

  // 1. Soul
  log('📝', 'Registering "Cozy Parchment" soul...');
  const reg = await client.callTool({
    name: 'register_design_soul',
    arguments: {
      name: 'Cozy Parchment Coffee',
      description: 'Warm parchment with mint and copper accents — a cookbook aesthetic for printable guides.',
      layers: soulLayers,
    },
  });
  const soulId = jsonBody(reg).soul_id as string;

  log('✅', 'Approving soul...');
  await client.callTool({ name: 'approve_design_soul', arguments: { soul_id: soulId } });

  log('📥', 'Fetching css tokens...');
  const gs = await client.callTool({
    name: 'get_design_soul',
    arguments: { soul_id: soulId, include_recipes: true },
  });
  const cssTokens = ((jsonBody(gs).soul as { css_tokens: string }).css_tokens) ?? '';
  if (!cssTokens) throw new Error('css_tokens missing');

  // 2. Deck
  log('📄', 'Creating A4 print deck...');
  const deck = await client.callTool({
    name: 'create_deck',
    arguments: {
      soul_id: soulId,
      title: 'The Art of Coffee Brewing',
      author: 'Pengui Print Vol. 01',
      format: 'print_a4_portrait',
    },
  });
  const deckId = jsonBody(deck).deck_id as string;

  // 3. Pages
  const pages: Array<{ html: string; meta: Record<string, unknown> }> = [
    {
      html: printPage(
        cssTokens,
        PAGE_COVER,
        { title: 'Cover', type: 'cover', narrative: 'Title page' },
        { runningTitle: RUNNING_TITLE, pageNumber: false, hide: true },
      ),
      meta: { title: 'Cover', type: 'cover', narrative: 'Title page' },
    },
    {
      html: printPage(
        cssTokens,
        PAGE_SPECTRUM,
        { title: 'The Brewing Spectrum', type: 'content_diagram', narrative: 'Tree of brewing methods' },
        { runningTitle: RUNNING_TITLE, pageNumber: true, footerAlign: 'right' },
      ),
      meta: { title: 'The Brewing Spectrum', type: 'content_diagram', narrative: 'Tree of brewing methods' },
    },
    {
      html: printPage(
        cssTokens,
        PAGE_COMPARE,
        { title: 'Pour-over vs French Press', type: 'compare', narrative: 'Side-by-side comparison' },
        { runningTitle: RUNNING_TITLE, pageNumber: true, footerAlign: 'right' },
      ),
      meta: { title: 'Pour-over vs French Press', type: 'compare', narrative: 'Side-by-side comparison' },
    },
    {
      html: printPage(
        cssTokens,
        PAGE_VARIABLES,
        { title: 'The Variables', type: 'content_chart', narrative: 'Variable wheel and ratio chart' },
        { runningTitle: RUNNING_TITLE, pageNumber: true, footerAlign: 'right' },
      ),
      meta: { title: 'The Variables', type: 'content_chart', narrative: 'Variable wheel and ratio chart' },
    },
    {
      html: printPage(
        cssTokens,
        PAGE_TAKEAWAYS,
        { title: 'Five Principles', type: 'summary', narrative: 'Closing principles and quote' },
        { runningTitle: RUNNING_TITLE, pageNumber: true, footerAlign: 'right' },
      ),
      meta: { title: 'Five Principles', type: 'summary', narrative: 'Closing principles and quote' },
    },
  ];

  for (const [i, page] of pages.entries()) {
    log('➕', `Adding page ${i + 1}/${pages.length} — ${page.meta.title}`);
    await client.callTool({
      name: 'add_slide',
      arguments: { deck_id: deckId, html: page.html, metadata: page.meta },
    });
    const v = await client.callTool({
      name: 'validate_slide',
      arguments: { html: page.html, soul_id: soulId, deck_id: deckId, depth: 'full' },
    });
    const vBody = jsonBody(v);
    const issues = (vBody.issues as Array<Record<string, unknown>>) ?? [];
    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      for (const issue of errors.slice(0, 3)) {
        log('   ⚠️', `[${issue.rule}] ${String(issue.message).slice(0, 200)}`);
      }
    }
  }

  // 4. Export
  log('📤', 'Exporting PDF...');
  const result = await client.callTool({
    name: 'export_pdf',
    arguments: { deck_id: deckId, mode: 'direct' },
  });
  const meta = jsonBody(result);
  if (meta.error) {
    log('❌', `Export failed: ${JSON.stringify(meta, null, 2)}`);
    process.exit(1);
  }
  log('✅', `PDF exported → ${meta.file_path}`);
  log('📊', `${meta.slide_count} pages, ${Math.round((meta.file_size_bytes as number) / 1024)} KB`);

  await client.close();
}

main().catch((err) => {
  console.error('❌ Coffee demo failed:', err);
  process.exit(1);
});
