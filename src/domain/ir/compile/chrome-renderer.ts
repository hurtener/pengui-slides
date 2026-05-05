/**
 * Chrome region renderer — emits the persistent header/footer HTML that
 * wraps the slide body when DeckChrome is active.
 *
 * Pure / synchronous / token-only. Asset URIs emit as `asset://UUID`
 * markers (resolved later by `resolveAssetRefs`). Page-number text is
 * computed from the slidePosition + slideCount args passed by the
 * compiler.
 *
 * Render decision lives in the slide-html-compiler — this module assumes
 * the caller has already decided to render chrome and just produces the
 * `<header>` / `<footer>` strings.
 */

import type {
  ChromeRegion,
  ChromeSlot,
  DeckChrome,
} from '../chrome.js';
import { escapeAttr } from './escape.js';
import { renderRichText } from './rich-text-renderer.js';

export interface ChromeRenderContext {
  /** 1-indexed slide position (0-indexed input + 1 for human display). */
  slidePosition: number;
  /** Total slide count for `'1/N'`-style page numbers. */
  slideCount: number;
}

/** Emit the slide-level header HTML. Returns empty string if the deck has
 *  no header region (so callers can concat unconditionally). */
export function renderChromeHeader(
  chrome: DeckChrome,
  ctx: ChromeRenderContext,
): string {
  if (!chrome.header) return '';
  return `<header class="pengui-chrome-header">${renderRegion(chrome.header, ctx)}</header>`;
}

/** Emit the slide-level footer HTML. Returns empty string if the deck has
 *  no footer region. */
export function renderChromeFooter(
  chrome: DeckChrome,
  ctx: ChromeRenderContext,
): string {
  if (!chrome.footer) return '';
  return `<footer class="pengui-chrome-footer">${renderRegion(chrome.footer, ctx)}</footer>`;
}

function renderRegion(region: ChromeRegion, ctx: ChromeRenderContext): string {
  return [
    renderSlotCell('left', region.left, ctx),
    renderSlotCell('center', region.center, ctx),
    renderSlotCell('right', region.right, ctx),
  ].join('');
}

function renderSlotCell(
  position: 'left' | 'center' | 'right',
  slot: ChromeSlot | undefined,
  ctx: ChromeRenderContext,
): string {
  // Always emit the cell — even empty ones — so the grid template
  // (`1fr auto 1fr`) keeps the center column truly centered when
  // left/right are absent. CSS hides empty cells visually but they
  // still occupy their grid track.
  const inner = slot ? renderSlot(slot, ctx) : '';
  return `<div class="pengui-chrome-slot pengui-chrome-slot-${position}">${inner}</div>`;
}

function renderSlot(slot: ChromeSlot, ctx: ChromeRenderContext): string {
  switch (slot.kind) {
    case 'logo': {
      const heightClass = `pengui-chrome-logo-${slot.height ?? 'md'}`;
      return (
        `<img class="pengui-chrome-logo ${heightClass}" ` +
        `src="asset://${escapeAttr(slot.asset_id)}" alt="" />`
      );
    }
    case 'text':
      return `<span class="pengui-chrome-text">${renderRichText(slot.content)}</span>`;
    case 'page_number': {
      const fmt = slot.format ?? '1/N';
      const text = formatPageNumber(fmt, ctx);
      return `<span class="pengui-chrome-page-number">${text}</span>`;
    }
  }
}

function formatPageNumber(
  fmt: '1' | '1/N' | '01',
  ctx: ChromeRenderContext,
): string {
  const n = ctx.slidePosition;
  switch (fmt) {
    case '1':
      return String(n);
    case '01':
      return String(n).padStart(2, '0');
    case '1/N':
      return `${n} / ${ctx.slideCount}`;
  }
}
