/**
 * RichText — the inline-text grammar used inside IR nodes that hold
 * agent-authored prose (hero title, prose body, callout body, image
 * caption, etc.).
 *
 * Modeled as an array of text runs: each run is a string with optional
 * inline formatting flags. Compiles to HTML via `<strong>`, `<em>`,
 * `<code>`, and `<a href>` wrappers around span text. Empty array is
 * valid and renders as empty content.
 *
 * Deliberate non-features in v4.5:
 *   - No nested formatting (a run is bold OR italic OR code; a run that
 *     needs both can be split or — later — extended to allow stacking).
 *   - No block-level elements inside RichText (no paragraphs, lists,
 *     headings); those are separate IR nodes.
 *   - No mention/citation/footnote inline forms; those land later as
 *     dedicated runs when the doc-mode features need them.
 *
 * Keep the run shape narrow so the compiler stays simple and the agent
 * has fewer ways to be wrong.
 */

import * as z from 'zod';

export const TextRunSchema = z
  .object({
    text: z.string(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    code: z.boolean().optional(),
    link: z.string().url().optional(),
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
