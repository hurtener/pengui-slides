/**
 * SlideIR / SectionIR — top-level container schemas for the v4.5
 * intermediate representation.
 *
 * A SlideIR or SectionIR holds:
 *   - layout — high-level container behavior (default flow, centered,
 *     split). Layout is a hint to the compiler; nodes still own their
 *     own internal structure.
 *   - background — semantic role for the canvas color.
 *   - body — ordered list of SlideNodes that compose the artifact.
 *
 * Slide vs Section difference is intentionally minimal: both wrap the
 * same node grammar, the only divergence is in compilation (page-bound
 * .slide root for slides; flowing <section> root for sections) and
 * in mode-specific layout hints we'll add later (toc, page_break,
 * etc. land in v4.6+).
 */

import * as z from 'zod';
import { SlideNodeSchema } from './nodes.js';
import { ChromeOverrideSchema } from './chrome.js';

export const SlideLayoutSchema = z.enum(['default', 'centered', 'split']);
export type SlideLayout = z.infer<typeof SlideLayoutSchema>;

export const BackgroundRoleSchema = z.enum([
  'canvas',
  'surface',
  'surface_alt',
  'accent',
]);
export type BackgroundRole = z.infer<typeof BackgroundRoleSchema>;

// v4.20 — outer "canvas" wrapper. When set, the body is wrapped in a
// rounded card sitting on top of the slide background. Used by
// architecture diagrams (Consolidated Semantic Layer reference) where
// all the columns sit inside a single white card on a lavender bg.
export const SlideCanvasSchema = z
  .object({
    /** Background color of the canvas card. Hex string (e.g. `'#FFFFFF'`). */
    background: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/u, 'canvas.background must be a 6-digit hex')
      .optional(),
    /** Inner padding (CSS string, e.g. `'40px'`). Default: `var(--space-xl)`. */
    padding: z.string().optional(),
    /** Border radius (CSS string, e.g. `'20px'`). Default: `var(--radius-lg)`. */
    radius: z.string().optional(),
    /** Drop shadow scale. Maps to soul shadow tokens. Default: `none`. */
    shadow: z.enum(['none', 'soft', 'medium', 'elevated']).optional(),
  })
  .strict();
export type SlideCanvas = z.infer<typeof SlideCanvasSchema>;

export const SlideIRSchema = z
  .object({
    layout: SlideLayoutSchema.optional(),
    background: BackgroundRoleSchema.optional(),
    /** v4.19 — explicit CSS color override (e.g. `'#F0EDFF'`) for the
     *  slide canvas. Wins over `background` (semantic role). Used by
     *  architecture diagrams and section dividers that need a tint
     *  outside the soul's role palette. */
    background_color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/u, 'background_color must be a 6-digit hex like #F0EDFF')
      .optional(),
    /** v4.20 — outer canvas card wrapping all body content. */
    canvas: SlideCanvasSchema.optional(),
    body: z.array(SlideNodeSchema),
    /** v4.14: per-slide chrome decision. `'hide'` suppresses deck chrome
     *  on this slide (covers, full-bleed sections); omitted/`'inherit'`
     *  defers to the deck-level setting. */
    chrome_override: ChromeOverrideSchema.optional(),
  })
  .strict();
export type SlideIR = z.infer<typeof SlideIRSchema>;

export const SectionIRSchema = z
  .object({
    layout: SlideLayoutSchema.optional(),
    background: BackgroundRoleSchema.optional(),
    body: z.array(SlideNodeSchema),
  })
  .strict();
export type SectionIR = z.infer<typeof SectionIRSchema>;
