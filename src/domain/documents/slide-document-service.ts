import type { Logger } from '../../infrastructure/logger.js';
import type { Slide } from '../../types/deck.js';
import type { SlideDocumentCompilationResult } from './html-slide-document-compiler.js';
import type {
  SlideDocument,
  SlideExportDisposition,
  SlideTranslationIssue,
} from '../../types/slide-document.js';
import { HtmlSlideDocumentCompiler } from './html-slide-document-compiler.js';
import { SlideDocumentRenderer } from './slide-document-renderer.js';
import type { AssetService } from '../assets/asset-service.js';

export interface SlideTranslationState {
  sourceKind: Slide['sourceKind'];
  document: SlideDocument | null;
  translationIssues: SlideTranslationIssue[];
}

export class SlideDocumentService {
  private readonly compiler: HtmlSlideDocumentCompiler;
  private readonly renderer = new SlideDocumentRenderer();

  constructor(
    logger: Logger,
    headless: boolean,
    assetService?: AssetService,
  ) {
    this.compiler = new HtmlSlideDocumentCompiler(logger.child('compiler'), headless, assetService);
  }

  async compileSlideHtml(html: string, sourceRevisionHash: string): Promise<SlideDocumentCompilationResult> {
    return this.compiler.compile(html, sourceRevisionHash);
  }

  isDocumentCurrent(slide: Slide): boolean {
    return Boolean(
      slide.sourceKind === 'document_v1'
      && slide.document
      && slide.document.sourceRevisionHash === slide.metadata.revisionHash,
    );
  }

  needsCompilation(slide: Slide): boolean {
    return !this.isDocumentCurrent(slide);
  }

  buildTranslationState(result: SlideDocumentCompilationResult): SlideTranslationState {
    const hasBlockingIssues = result.issues.some((issue) => issue.severity === 'error');
    if (hasBlockingIssues || !result.document) {
      return {
        sourceKind: 'legacy_html',
        document: null,
        translationIssues: result.issues,
      };
    }

    return {
      sourceKind: 'document_v1',
      document: result.document,
      translationIssues: result.issues,
    };
  }

  render(
    document: SlideDocument,
    options?: {
      includeDispositions?: SlideExportDisposition[];
    },
  ): string {
    return this.renderer.render(document, options);
  }
}
