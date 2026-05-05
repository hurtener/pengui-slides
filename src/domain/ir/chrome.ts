/**
 * DeckChrome — deck-level header/footer regions that render persistently
 * across every slide (modulo per-slide override). The single biggest
 * visual lever in the v4.x roadmap toward design-team-quality output.
 *
 * Reference: design-team decks like Galici / Clear Tech proposals carry
 * dual-logo chrome (left brand + right partner brand) on every slide,
 * with section badges and page numbers reinforcing the deck identity.
 * v4.14 covers logo + text + page_number slot kinds; section badges
 * (auto-derived from the nearest preceding section_divider) land in
 * v4.14.1 once the deck-context walker exists.
 *
 * Render decision happens at compile time:
 *   - SlideIR.chrome_override === 'hide'     → no chrome
 *   - DeckChrome undefined                   → no chrome
 *   - DeckChrome.showOnCover === false AND
 *     slide.position === 0                   → no chrome (deck-service)
 *   - else                                   → header + footer wrappers
 *
 * Chrome shapes are rendered into the slide HTML directly. PPTX
 * slide-master mapping (so chrome shapes don't duplicate per slide) is
 * a v4.14.1 optimization — works correctly today, just costs file size.
 */

import * as z from 'zod';
import { RichTextSchema } from './rich-text.js';

/** Logo size, mapped to a token-driven px height in the chrome CSS.
 *  Defaults to `md` (32px) which is the Galici-style brand height. */
export const ChromeLogoHeightSchema = z.enum(['sm', 'md', 'lg']);
export type ChromeLogoHeight = z.infer<typeof ChromeLogoHeightSchema>;

/** Page-number rendering format. `'1 / N'` is the default — ergonomic
 *  for navigation in printed proposals. */
export const ChromePageNumberFormatSchema = z.enum(['1', '1/N', '01']);
export type ChromePageNumberFormat = z.infer<typeof ChromePageNumberFormatSchema>;

export const ChromeSlotSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('logo'),
      asset_id: z.string().min(1),
      height: ChromeLogoHeightSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('text'),
      content: RichTextSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('page_number'),
      format: ChromePageNumberFormatSchema.optional(),
    })
    .strict(),
]);
export type ChromeSlot = z.infer<typeof ChromeSlotSchema>;

/** A horizontal region of chrome with up to three slots — the ergonomic
 *  default for header/footer bars. Mirrors the CSS Grid model
 *  (`1fr auto 1fr`) so left/right anchor to edges and center balances. */
export const ChromeRegionSchema = z
  .object({
    left: ChromeSlotSchema.optional(),
    center: ChromeSlotSchema.optional(),
    right: ChromeSlotSchema.optional(),
  })
  .strict();
export type ChromeRegion = z.infer<typeof ChromeRegionSchema>;

export const DeckChromeSchema = z
  .object({
    header: ChromeRegionSchema.optional(),
    footer: ChromeRegionSchema.optional(),
    /** Whether the cover slide (position 0) inherits deck chrome.
     *  Default false — covers usually want a clean canvas. */
    showOnCover: z.boolean().optional(),
  })
  .strict();
export type DeckChrome = z.infer<typeof DeckChromeSchema>;

/** Per-slide override authored alongside SlideIR. `'hide'` suppresses
 *  chrome on this slide regardless of deck setting; `'inherit'` (or
 *  omitted) defers to the deck-level decision. */
export const ChromeOverrideSchema = z.enum(['inherit', 'hide']);
export type ChromeOverride = z.infer<typeof ChromeOverrideSchema>;
