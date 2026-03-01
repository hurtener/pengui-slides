/**
 * Export and rendering types for Pengui Slides.
 */

export type ExportFormat = 'pptx' | 'pdf' | 'html';
export type ImageFormat = 'png' | 'jpeg';
export type PdfMode = 'image' | 'direct';

// ── Render Options ────────────────────────────────────────────────

export interface RenderOptions {
  width: number;
  height: number;
  deviceScaleFactor: number;
  format: ImageFormat;
  quality?: number;
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  width: 1920,
  height: 1080,
  deviceScaleFactor: 1,
  format: 'png',
};

export interface PreviewOptions {
  width: number;
  height: number;
  format: ImageFormat;
  quality?: number;
}

export const DEFAULT_PREVIEW_OPTIONS: PreviewOptions = {
  width: 480,
  height: 270,
  format: 'png',
};

// ── Render Result ─────────────────────────────────────────────────

export interface SlideRenderResult {
  slideId: string;
  imageData: Buffer;
  format: ImageFormat;
  width: number;
  height: number;
  renderTimeMs: number;
}

export interface PreviewResult {
  slideId: string;
  position: number;
  imageBase64: string;
  format: ImageFormat;
  width: number;
  height: number;
}

// ── Export Options ─────────────────────────────────────────────────

export interface ExportPptxOptions {
  resolution: '1080p' | '4k';
  imageFormat: ImageFormat;
  jpegQuality: number;
}

export const DEFAULT_PPTX_OPTIONS: ExportPptxOptions = {
  resolution: '1080p',
  imageFormat: 'png',
  jpegQuality: 90,
};

export interface ExportPdfOptions {
  mode: PdfMode;
}

export interface ExportHtmlOptions {
  includeNavigation: boolean;
}

// ── Export Result ──────────────────────────────────────────────────

export interface ExportResult {
  format: ExportFormat;
  data: Buffer;
  mimeType: string;
  filename: string;
  slideCount: number;
  fileSizeBytes: number;
  exportedAt: string;
}
