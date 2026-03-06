/**
 * PPTX Exporter for Pengui Slides.
 *
 * Converts rendered slide images into a PowerPoint file using PptxGenJS.
 * Each slide is a full-bleed image with speaker notes from metadata.
 */

// PptxGenJS CJS/ESM interop: Node16 module resolution exposes the module namespace
// rather than the class constructor. Use dynamic import to get the constructor.
type PptxInstance = import('pptxgenjs').default;

async function createPptx(): Promise<PptxInstance> {
  const mod = await import('pptxgenjs');
  const Ctor = mod.default as unknown as new () => PptxInstance;
  return new Ctor();
}
import type { Logger } from '../../infrastructure/logger.js';
import { MetadataExporter } from '../metadata/metadata-exporter.js';
import type { SlideRenderer } from './slide-renderer.js';
import type { Slide } from '../../types/deck.js';
import type {
  ExportPptxOptions,
  ExportResult,
  RenderOptions,
} from '../../types/export.js';
import { DEFAULT_PPTX_OPTIONS } from '../../types/export.js';

// ── Constants ────────────────────────────────────────────────────

/** Standard 16:9 widescreen layout (inches) used by Google Slides / modern PPT */
const WIDE_WIDTH = 13.333;
const WIDE_HEIGHT = 7.5;

const RESOLUTION_MAP: Record<string, { width: number; height: number }> = {
  '1080p': { width: 1920, height: 1080 },
  '4k': { width: 3840, height: 2160 },
};

// ── PPTX Exporter ────────────────────────────────────────────────

export class PptxExporter {
  private readonly metadataExporter = new MetadataExporter();

  constructor(
    private readonly renderer: SlideRenderer,
    private readonly logger: Logger,
  ) {}

  /**
   * Export slides to a PowerPoint (.pptx) buffer.
   */
  async export(
    slides: Slide[],
    deckTitle: string,
    options?: Partial<ExportPptxOptions>,
  ): Promise<ExportResult> {
    const opts: ExportPptxOptions = { ...DEFAULT_PPTX_OPTIONS, ...options };
    const resolution = RESOLUTION_MAP[opts.resolution] ?? RESOLUTION_MAP['1080p'];

    this.logger.info('Starting PPTX export', {
      slideCount: slides.length,
      resolution: opts.resolution,
      imageFormat: opts.imageFormat,
    });

    const pptx = await createPptx();

    // Define widescreen layout
    pptx.defineLayout({ name: 'WIDE', width: WIDE_WIDTH, height: WIDE_HEIGHT });
    pptx.layout = 'WIDE';
    pptx.title = deckTitle;

    // Render options for slide screenshots
    const renderOptions: Partial<RenderOptions> = {
      width: resolution.width,
      height: resolution.height,
      deviceScaleFactor: 1,
      format: opts.imageFormat,
      ...(opts.imageFormat === 'jpeg' ? { quality: opts.jpegQuality } : {}),
    };

    // Render each slide and add to presentation
    for (const slide of slides) {
      const renderResult = await this.renderer.render(
        slide.html,
        slide.id,
        renderOptions,
      );

      const pptxSlide = pptx.addSlide();

      // Full-bleed image covering the entire slide
      const base64Data = renderResult.imageData.toString('base64');
      const mimePrefix = opts.imageFormat === 'jpeg' ? 'image/jpeg' : 'image/png';

      pptxSlide.addImage({
        data: `data:${mimePrefix};base64,${base64Data}`,
        x: 0,
        y: 0,
        w: WIDE_WIDTH,
        h: WIDE_HEIGHT,
      });

      // Add speaker notes from metadata
      const notes = this.buildSpeakerNotes(slide);
      if (notes) {
        pptxSlide.addNotes(notes);
      }
    }

    // Write to Node buffer
    const arrayBuffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
    const data = Buffer.from(arrayBuffer);

    const filename = this.sanitizeFilename(deckTitle) + '.pptx';

    this.logger.info('PPTX export complete', {
      filename,
      slideCount: slides.length,
      bytes: data.length,
    });

    return {
      format: 'pptx',
      data,
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      filename,
      slideCount: slides.length,
      fileSizeBytes: data.length,
      exportedAt: new Date().toISOString(),
    };
  }

  // ── Helpers ──────────────────────────────────────────────────

  /**
   * Build speaker notes from slide metadata in a readable markdown-ish format.
   */
  private buildSpeakerNotes(slide: Slide): string {
    return this.metadataExporter.toMarkdown(slide.metadata);
  }

  /**
   * Sanitize a string for use as a filename.
   */
  private sanitizeFilename(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9\s_-]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 100)
      || 'presentation';
  }
}
