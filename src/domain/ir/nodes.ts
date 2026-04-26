/**
 * SlideNode — the discriminated union over the v4.5 IR node types.
 *
 * v4.5 ships 5 types: hero, prose, image, two_column, callout. Each is
 * deliberately narrow; future releases extend the union.
 *
 * Recursion policy (v4.5): two_column.left/right hold LEAF nodes only —
 * no nested two_column. Relaxing this is a v4.6+ decision after we
 * see how agents compose at one level. Keeps the type non-recursive
 * (no z.lazy needed), keeps the editor surface predictable, and avoids
 * pathological deep nesting in narrow viewports.
 *
 * Token references are STRUCTURAL, not literal: a node says
 * `background: 'accent'` (one of the soul's semantic colors), and the
 * compiler emits `var(--color-accent-primary)`. Agents never write hex.
 */

import * as z from 'zod';
import { RichTextSchema } from './rich-text.js';

// ── Token reference enums ─────────────────────────────────────────
//
// IR nodes name colors / spacing / etc. by SEMANTIC role, not by token
// name. The compiler maps semantic role → soul token. This means the
// IR is portable across souls — change the soul, the same IR renders
// in the new visual language.

export const ColorRoleSchema = z.enum([
  'canvas',       // page background
  'surface',      // card / inset background
  'surface_alt',  // alternative inset
  'accent',       // primary accent
  'accent_alt',   // secondary accent
  'accent_warm',  // warm accent
  'success',
  'warning',
  'error',
  'info',
]);
export type ColorRole = z.infer<typeof ColorRoleSchema>;

export const TextColorRoleSchema = z.enum([
  'primary',
  'secondary',
  'tertiary',
  'inverse',
]);
export type TextColorRole = z.infer<typeof TextColorRoleSchema>;

// ── Leaf node schemas ────────────────────────────────────────────

export const HeroNodeSchema = z
  .object({
    type: z.literal('hero'),
    title: RichTextSchema,
    subtitle: RichTextSchema.optional(),
    eyebrow: RichTextSchema.optional(),
    align: z.enum(['left', 'center']).optional(),
  })
  .strict();
export type HeroNode = z.infer<typeof HeroNodeSchema>;

export const ProseNodeSchema = z
  .object({
    type: z.literal('prose'),
    body: RichTextSchema,
    align: z.enum(['left', 'center', 'right']).optional(),
  })
  .strict();
export type ProseNode = z.infer<typeof ProseNodeSchema>;

export const ImageNodeSchema = z
  .object({
    type: z.literal('image'),
    asset_id: z.string().min(1),
    caption: RichTextSchema.optional(),
    /** Accessibility text. Empty string marks the image as decorative.
     *  Falls back to caption text when omitted. */
    alt: z.string().optional(),
    fit: z.enum(['contain', 'cover']).optional(),
  })
  .strict();
export type ImageNode = z.infer<typeof ImageNodeSchema>;

export const CalloutNodeSchema = z
  .object({
    type: z.literal('callout'),
    kind: z.enum(['note', 'warning', 'tip', 'important']),
    // Accept either RichText (preferred — symmetric with HeroNode.title) or
    // a plain string for ergonomic authoring. Strings are normalised to a
    // single-run RichText so downstream code only ever sees the array form.
    title: z
      .preprocess(
        (val) => (typeof val === 'string' ? [{ text: val }] : val),
        RichTextSchema.optional(),
      )
      .optional(),
    body: RichTextSchema,
  })
  .strict();
export type CalloutNode = z.infer<typeof CalloutNodeSchema>;

// Leaf-only union — used inside two_column to prevent recursion.
export const LeafSlideNodeSchema = z.discriminatedUnion('type', [
  HeroNodeSchema,
  ProseNodeSchema,
  ImageNodeSchema,
  CalloutNodeSchema,
]);
export type LeafSlideNode = z.infer<typeof LeafSlideNodeSchema>;

// ── Container nodes ──────────────────────────────────────────────

export const TwoColumnNodeSchema = z
  .object({
    type: z.literal('two_column'),
    ratio: z.enum(['1:1', '1:2', '2:1']).optional(),
    gap: z.enum(['sm', 'md', 'lg']).optional(),
    left: z.array(LeafSlideNodeSchema),
    right: z.array(LeafSlideNodeSchema),
  })
  .strict();
export type TwoColumnNode = z.infer<typeof TwoColumnNodeSchema>;

// ── Top-level union ──────────────────────────────────────────────

export const SlideNodeSchema = z.discriminatedUnion('type', [
  HeroNodeSchema,
  ProseNodeSchema,
  ImageNodeSchema,
  CalloutNodeSchema,
  TwoColumnNodeSchema,
]);
export type SlideNode = z.infer<typeof SlideNodeSchema>;

/** All node type names registered in v4.5. Useful for tests, docs, and
 *  resource enumeration (pengui://schema/slide-ir). */
export const SLIDE_NODE_TYPES = [
  'hero',
  'prose',
  'image',
  'callout',
  'two_column',
] as const;
export type SlideNodeType = (typeof SLIDE_NODE_TYPES)[number];
