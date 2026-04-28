/**
 * SlideIR — Pengui v4.5 intermediate representation.
 *
 * Public surface:
 *   - schemas (Zod) for runtime validation + JSON Schema export
 *   - inferred types for compile-time use across services and tools
 *   - small helpers (rt, richTextToPlain) for programmatic construction
 *
 * The compiler that turns IR → HTML lives in the `rendering/` module.
 * Validation that goes beyond Zod parse (semantic checks like "callout
 * body cannot be empty") lives in the `validation/` module.
 */

export {
  TextRunSchema,
  RichTextSchema,
  TextColorSchema,
  rt,
  richTextToPlain,
  type TextRun,
  type RichText,
  type TextColor,
} from './rich-text.js';

export {
  ColorRoleSchema,
  TextColorRoleSchema,
  HeroNodeSchema,
  ProseNodeSchema,
  ImageNodeSchema,
  CalloutNodeSchema,
  HeadingNodeSchema,
  ListNodeSchema,
  DividerNodeSchema,
  QuoteNodeSchema,
  TableNodeSchema,
  LeafSlideNodeSchema,
  TwoColumnNodeSchema,
  GridNodeSchema,
  TocNodeSchema,
  SectionDividerNodeSchema,
  BibliographyNodeSchema,
  PageBreakNodeSchema,
  SlideNodeSchema,
  SLIDE_NODE_TYPES,
  SLIDE_ONLY_NODE_TYPES,
  DOC_ONLY_NODE_TYPES,
  type ColorRole,
  type TextColorRole,
  type HeroNode,
  type ProseNode,
  type ImageNode,
  type CalloutNode,
  type HeadingNode,
  type ListNode,
  type DividerNode,
  type QuoteNode,
  type TableNode,
  type LeafSlideNode,
  type TwoColumnNode,
  type GridNode,
  type TocNode,
  type SectionDividerNode,
  type BibliographyNode,
  type BibliographyEntry,
  type PageBreakNode,
  type SlideNode,
  type SlideNodeType,
} from './nodes.js';

export {
  SlideLayoutSchema,
  BackgroundRoleSchema,
  SlideIRSchema,
  SectionIRSchema,
  type SlideLayout,
  type BackgroundRole,
  type SlideIR,
  type SectionIR,
} from './slide-ir.js';

export {
  compileSlideIRToHtml,
  compileSectionIRToHtml,
  renderNode,
  renderNodeList,
  renderRichText,
  type CompileSlideIRInput,
  type CompileSectionIRInput,
} from './compile/index.js';

export { replaceNodeAtPath, type IRPath } from './operations/replace-node.js';
export { irPathToString, irPathFromString } from './path-encoding.js';

export {
  lintNodesForMode,
  type AuthoringMode,
  type ModeIssue,
} from './mode-check.js';
