/**
 * IR-to-HTML compilation surface.
 *
 * Two entry points:
 *   - compileSlideIRToHtml — slide-mode (full HTML document, page-bound)
 *   - compileSectionIRToHtml — section-mode (fragment, document-composer
 *     handles the page chrome)
 *
 * Both are pure synchronous functions. Asset references emit as
 * `asset://UUID` markers; the existing `resolveAssetRefs` swaps them
 * for data URIs at render boundaries.
 */

export { compileSlideIRToHtml, type CompileSlideIRInput } from './slide-html-compiler.js';
export { compileSectionIRToHtml, type CompileSectionIRInput } from './section-html-compiler.js';
export { renderNode, renderNodeList } from './node-renderers.js';
export { renderRichText } from './rich-text-renderer.js';
export { escapeHtml, escapeAttr } from './escape.js';
export { NODE_CSS, buildSlideRootCss } from './layout-css.js';
