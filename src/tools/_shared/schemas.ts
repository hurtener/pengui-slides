/**
 * Reusable Zod schemas for MCP tool input validation.
 *
 * Provides common ID schemas and comprehensive SoulLayers schemas
 * matching the types defined in types/design-soul.ts.
 */

import * as z from 'zod';

// ── Boolean Param Schema ─────────────────────────────────────────
// Some MCP clients (e.g. pydantic-based) misinterpret boolean JSON Schema
// as string, causing agents to send "true"/"false" strings instead of
// actual booleans. This helper accepts both and coerces strings to booleans.

export const BooleanParamSchema = z
  .preprocess(
    (v) => {
      if (v === 'true') return true;
      if (v === 'false') return false;
      return v;
    },
    z.boolean(),
  )
  .nullish();

// ── Common ID Schemas ────────────────────────────────────────────

export const SoulIdSchema = z.string().uuid().describe('Design Soul identifier');
export const DeckIdSchema = z.string().uuid().describe('Deck identifier');
export const SlideIdSchema = z.string().uuid().describe('Slide identifier');

// ── Status Filter ────────────────────────────────────────────────

export const StatusFilterSchema = z
  .enum(['draft', 'approved', 'archived', 'all'])
  .nullish()
  .describe('Filter by status');

// ── Layer 1: Color Language ──────────────────────────────────────

export const ColorLanguageSchema = z
  .object({
    canvas: z.string().describe('Base canvas background color'),
    surface: z.string().describe('Surface background color'),
    surfaceAlt: z.string().describe('Alternative surface background color'),
    border: z.string().describe('Default border color'),

    textPrimary: z.string().describe('Primary text color'),
    textSecondary: z.string().describe('Secondary text color'),
    textTertiary: z.string().describe('Tertiary text color'),
    textInverse: z.string().describe('Inverse text color (for dark backgrounds)'),

    accentPrimary: z.string().describe('Primary accent color'),
    accentSecondary: z.string().describe('Secondary accent color'),
    accentWarm: z.string().describe('Warm accent color'),

    success: z.string().describe('Semantic success color'),
    warning: z.string().describe('Semantic warning color'),
    error: z.string().describe('Semantic error color'),
    info: z.string().describe('Semantic info color'),
  })
  .describe('Color language layer defining the full color palette');

// ── Layer 2: Typography ──────────────────────────────────────────

export const TypographySchema = z
  .object({
    fontDisplay: z.string().describe('Display/heading font family'),
    fontBody: z.string().describe('Body text font family'),
    fontMono: z.string().describe('Monospace font family'),

    sizeHero: z.number().positive().describe('Hero text size in px'),
    sizeH1: z.number().positive().describe('H1 text size in px'),
    sizeH2: z.number().positive().describe('H2 text size in px'),
    sizeH3: z.number().positive().describe('H3 text size in px'),
    sizeBody: z.number().positive().describe('Body text size in px'),
    sizeLabel: z.number().positive().describe('Label text size in px'),
    sizeCaption: z.number().positive().describe('Caption text size in px'),

    weightNormal: z.number().int().min(100).max(900).describe('Normal font weight'),
    weightMedium: z.number().int().min(100).max(900).describe('Medium font weight'),
    weightBold: z.number().int().min(100).max(900).describe('Bold font weight'),

    lineHeightHeading: z.number().positive().describe('Line height for headings'),
    lineHeightBody: z.number().positive().describe('Line height for body text'),

    letterSpacingHeading: z.string().describe('Letter spacing for headings (e.g. "-0.02em")'),
    letterSpacingBody: z.string().describe('Letter spacing for body text (e.g. "0em")'),
  })
  .describe('Typography layer defining fonts, sizes, weights, and spacing');

// ── Layer 3: Spacing ─────────────────────────────────────────────

