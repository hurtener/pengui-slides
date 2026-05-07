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
