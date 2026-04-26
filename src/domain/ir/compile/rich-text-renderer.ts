/**
 * Render a RichText (array of text runs) to escaped inline HTML.
 *
 * v4.5 rule: a run carries at most one formatting flag (bold OR italic
 * OR code). The `link` flag is independent — a run can be both linked
 * and bold (link wraps outside the format tag). Compose order:
 *
 *   <a href="...">
 *     <strong> | <em> | <code>
 *       text
 *     </format>
 *   </a>
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
  return inner;
}