export const SpacingSchema = z
  .object({
    baseUnit: z.number().positive().describe('Base spacing unit in px'),
    xs: z.number().nonnegative().describe('Extra-small spacing in px'),
    sm: z.number().nonnegative().describe('Small spacing in px'),
    md: z.number().nonnegative().describe('Medium spacing in px'),
    lg: z.number().nonnegative().describe('Large spacing in px'),
    xl: z.number().nonnegative().describe('Extra-large spacing in px'),
    xxl: z.number().nonnegative().describe('2x extra-large spacing in px'),
    xxxl: z.number().nonnegative().describe('3x extra-large spacing in px'),
    safeAreaInset: z.number().nonnegative().describe('Minimum margin from slide edges (safe area) in px'),
  })
  .describe('Spacing layer defining the spatial scale');

// ── Layer 4: Shape & Radius ──────────────────────────────────────

export const ShapeRadiusSchema = z
  .object({
    none: z.string().describe('No border radius (e.g. "0")'),
    sm: z.string().describe('Small border radius'),
    md: z.string().describe('Medium border radius'),
    lg: z.string().describe('Large border radius'),
    xl: z.string().describe('Extra-large border radius'),
    full: z.string().describe('Full/pill border radius (e.g. "9999px")'),

    buttonRadius: z.string().describe('Border radius for buttons'),
    cardRadius: z.string().describe('Border radius for cards'),
    inputRadius: z.string().describe('Border radius for inputs'),
    badgeRadius: z.string().describe('Border radius for badges'),
  })
  .describe('Shape and radius layer defining border-radius tokens');

// ── Layer 5: Depth & Shadow ──────────────────────────────────────

export const DepthShadowSchema = z
  .object({
    shadowNone: z.string().describe('No shadow value'),
    shadowSoft: z.string().describe('Soft shadow'),
    shadowMedium: z.string().describe('Medium shadow'),
    shadowElevated: z.string().describe('Elevated/strong shadow'),
    shadowInner: z.string().describe('Inner shadow'),

    borderWidth: z.string().describe('Default border width (e.g. "1px")'),
    borderOpacity: z.number().min(0).max(1).describe('Border opacity (0-1)'),
  })
  .describe('Depth and shadow layer defining elevation tokens');

// ── Layer 6: Component Tokens ────────────────────────────────────

export const ComponentTokensSchema = z
  .object({
    cardPadding: z.string().describe('Card padding value'),
    cardShadow: z.string().describe('Card shadow value'),
    cardBorderWidth: z.string().describe('Card border width'),
    buttonPaddingX: z.string().describe('Button horizontal padding'),
    buttonPaddingY: z.string().describe('Button vertical padding'),
    inputPaddingX: z.string().describe('Input horizontal padding'),
    inputPaddingY: z.string().describe('Input vertical padding'),
    inputBorderWidth: z.string().describe('Input border width'),
    badgePaddingX: z.string().describe('Badge horizontal padding'),
    badgePaddingY: z.string().describe('Badge vertical padding'),
  })
  .describe('Component-specific design tokens');

// ── Layer 7: Motion & Tone ───────────────────────────────────────

export const MotionToneSchema = z
  .object({
    durationFast: z.string().describe('Fast animation duration (e.g. "100ms")'),
    durationNormal: z.string().describe('Normal animation duration (e.g. "200ms")'),
    durationSlow: z.string().describe('Slow animation duration (e.g. "400ms")'),
    easingDefault: z.string().describe('Default easing curve'),
    easingEmphasized: z.string().describe('Emphasized easing curve'),

    northStar: z.string().describe('Design voice north-star statement'),
    doRules: z.array(z.string()).describe('List of "do" design rules'),
    dontRules: z.array(z.string()).describe('List of "don\'t" design rules'),
  })
  .describe('Motion and tone layer defining animation and design voice');

// ── Soul Layers Aggregate ────────────────────────────────────────

export const SoulLayersSchema = z
  .object({
    color: ColorLanguageSchema,
    typography: TypographySchema,
    spacing: SpacingSchema,
    shape: ShapeRadiusSchema,
    depth: DepthShadowSchema,
    components: ComponentTokensSchema,
    motion: MotionToneSchema,
  })
  .describe('Complete Design Soul layers defining the visual identity across all seven dimensions');
