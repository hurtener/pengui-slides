/**
 * Design Soul types for Pengui Slides.
 *
 * A Design Soul defines the complete visual identity of a presentation
 * across seven layers: color, typography, spacing, shape, depth,
 * components, and motion/tone.
 */

import type { SoulId, SlideId, TemplateId, ISOTimestamp } from './common.js';
import type { FormatMedium } from './format.js';

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
  /**
   * Human-readable handle derived from `name`. Stable once assigned
   * (renaming the soul does not change the slug). Absent on pre-v4 records;
   * services backfill lazily on first access. Writes always include it.
   */
  slug?: string;
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
  /**
   * Output medium this recipe targets.
   *
   * - `'slides'` — 16:9 slide canvas (1920×1080). Default for all recipes
   *   generated before v2.0 (backward-compat: missing field treated as `'slides'`).
   * - `'print'` — A4/Letter portrait page (1240×1754 or 1275×1650).
   *
   * Choice: added as a field on LayoutRecipe (not a separate `printRecipes`
   * sibling on the soul) so that a single `getRecipes(soulId)` call returns
   * both mediums and consumers can filter by `r.medium`. This keeps the store
   * interface, soul-service, and approval flow the simplest — one save, one
   * retrieve, one type.
   */
  medium: FormatMedium;
  html: string;
  /**
   * v4.6: the SlideIR tree the agent can pass to `add_slide` /
   * `apply_recipe` to instantiate this recipe. Present on user-saved
   * recipes captured from IR-authored slides and on any built-in recipe
   * authored as IR. Absent on built-in HTML-only recipes that pre-date
   * v4.6 — those remain visual references only.
   *
   * Stored as `unknown` here to avoid a circular type import; consumers
   * that need typed access cast through `SlideIR` from `domain/ir`.
   */
  ir?: unknown;
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
