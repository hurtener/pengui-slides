/**
 * Render a RichText (array of text runs) to escaped inline HTML.
 *
 * v4.7+ stacking: bold / italic / code / strike are independent and
 * compose freely. sup / sub are mutually exclusive at render time —
 * sup wins when both are set. link and color are independent wrappers.
 *
 * Compose order (innermost → outermost):
 *
 *   <span class="pengui-text-{color}">
 *     <a href="...">
 *       <sup> | <sub>
 *         <strong>
 *           <em>
 *             <s>
 *               <code>
 *                 text
 *               </code>
 *             </s>
 *           </em>
 *         </strong>
 *       </sup>
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
  if (run.code) inner = `<code>${inner}</code>`;
  if (run.strike) inner = `<s>${inner}</s>`;
  if (run.italic) inner = `<em>${inner}</em>`;
  if (run.bold) inner = `<strong>${inner}</strong>`;
  // sup / sub are mutually exclusive — sup wins when both are passed.
  if (run.sup) inner = `<sup>${inner}</sup>`;
  else if (run.sub) inner = `<sub>${inner}</sub>`;
  if (run.link) inner = `<a href="${escapeAttr(run.link)}">${inner}</a>`;
  if (run.color) inner = `<span class="pengui-text-${run.color.replace(/_/g, '-')}">${inner}</span>`;
  return inner;
}
