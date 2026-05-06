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
 *  - 12: v4.15 bundled fonts — slide HTML now carries `@font-face` rules
 *       with `data:font/ttf;base64,…` URIs for any bundled family the
 *       soul references (Inter, Inter Display, JetBrains Mono). Two
 *       reasons to bump the revision: (a) the rendered PNG (image
 *       PPTX path) draws text in the bundled font instead of system
 *       Helvetica, so cached HTML at rev 11 would re-render with the
 *       wrong typography; (b) Playwright's text-bbox measurements feed
 *       the SlideDocument shape inventory, and font-substitution shifts
 *       those bounds — recompiling re-measures with the bundled font.
 *  - 13: v4.16 decoration & assets — three additive changes to the
 *       SlideDocument inventory:
 *       (a) New top-level `decoration` IR node — emits an absolutely-
 *           positioned `<aside class="pengui-decoration">` wrapping
 *           either an `<img>` (asset_ref) or inline `<svg>` (preset
 *           ornament). The walker's existing IMG/SVG branches pick
 *           these up natively; v4.16 adds a zIndex override based on
 *           layer (background → -50, foreground → 10000) so explicit
 *           layering survives the editable PPTX shape ordering.
 *       (b) `image.frame: 'browser'|'phone'|'desktop'|'laptop'` — frame
 *           chrome wraps the asset in an HTML shell whose titlebar,
 *           traffic-light dots, bezel, etc. emit as native shapes via
 *           the generic background/border walker. Rev-12 cached docs
 *           don't carry frame chrome shapes; recompile materialises
 *           them.
 *       (c) Bleed support — decorations with `placement.anchor:
 *           'bleed_*'` produce shape rects with negative `x`/`y`
 *           coordinates (PowerPoint accepts negative `<a:off>` for
 *           partial-shape placement). The slide root opts into
 *           `overflow: visible` via `:has(.pengui-decoration-bleed)`
 *           so the rasterised PNG (image PPTX) doesn't clip the bleed
 *           shape either.
 *  - 14: v4.17 flow & connectors — new top-level `flow` IR node that
 *       emits an `<ol class="pengui-flow">` of step pills + connector
 *       glyphs. Step pills mirror the v4.13 card pattern (1px border +
 *       3px accent top-border) and ship as native `<p:sp>` rectangles
 *       via the generic shape walker. Connector glyphs are inline
 *       lucide-style SVGs (arrow / arrow_dashed / cycle / plus) that
 *       flow through the v4.14.5 inline-SVG-as-image branch and ship
 *       as native `<p:pic>` shapes. Step icons use the same v4.13 path.
 *       Cached docs at rev 13 were compiled before the flow node
 *       existed; recompile materialises every step pill + icon +
 *       badge + connector glyph.
 *  - 15: v4.18.1 per-node visual snapshots — composite-visual nodes
 *       (.pengui-card, .pengui-decoration, .pengui-flow-step,
 *       .pengui-flow-connector, .pengui-frame) now emit a single
 *       PNG screenshot of their rendered bbox PLUS native text shapes
 *       for any text-leaf descendants positioned on top. Replaces the
 *       v4.13–v4.17 approach of trying to reproduce every sub-shape
 *       (border-radius, accent stripe, icon, gradient, connector
 *       glyph) natively, which was losing fidelity on radial
 *       gradients, glow effects, lucide icon details, and connector
 *       arrows. Layering: snapshot at the candidate's walk-order
 *       zIndex (decoration overrides to -50 / 10000 by layer); text
 *       leaves walk normally and emit at higher zIndex via DOM order,
 *       so heading/body/eyebrow paint above the snapshot. Result: each
 *       card / decoration / flow step is one repositionable image with
 *       editable text overlays — best of both worlds. Rev-14 docs are
 *       missing the snapshots.
 */
export const CURRENT_COMPILER_REVISION = 15;

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
