export interface ValidationIssue {
  id: string;
  stage: string;
  severity: 'error' | 'warning' | 'info';
  rule: string;
  message: string;
}

export interface ValidationResult {
  passed: boolean;
  issues: ValidationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  stage2Skipped: boolean;
  validatedAt: string;
}

export interface SlideMetadata {
  title: string;
  type: string;
  narrative: string;
  keyPoints: string[];
  tags: string[];
}

export interface SlideSummary {
  id: string;
  position: number;
  title: string;
  type: string;
  isValid: boolean;
  styleScore?: number;
}

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
}

export interface EditorThumbnail {
  slideId: string;
  position: number;
  title: string;
  type: string;
  imageBase64: string;
  isValid: boolean;
  styleScore?: number;
}

export interface EditorSelectedSlide {
  slideId: string;
  position: number;
  html: string;
  metadata: SlideMetadata;
  lastValidation: ValidationResult | null;
  revisionHash: string;
}

export interface EditorState {
  deck: DeckSummary;
  selectedSlide: EditorSelectedSlide;
  thumbnails: EditorThumbnail[];
  selectedPreview: EditorThumbnail;
}

export interface RevisionPayload {
  deck_id: string;
  deck_title: string;
  slide_id: string;
  slide_title: string;
  instruction: string;
  html: string;
  metadata: SlideMetadata;
  validation: ValidationResult | null;
  revision_hash: string;
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
  sendRevisionRequest(payload: RevisionPayload): Promise<void>;
}
