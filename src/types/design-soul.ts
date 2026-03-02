/**
 * Design Soul types for Pengui Slides.
 *
 * A Design Soul defines the complete visual identity of a presentation
 * across seven layers: color, typography, spacing, shape, depth,
 * components, and motion/tone.
 */

import type { SoulId, SlideId, TemplateId, ISOTimestamp } from './common.js';

// ── Soul Status ───────────────────────────────────────────────────

export type SoulStatus = 'draft' | 'approved' | 'archived';

// ── Layer 1: Color Language ───────────────────────────────────────

export interface ColorLanguage {
  // Base neutrals
  canvas: string;
  surface: string;
  surfaceAlt: string;
  border: string;

  // Text colors
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textInverse: string;

  // Accent system
  accentPrimary: string;
  accentSecondary: string;
  accentWarm: string;

  // Semantic
  success: string;
  warning: string;
  error: string;
  info: string;
}

// ── Layer 2: Typography ───────────────────────────────────────────

export interface Typography {
  fontDisplay: string;
  fontBody: string;
  fontMono: string;

  // Size scale (px)
  sizeHero: number;
  sizeH1: number;
  sizeH2: number;
  sizeH3: number;
  sizeBody: number;
  sizeLabel: number;
  sizeCaption: number;

  // Weights
  weightNormal: number;
  weightMedium: number;
  weightBold: number;

  // Line heights
  lineHeightHeading: number;
  lineHeightBody: number;

  // Letter spacing
  letterSpacingHeading: string;
  letterSpacingBody: string;
}

// ── Layer 3: Spacing ──────────────────────────────────────────────

export interface Spacing {
  baseUnit: number;
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  xxxl: number;

  /** Minimum margin from slide edges (safe area) */
  safeAreaInset: number;
}

// ── Layer 4: Shape & Radius ───────────────────────────────────────

export interface ShapeRadius {
  none: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  full: string;

  // Component-specific
  buttonRadius: string;
  cardRadius: string;
  inputRadius: string;
  badgeRadius: string;
}

// ── Layer 5: Depth & Shadow ───────────────────────────────────────

export interface DepthShadow {
  shadowNone: string;
  shadowSoft: string;
  shadowMedium: string;
  shadowElevated: string;
  shadowInner: string;

  // Border style
  borderWidth: string;
  borderOpacity: number;
}

// ── Layer 6: Component Tokens ─────────────────────────────────────

export interface ComponentTokens {
  cardPadding: string;
  cardShadow: string;
  cardBorderWidth: string;
  buttonPaddingX: string;
  buttonPaddingY: string;
  inputPaddingX: string;
  inputPaddingY: string;
  inputBorderWidth: string;
  badgePaddingX: string;
  badgePaddingY: string;
}

// ── Layer 7: Motion & Tone ────────────────────────────────────────

export interface MotionTone {
  durationFast: string;
  durationNormal: string;
  durationSlow: string;
  easingDefault: string;
  easingEmphasized: string;

  // Design voice
  northStar: string;
  doRules: string[];
  dontRules: string[];
}

// ── Soul Layers Aggregate ─────────────────────────────────────────

export interface SoulLayers {
  color: ColorLanguage;
  typography: Typography;
  spacing: Spacing;
  shape: ShapeRadius;
  depth: DepthShadow;
  components: ComponentTokens;
  motion: MotionTone;
}

// ── Design Soul Entity ────────────────────────────────────────────

export interface DesignSoul {
  id: SoulId;
  name: string;
  description: string;
  status: SoulStatus;
  layers: SoulLayers;

  /** Generated CSS custom properties string */
  cssTokens: string;

  /** List of all CSS custom property names in this soul */
  tokenNames: string[];

  /** Allowed font families (extracted from typography layer) */
  allowedFonts: string[];

  /** Generated CSS utility class library */
  utilityCss: string;

  /** Generated style guide for LLM consumption */
  styleGuide: string;

  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
  approvedAt?: ISOTimestamp;
}

// ── Layout Recipes ────────────────────────────────────────────────

export type RecipeSource = 'built-in' | 'user-saved';

export interface LayoutRecipe {
  id: TemplateId;
  soulId: SoulId;
  type: string;
  name: string;
  description: string;
  tags: string[];
  source: RecipeSource;
  html: string;
  createdAt: ISOTimestamp;
  savedFromSlideId?: SlideId;
}

// ── Backward-compat aliases (deprecated) ─────────────────────────

/** @deprecated Use `string` (extensible) instead */
export type SkeletonTemplateType =
  | 'title-slide'
  | 'two-column'
  | 'metrics'
  | 'features-grid'
  | 'closing-cta'
  | 'blank-themed';

/** @deprecated Use `LayoutRecipe` instead */
export type SkeletonTemplate = LayoutRecipe;

// ── Input types for registration ──────────────────────────────────

export interface DesignSoulInput {
  name: string;
  description: string;
  layers: SoulLayers;
}
