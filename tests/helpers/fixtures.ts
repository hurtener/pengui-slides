/**
 * Shared test fixtures for Pengui Slides tests.
 */

import type { SoulLayers, DesignSoulInput } from '../../src/types/design-soul.js';

export const sampleLayers: SoulLayers = {
  color: {
    canvas: '#ffffff',
    surface: '#f8f9fa',
    surfaceAlt: '#e9ecef',
    border: '#dee2e6',
    textPrimary: '#212529',
    textSecondary: '#495057',
    textTertiary: '#868e96',
    textInverse: '#ffffff',
    accentPrimary: '#228be6',
    accentSecondary: '#15aabf',
    accentWarm: '#fd7e14',
    success: '#40c057',
    warning: '#fab005',
    error: '#fa5252',
    info: '#228be6',
  },
  typography: {
    fontDisplay: "'Inter', sans-serif",
    fontBody: "'Inter', sans-serif",
    fontMono: "'JetBrains Mono', monospace",
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
    none: '0',
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
    buttonRadius: '8px',
    cardRadius: '12px',
    inputRadius: '6px',
    badgeRadius: '9999px',
  },
  depth: {
    shadowNone: 'none',
    shadowSoft: '0 1px 3px rgba(0,0,0,0.08)',
    shadowMedium: '0 4px 12px rgba(0,0,0,0.12)',
    shadowElevated: '0 8px 24px rgba(0,0,0,0.16)',
    shadowInner: 'inset 0 2px 4px rgba(0,0,0,0.06)',
    borderWidth: '1px',
    borderOpacity: 0.1,
  },
  components: {
    cardPadding: '24px',
    cardShadow: '0 1px 3px rgba(0,0,0,0.08)',
    cardBorderWidth: '1px',
    buttonPaddingX: '20px',
    buttonPaddingY: '10px',
    inputPaddingX: '12px',
    inputPaddingY: '8px',
    inputBorderWidth: '1px',
    badgePaddingX: '8px',
    badgePaddingY: '2px',
  },
  motion: {
    durationFast: '100ms',
    durationNormal: '200ms',
    durationSlow: '400ms',
    easingDefault: 'cubic-bezier(0.4, 0, 0.2, 1)',
    easingEmphasized: 'cubic-bezier(0.2, 0, 0, 1)',
    northStar: 'Clean and professional',
    doRules: ['Use consistent spacing', 'Follow the grid'],
    dontRules: ['No decorative fonts', 'No gradients'],
  },
};

export const sampleSoulInput: DesignSoulInput = {
  name: 'Test Soul',
  description: 'A test design soul for unit tests',
  layers: sampleLayers,
};

/**
 * Generates a valid A4 print-format page HTML at 1240×1754 with all
 * structural requirements. Passes Stage 1 and Stage 2 checks when
 * validated against the print_a4_portrait geometry.
 */
export function makeValidPrintA4Html(content: string = 'Page content'): string {
  return `<!DOCTYPE html>
<html lang="en" data-pengui-medium="print">
<head>
  <meta charset="UTF-8">
  <style>
    :root {
      --color-canvas: #ffffff;
      --color-text-primary: #212529;
      --font-body: 'Inter', sans-serif;
      --text-body: 18px;
      --space-safe-area: 96px;
      --weight-normal: 400;
      --line-height-body: 1.6;
      --letter-spacing-body: 0em;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    .slide {
      width: 1240px;
      height: 1754px;
      padding: var(--space-safe-area);
      background: var(--color-canvas);
      color: var(--color-text-primary);
      font-family: var(--font-body);
      font-size: var(--text-body);
      position: relative;
    }
  </style>
</head>
<body>
  <!-- @slide-meta {"title":"Print Test","type":"content"} -->
  <div class="slide">
    <p>${content}</p>
  </div>
</body>
</html>`;
}

/**
 * Generates a valid slide HTML with all structural requirements.
 */
export function makeValidSlideHtml(content: string = 'Hello World'): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    :root {
      --color-canvas: #ffffff;
      --color-text-primary: #212529;
      --font-body: 'Inter', sans-serif;
      --text-body: 18px;
      --space-safe-area: 48px;
      --weight-normal: 400;
      --line-height-body: 1.6;
      --letter-spacing-body: 0em;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    .slide {
      width: 1920px;
      height: 1080px;
      padding: var(--space-safe-area);
      background: var(--color-canvas);
      color: var(--color-text-primary);
      font-family: var(--font-body);
      font-size: var(--text-body);
      position: relative;
    }
  </style>
</head>
<body>
  <!-- @slide-meta {"title":"Test","type":"content"} -->
  <div class="slide">
    <p>${content}</p>
  </div>
</body>
</html>`;
}
