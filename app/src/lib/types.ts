export interface ValidationIssue {
  id: string;
  stage: string;
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
}

export interface ValidationIssueSummary {
  id: string;
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
  stage: string;
}

export type ValidationPresentationStatus =
  | 'clean'
  | 'edited_with_preexisting_issues'
  | 'regression'
  | 'blocking'
  | 'unvalidated';
export type SlideHealth = 'clean' | 'needs_attention' | 'blocked';

export interface ValidationResult {
  passed: boolean;
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  stage2Skipped: boolean;
  validatedAt: string;
}

export interface ValidationDelta {
  introducedIssues: ValidationIssue[];
  resolvedIssues: ValidationIssue[];
  preExistingIssues: ValidationIssue[];
  blockingIssues: ValidationIssue[];
  status: ValidationPresentationStatus;
  summary: string;
}

export interface ValidationPresentation {
  status: ValidationPresentationStatus;
  headline: string;
  blockingCount: number;
  introducedCount: number;
  preExistingCount: number;
  resolvedCount: number;
  topBlockers: ValidationIssueSummary[];
  topPreExisting: ValidationIssueSummary[];
  showTechnicalDetailsAvailable: boolean;
}

export interface SlideMetadata {
  title: string;
  type: string;
  narrative: string;
  keyPoints: string[];
  tags: string[];
}

export interface SlideTranslationIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  selector?: string;
  detail?: string;
}

export interface SlideDocument {
  version: '1';
  sourceRevisionHash: string;
  width: number;
  height: number;
  backgroundColor?: string;
  elements: Array<Record<string, unknown>>;
}

export interface SlideSummary {
  id: string;
  position: number;
  title: string;
  type: string;
  isValid: boolean;
  styleScore?: number;
}

// Format types (Wave 2B addition — mirrors src/types/format.ts on the backend).
export type FormatKind =
  | 'slides_16_9'
  | 'print_a4_portrait'
  | 'print_letter_portrait';

export type FormatMedium = 'slides' | 'print';

export interface DeckSummary {
  id: string;
  soulId: string;
  title: string;
  author: string;
  slideCount: number;
  slides: SlideSummary[];
  revisionCount: number;
  createdAt: string;
  updatedAt: string;
  /** Format of the deck — added in Wave 2 (SPEC §3.3). Absent on legacy decks → treated as slides_16_9. */
  format?: FormatKind;
  /** v4.18 — slide-mode deck chrome (header/footer regions). Absent when the deck has no chrome configured. */
  chrome?: DeckChromeConfig;
}

// ── v4.18 deck-chrome shape (mirrors src/domain/ir/chrome.ts) ───
export type DeckChromeLogoHeight = 'sm' | 'md' | 'lg';
export type DeckChromePageNumberFormat = '1' | '1/N' | '01';
export type DeckChromeSlot =
  | { kind: 'logo'; asset_id: string; height?: DeckChromeLogoHeight }
  | { kind: 'text'; content: unknown }
  | { kind: 'page_number'; format?: DeckChromePageNumberFormat };
export interface DeckChromeRegion {
  left?: DeckChromeSlot;
  center?: DeckChromeSlot;
  right?: DeckChromeSlot;
}
export interface DeckChromeConfig {
  header?: DeckChromeRegion;
  footer?: DeckChromeRegion;
  showOnCover?: boolean;
}

/** Export result from export_pdf / export_pptx / export_html. */
export interface ExportResult {
  file_path: string;
  filename: string;
  file_size_bytes: number;
  slide_count: number;
  mime_type: string;
  resource?: {
    blob?: string; // base64-encoded bytes
    uri?: string;
    mimeType?: string;
  };
}

export interface EditorThumbnail {
  slideId: string;
  position: number;
  title: string;
  type: string;
  imageBase64: string;
  isValid: boolean;
  health: SlideHealth;
  hasNewIssues: boolean;
  blockingCount: number;
  validationPresentation: ValidationPresentation;
  styleScore?: number;
}

export interface EditorSelectedSlide {
  slideId: string;
  position: number;
  html: string;
  sourceKind?: 'legacy_html' | 'document_v1' | 'authored_ir';
  document?: SlideDocument | null;
  translationIssues?: SlideTranslationIssue[];
  editableExportReady?: boolean;
  metadata: SlideMetadata;
  lastValidation: ValidationResult | null;
  validationPresentation: ValidationPresentation;
  validationDelta: ValidationDelta;
  revisionHash: string;
}

export interface EditorState {
  deck: DeckSummary;
  selectedSlide: EditorSelectedSlide;
  thumbnails: EditorThumbnail[];
  selectedPreview: EditorThumbnail;
}

export interface ToolCallResult<TStructured = Record<string, unknown>> {
  isError?: boolean;
  structuredContent?: TStructured;
  content?: Array<{ type: string; text?: string }>;
}

export interface DeckEditorBridge {
  connect(): Promise<void>;
  onToolInput(handler: (args: Record<string, unknown>) => void): () => void;
  onToolResult(handler: (result: ToolCallResult<Record<string, unknown>>) => void): () => void;
  callTool<TStructured>(name: string, args: Record<string, unknown>): Promise<ToolCallResult<TStructured>>;
}
