export type SlideSourceKind = 'legacy_html' | 'document_v1';
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

export interface SlideDocument {
  version: '1';
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
