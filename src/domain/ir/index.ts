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
  ChartNodeSchema,
  ChartTypeSchema,
  CardNodeSchema,
  ChipNodeSchema,
  IconNameSchema,
  ImageFrameSchema,
  FlowConnectorSchema,
  FlowStepSchema,
  FlowNodeSchema,
  DecorationNodeSchema,
  DecorationAnchorSchema,
  PresetOrnamentNameSchema,
  LeafBlockNodeSchema,
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
  type ChartNode,
  type ChartType,
  type CardNode,
  type ChipNode,
  type IconName,
  type ImageFrame,
  type FlowConnector,
  type FlowStep,
  type FlowNode,
  type DecorationNode,
  type DecorationAnchor,
  type DecorationSource,
  type DecorationPlacement,
  type PresetOrnamentName,
  type LeafBlockNode,
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
  ChromeSlotSchema,
  ChromeRegionSchema,
  DeckChromeSchema,
  ChromeOverrideSchema,
  ChromeLogoHeightSchema,
  ChromePageNumberFormatSchema,
  type ChromeSlot,
  type ChromeRegion,
  type DeckChrome,
  type ChromeOverride,
  type ChromeLogoHeight,
  type ChromePageNumberFormat,
} from './chrome.js';

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
export { insertNodeAtPath } from './operations/insert-node.js';
export { removeNodeAtPath } from './operations/remove-node.js';
export { duplicateNodeAtPath } from './operations/duplicate-node.js';
export { moveNodeAtPath, type MoveResult } from './operations/move-node.js';
export { setNodeFieldAtPath, parseFieldName } from './operations/set-field.js';
export {
  migratePathAfterInsert,
  migratePathAfterRemove,
  migratePathAfterMove,
  migratePathAfterDuplicate,
} from './operations/path-migration.js';
export { irPathToString, irPathFromString } from './path-encoding.js';

export {
  lintNodesForMode,
  type AuthoringMode,
  type ModeIssue,
} from './mode-check.js';

export {
  lintFlowDensity,
  MAX_RECOMMENDED_FLOW_STEPS,
  type FlowDensityWarning,
} from './flow-density.js';
