/**
 * compileSectionIRToHtml — turn a SectionIR into a section fragment.
 *
 * Emitted shape: a single root <section> carrying pengui-section, the
 * kind class, layout / background classes, and an inline <style> block
 * with the per-node pengui-* CSS so previewing a single section out of
 * context still looks right. The IR-rendered nodes follow inside the
 * section element.
 *
 * The fragment is composed into a full document by DocumentComposer at
 * render / export time; that step injects the soul cssTokens at the
 * document root, applies print page-chrome, and resolves asset refs.
 *
 * The @section-meta comment is NOT emitted here. The tool layer owns
 * the SectionMetadata struct and runs embedSectionMeta on the compiled
 * output, exactly as it does today.
 */

import type { SectionIR } from '../slide-ir.js';
import { renderNodeList } from './node-renderers.js';
import { NODE_CSS } from './layout-css.js';

export interface CompileSectionIRInput {
  ir: SectionIR;
  /** The section's "kind" classification, used as a structural class on
   *  the root <section>. Today's section kinds drive Stage 2 layout
   *  decisions (chrome, page-break behavior); v4.5 keeps that wiring. */
  kind: string;
}

export function compileSectionIRToHtml({ ir, kind }: CompileSectionIRInput): string {
  const layout = ir.layout ?? 'default';
  const background = ir.background ?? 'canvas';
  const backgroundClass = `pengui-bg-${background.replace(/_/g, '-')}`;
  const layoutClass = `pengui-section-${layout}`;
  const kindClass = `pengui-${kind}`;

  const body = renderNodeList(ir.body);

  return (
    `<section class="pengui-section ${kindClass} ${layoutClass} ${backgroundClass}">` +
    `<style>${NODE_CSS}</style>` +
    body +
    `</section>`
  );
}
