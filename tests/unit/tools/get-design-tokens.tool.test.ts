import { describe, it, expect } from 'vitest';

// Internal helper exposed via the module — re-imported via the registered
// tool's parser. We re-export the parser here for unit-test isolation.
// (The tool registers a handler; the regex+classifier logic is the unit
// worth testing without spinning up a server.)
import { generateTokens } from '../../../src/domain/souls/token-generator.js';

const SOUL_LAYERS = {
  color: {
    canvas: '#ffffff', surface: '#f8f9fa', surfaceAlt: '#e9ecef', border: '#dee2e6',
    textPrimary: '#212529', textSecondary: '#495057', textTertiary: '#868e96', textInverse: '#ffffff',
    accentPrimary: '#228be6', accentSecondary: '#15aabf', accentWarm: '#fd7e14',
    success: '#40c057', warning: '#fab005', error: '#fa5252', info: '#228be6',
  },
  typography: {
    fontDisplay: "'Inter', sans-serif", fontBody: "'Inter', sans-serif", fontMono: "'JetBrains Mono', monospace",
    sizeHero: 72, sizeH1: 48, sizeH2: 36, sizeH3: 28, sizeBody: 18, sizeLabel: 14, sizeCaption: 12,
    weightNormal: 400, weightMedium: 500, weightBold: 700,
    lineHeightHeading: 1.2, lineHeightBody: 1.6,
    letterSpacingHeading: '-0.02em', letterSpacingBody: '0em',
  },
  spacing: { baseUnit: 8, xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48, xxxl: 64, safeAreaInset: 48 },
  shape: {
    none: '0', sm: '4px', md: '8px', lg: '12px', xl: '16px', full: '9999px',
    buttonRadius: '8px', cardRadius: '12px', inputRadius: '6px', badgeRadius: '9999px',
  },
  depth: {
    shadowNone: 'none', shadowSoft: '0 1px 3px rgba(0,0,0,0.08)', shadowMedium: '0 4px 12px rgba(0,0,0,0.12)',
    shadowElevated: '0 8px 24px rgba(0,0,0,0.16)', shadowInner: 'inset 0 2px 4px rgba(0,0,0,0.06)',
    borderWidth: '1px', borderOpacity: 0.1,
  },
  components: {
    cardPadding: '24px', cardShadow: '0 1px 3px rgba(0,0,0,0.08)', cardBorderWidth: '1px',
    buttonPaddingX: '20px', buttonPaddingY: '10px',
    inputPaddingX: '12px', inputPaddingY: '8px', inputBorderWidth: '1px',
    badgePaddingX: '8px', badgePaddingY: '2px',
  },
  motion: {
    durationFast: '100ms', durationNormal: '200ms', durationSlow: '400ms',
    easingDefault: 'cubic-bezier(0.4, 0, 0.2, 1)', easingEmphasized: 'cubic-bezier(0.2, 0, 0, 1)',
    northStar: 'Clean', doRules: ['Use consistent spacing'], dontRules: ['No gradients'],
  },
};

// We test the parser+classifier helpers via a local re-implementation that
// mirrors get-design-tokens.tool.ts. The actual tool's behavior is exercised
// in the e2e driver; here we lock the contract on layer classification.

type TokenLayer =
  | 'color' | 'category' | 'typography' | 'spacing' | 'shape'
  | 'depth' | 'components' | 'motion' | 'other';

function classifyLayer(stem: string): TokenLayer {
  if (stem.startsWith('color-category-')) return 'category';
  if (stem.startsWith('color-')) return 'color';
  if (
    stem.startsWith('font-') || stem.startsWith('text-') || stem.startsWith('weight-') ||
    stem.startsWith('line-height-') || stem.startsWith('letter-spacing-') || stem.startsWith('leading-')
  ) return 'typography';
  if (stem.startsWith('space-')) return 'spacing';
  if (stem.startsWith('radius-')) return 'shape';
  if (stem.startsWith('shadow-') || stem.startsWith('border-')) return 'depth';
  if (stem.startsWith('card-') || stem.startsWith('button-') || stem.startsWith('input-') || stem.startsWith('badge-')) return 'components';
  if (stem.startsWith('duration-') || stem.startsWith('easing-')) return 'motion';
  return 'other';
}

function parseRoot(css: string): Array<{ name: string; value: string; layer: TokenLayer }> {
  const rootMatch = css.match(/:root\s*\{([\s\S]*?)\}/);
  const block = rootMatch ? rootMatch[1] : css;
  const out: Array<{ name: string; value: string; layer: TokenLayer }> = [];
  const re = /--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    out.push({ name: `--${m[1]}`, value: m[2].trim(), layer: classifyLayer(m[1]) });
  }
  return out;
}

describe('get_design_tokens — parser + layer classifier', () => {
  const generated = generateTokens(SOUL_LAYERS);
  const parsed = parseRoot(generated.cssString);

  it('parses every token name from the :root block', () => {
    expect(parsed.length).toBe(generated.tokenNames.length);
  });

  it('skips the print-mode override block (does not double-list tokens)', () => {
    // print block adds --space-safe-area override; ensure it's not duplicated
    const safeArea = parsed.filter((t) => t.name === '--space-safe-area');
    expect(safeArea.length).toBe(1);
  });

  it('classifies color tokens correctly', () => {
    const accent = parsed.find((t) => t.name === '--color-accent-primary');
    expect(accent?.layer).toBe('color');
    expect(accent?.value).toBe('#228be6');
  });

  it('classifies derived category tokens distinctly from base color tokens', () => {
    const cat = parsed.find((t) => t.name === '--color-category-a');
    expect(cat?.layer).toBe('category');
  });

  it('classifies typography tokens', () => {
    expect(parsed.find((t) => t.name === '--font-display')?.layer).toBe('typography');
    expect(parsed.find((t) => t.name === '--text-h1')?.layer).toBe('typography');
    expect(parsed.find((t) => t.name === '--weight-bold')?.layer).toBe('typography');
    expect(parsed.find((t) => t.name === '--letter-spacing-heading')?.layer).toBe('typography');
  });

  it('classifies spacing and shape tokens', () => {
    expect(parsed.find((t) => t.name === '--space-md')?.layer).toBe('spacing');
    expect(parsed.find((t) => t.name === '--space-md')?.value).toBe('16px');
    expect(parsed.find((t) => t.name === '--radius-md')?.layer).toBe('shape');
    expect(parsed.find((t) => t.name === '--radius-md')?.value).toBe('8px');
  });

  it('classifies depth and component tokens', () => {
    expect(parsed.find((t) => t.name === '--shadow-soft')?.layer).toBe('depth');
    expect(parsed.find((t) => t.name === '--border-width')?.layer).toBe('depth');
    expect(parsed.find((t) => t.name === '--card-padding')?.layer).toBe('components');
    expect(parsed.find((t) => t.name === '--button-padding-x')?.layer).toBe('components');
  });

  it('classifies motion tokens', () => {
    expect(parsed.find((t) => t.name === '--duration-fast')?.layer).toBe('motion');
    expect(parsed.find((t) => t.name === '--easing-default')?.layer).toBe('motion');
  });

  it('every token has a non-empty value', () => {
    for (const t of parsed) {
      expect(t.value.length).toBeGreaterThan(0);
    }
  });
});
