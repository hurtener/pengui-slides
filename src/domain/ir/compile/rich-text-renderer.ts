/**
 * Render a RichText (array of text runs) to escaped inline HTML.
 *
 * Run grammar: a run carries at most one formatting flag (bold OR italic
 * OR code). The `link` flag is independent — a run can be both linked
 * and bold (link wraps outside the format tag). The `color` flag is
 * also independent and wraps the entire run in a span.pengui-text-{color}
 * — see layout-css.ts for the color → soul-token mapping. Compose order:
 *
 *   <span class="pengui-text-{color}">
 *     <a href="...">
 *       <strong> | <em> | <code>
 *         text
 *       </format>
 *     </a>
 *   </span>
 *
 * Empty input returns empty string. Plain string content is HTML-escaped.
 */

import type { RichText } from '../rich-text.js';
import { escapeHtml, escapeAttr } from './escape.js';

export function renderRichText(text: RichText): string {
  return text.map(renderRun).join('');
}

function renderRun(run: RichText[number]): string {
  let inner = escapeHtml(run.text);
  if (run.bold) inner = `<strong>${inner}</strong>`;
  else if (run.italic) inner = `<em>${inner}</em>`;
  else if (run.code) inner = `<code>${inner}</code>`;
  if (run.link) inner = `<a href="${escapeAttr(run.link)}">${inner}</a>`;
  if (run.color) inner = `<span class="pengui-text-${run.color.replace(/_/g, '-')}">${inner}</span>`;
  return inner;
}
