export type SlideSourceKind = 'legacy_html' | 'document_v1' | 'authored_ir';
export type SlideExportDisposition = 'native' | 'background' | 'blocked';

export type TranslationIssueSeverity = 'error' | 'warning';

export interface SlideTranslationIssue {
  code: string;
  message: string;
  severity: TranslationIssueSeverity;
  selector?: string;
  detail?: string;
}

export interface SlideColorFill {
  color?: string;
  transparency?: number;
}

export interface SlideLineStyle {
  color?: string;
  width?: number;
  dash?: 'solid' | 'dashed' | 'dotted';
  transparency?: number;
}

export interface SlideShadowStyle {
  color?: string;
  blur?: number;
  offsetX?: number;
  offsetY?: number;
  opacity?: number;
}

export interface SlideElementStyle {
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  color?: string;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: string;
  borderRadius?: number;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  fontStyle?: string;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  display?: string;
  justifyContent?: string;
  alignItems?: string;
  alignSelf?: string;
  stretchX?: boolean;
  stretchY?: boolean;
  whiteSpace?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  objectFit?: string;
  opacity?: number;
  boxShadow?: string;
  filter?: string;
  backdropFilter?: string;
  mixBlendMode?: string;
  shadow?: SlideShadowStyle;
  fill?: SlideColorFill;
  line?: SlideLineStyle;
}

export interface SlideTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  /** Outbound URL when this run was authored as a link (`<a href>` in HTML,
   *  `link:` flag on a RichText run). Surfaced as a clickable hyperlink in
   *  PPTX export. */
  link?: string;
}

export interface SlideParagraph {
  text: string;
  runs: SlideTextRun[];
  bullet?: {
    type?: 'bullet' | 'number';
    characterCode?: string;
    indent?: number;
    level?: number;
  };
  spaceBefore?: number;
  spaceAfter?: number;
}

export interface SlideTableCell {
  row: number;
  column: number;
  text: string;
  /** When set, supersedes `text` for export — preserves per-run color,
   *  bold, italic, etc. (e.g. a first-column accent-colored label inside
   *  an otherwise-default-styled row). */
  runs?: SlideTextRun[];
  style?: SlideElementStyle;
}

export interface SlideElementBase {
  id: string;
  kind: 'group' | 'text' | 'image' | 'shape' | 'table';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  opacity: number;
  locked: boolean;
  style: SlideElementStyle;
  exportDisposition?: SlideExportDisposition;
  fallbackReason?: string;
  selector?: string;
  domPath?: string;
}

export interface SlideGroupElement extends SlideElementBase {
  kind: 'group';
  children: string[];
}

export interface SlideTextElement extends SlideElementBase {
  kind: 'text';
  text: string;
  paragraphs: SlideParagraph[];
  editId?: string;
}

export interface SlideImageElement extends SlideElementBase {
  kind: 'image';
  src: string;
  alt?: string;
}

export interface SlideShapeElement extends SlideElementBase {
  kind: 'shape';
  shapeType: 'rectangle' | 'roundRectangle' | 'ellipse' | 'line';
}

export interface SlideTableElement extends SlideElementBase {
  kind: 'table';
  rows: number;
  columns: number;
  cells: SlideTableCell[];
}

export type SlideElement =
  | SlideGroupElement
  | SlideTextElement
  | SlideImageElement
  | SlideShapeElement
  | SlideTableElement;

/**
 * Bumped whenever the HTML→SlideDocument compiler changes its output
 * structure (new element kinds, run-collapse rules, shapeType assignments,
 * etc.). Cached documents with a stale `compilerRevision` are recompiled
 * at the next export-time `ensureSlidesReadyForEditableExport` call.
 *
 *  - 1: pre-v4.7 visual-loop fixes
 *  - 2: v4.7 mixed-content text leaves (Fix 1) + table descendants (Fix 2)
 *       + hr→line shape (Fix 3) + run hyperlinks + ol/ul bullet typing
 *  - 3: table cells expose multi-run formatting; captions emitted as text
 *  - 4: table bbox shrunk to inner rows so caption text doesn't overlap
 *  - 5: v4.8 IR catalog widens (grid bimodal layout primitive — each cell's
 *       leaves get their own native shape rect from layout, no special
 *       compiler branch). Mode-specific nodes (toc, section_divider,
 *       bibliography, page_break) don't reach the slide-document path.
 *  - 6: prior baseline for v4.7 visual loop work.
 *  - 7: v4.12 chart node renders to inline SVG (ECharts SSR) with
 *       token-only fills + token-only text sizes; layout assigns its
 *       own native shape rect (image-class) per cell. Chart placeholders
 *       compiled at revision 6 contain only the placeholder body — they
 *       must recompile so the editable PPTX path picks up the rendered
 *       chart bytes.
 *  - 8: v4.13 card node — new `<article class="pengui-card">` element
 *       wrapping inner leaves with optional accent (top-border tint)
 *       and lucide icon glyph. Cached documents at rev 7 don't carry
 *       the new card chrome and would lose accent styling on export
 *       until recompile.
 *  - 9: v4.14 deck chrome — slide HTML now wraps body with
 *       `<header class="pengui-chrome-header">` + `<main
 *       class="pengui-chrome-body">` + `<footer
 *       class="pengui-chrome-footer">` when the deck carries
 *       `Deck.chrome` and the slide does not opt out via
 *       `chrome_override: 'hide'`. Rev-8 cached docs miss the chrome
 *       shapes; recompile is required so the editable PPTX path
 *       materialises chrome objects per slide.
 *  - 10: v4.14.5 hybrid editable export — three additive changes to
 *       the editable-export shape inventory:
 *       (a) data: URI images flow as native `<p:pic>` shapes (chrome
 *           logos no longer disappear into the background fallback);
 *       (b) inline `<svg>` elements (lucide card icons) get serialised
 *           and emitted as native images instead of being lost to the
 *           generic shape walker;
 *       (c) `pengui-card` accent top-border emits as an extra native
 *           rect on top of the card's base shape — preserves the v4.13
 *           colored top-border that the single-value border heuristic
 *           used to drop. Rev-9 cached docs miss all three; recompile
 *           required so editable exports get the new shapes.
 *  - 11: v4.14.6 per-element chart hybrid — chart figures stop marking
 *       themselves exportDisposition:'background' (which used to flip
 *       the WHOLE slide to hybrid_background mode). Instead, the
 *       chart's resolved ECharts SVG is extracted and emitted as a
 *       native image at the SVG's actual bounding rect. Cards / chrome
 *       / icons / text on the same slide as a chart now stay native —
 *       parity with the static PPTX is preserved even on chart slides.
 *       Rev-10 cached docs still carry the chart-as-background marker.
 */
export const CURRENT_COMPILER_REVISION = 11;

export interface SlideDocument {
  version: '1';
  /** See {@link CURRENT_COMPILER_REVISION}. Documents without this field
   *  are treated as revision 1 and force-recompiled on next export. */
  compilerRevision?: number;
  sourceRevisionHash: string;
  width: number;
  height: number;
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundSize?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  elements: SlideElement[];
}
