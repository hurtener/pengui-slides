/**
 * compileSectionIRToHtml — turn a SectionIR into a section fragment.
 *
 * Emitted shape: a single root <section> carrying pengui-section, the
 * kind class, and layout / background classes, followed by the IR-rendered
 * nodes inside the section element. NO <style> block is emitted in the
 * fragment — section-structural Stage 1 forbids standalone <style> tags
 * in section fragments because the per-node pengui-* stylesheet is
 * registered exactly once at the document level by DocumentComposer
 * (see buildNodeStylesBlock) and the soul tokens are injected on the
 * same envelope.
 *
 * Single-section previews go through DocumentComposer too, so the node
 * stylesheet still wraps the fragment automatically — there is no need
 * to inline NODE_CSS per section.
 *
 * The @section-meta comment is NOT emitted here. The tool layer owns
 * the SectionMetadata struct and runs embedSectionMeta on the compiled
 * output, exactly as it does today.
 */

import type { SectionIR } from '../slide-ir.js';
import { renderNodeList } from './node-renderers.js';

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
    body +
    `</section>`
  );
}
