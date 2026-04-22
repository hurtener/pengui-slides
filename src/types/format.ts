/**
 * Format types for Pengui Slides.
 *
 * A Format defines the output medium (slides or print), the internal
 * pixel geometry that rendering and validation operate against, and
 * metadata used by exporters and the MCP App. See SPEC.md §3.
 */

export type FormatKind =
  | 'slides_16_9'
  | 'print_a4_portrait'
  | 'print_letter_portrait';

export type FormatMedium = 'slides' | 'print';

export type FormatOrientation = 'landscape' | 'portrait';

export type PhysicalPage = 'A4' | 'Letter' | null;

export interface FormatGeometry {
  /** Internal canvas width in pixels (at 1× scale). */
  widthPx: number;
  /** Internal canvas height in pixels. */
  heightPx: number;
  /** Safe-area inset in pixels (uniform on all four sides). */
  safeAreaInsetPx: number;
  /** Target DPI for export. Informational — PDF exporter uses CSS @page size for physical units. */
  dpi: number;
  /** Orientation hint for the MCP App and export metadata. */
  orientation: FormatOrientation;
  /** Medium category — drives exporter availability and recipe library selection. */
  medium: FormatMedium;
  /** Physical page label for print PDFs. null for screen-only formats. */
  physicalPage: PhysicalPage;
  /** Aspect ratio (width / height) used by the MCP App canvas and thumbnail sizing. */
  thumbnailAspect: number;
}

export interface Format {
  kind: FormatKind;
  geometry: FormatGeometry;
}
