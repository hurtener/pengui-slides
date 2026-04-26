/**
 * RichText — the inline-text grammar used inside IR nodes that hold
 * agent-authored prose (hero title, prose body, callout body, image
 * caption, etc.).
 *
 * Modeled as an array of text runs: each run is a string with optional
 * inline formatting flags. Compiles to HTML via `<strong>`, `<em>`,
 * `<code>`, `<s>`, `<sup>`, `<sub>`, `<a href>`, and `<span>` wrappers
 * around the text. Empty array is valid and renders as empty content.
 *
 * Stacking (v4.7+): bold / italic / code / strike are INDEPENDENT and
 * compose freely (e.g. `bold + italic + code` renders as
 * `<strong><em><code>...</code></em></strong>`). sup / sub are mutually
 * exclusive at render time — sup wins when both are set.
 *
 * Deliberate non-features:
 *   - No block-level elements inside RichText (no paragraphs, lists,
 *     headings); those are separate IR nodes.
 *   - No underline (anti-pattern in slide design — looks like a link).
 *   - No background highlight (use the `callout` or `quote` node instead).
 *   - No mention/citation/footnote inline forms; those land later as
 *     dedicated runs when the doc-mode features need them.
 *
 * Keep the run shape narrow so the compiler stays simple and the agent
 * has fewer ways to be wrong.
 */

import * as z from 'zod';

/** Semantic text-color roles available to inline runs. Resolved by the
 *  compiler to a soul token (var(--color-*)) at render time. Default
 *  (omitted) inherits the cascade-aware --color-text-default. */
export const TextColorSchema = z.enum([
  'accent',
  'accent_alt',
  'accent_warm',
  'success',
  'warning',
  'error',
  'info',
  'muted',
  'inverse',
]);
export type TextColor = z.infer<typeof TextColorSchema>;

export const TextRunSchema = z
  .object({
    text: z.string(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    code: z.boolean().optional(),
    /** Strikethrough — common in revisions, before/after comparisons,
     *  deprecated terms. Stacks with bold/italic/code/color/link. */
    strike: z.boolean().optional(),
    /** Superscript — footnotes (¹²³), exponents (m²), ordinals (1ˢᵗ).
     *  Mutually exclusive with `sub` at render time (sup wins). */
    sup: z.boolean().optional(),
    /** Subscript — chemical formulas (H₂O), index variables (xᵢ).
     *  Mutually exclusive with `sup`. */
    sub: z.boolean().optional(),
    link: z.string().url().optional(),
    /** Override the inherited text color for this run only. Semantic role
     *  (e.g. "accent" → var(--color-accent-primary)); the agent never
     *  writes hex. Independent flag — composes with everything else. */
    color: TextColorSchema.optional(),
  })
  .strict();

export type TextRun = z.infer<typeof TextRunSchema>;

export const RichTextSchema = z.array(TextRunSchema);
export type RichText = z.infer<typeof RichTextSchema>;

/**
 * Convenience helper for tests / programmatic IR construction.
 * `rt('Hello, ', { text: 'world', bold: true })` → RichText.
 */
export function rt(...runs: Array<string | TextRun>): RichText {
  return runs.map((r) => (typeof r === 'string' ? { text: r } : r));
}

/** Flatten a RichText to plain string (drops formatting). Used for derived
 *  metadata fields like the @slide-meta `title`, where the comment payload
 *  is plain JSON without inline HTML. */
export function richTextToPlain(text: RichText): string {
  return text.map((run) => run.text).join('');
}
