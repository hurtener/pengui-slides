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

  /**
   * True when the slide already carries a SlideDocument that matches the
   * current revisionHash. The lazy editor-state and editable-export paths
   * use this to decide whether to re-run the HTML→SlideDocument
   * compilation. authored_ir slides do not auto-populate a SlideDocument
   * (the IR is the source of truth); editable export force-compiles them
   * if needed.
   */
  isDocumentCurrent(slide: Slide): boolean {
    return Boolean(
      slide.document
      && slide.document.sourceRevisionHash === slide.metadata.revisionHash
      && (slide.sourceKind === 'document_v1' || slide.sourceKind === 'authored_ir'),
    );
  }

  needsCompilation(slide: Slide): boolean {
    return !this.isDocumentCurrent(slide);
  }

  /**
   * Editor-side gate: should the App lazily compile this slide on read?
   * For authored_ir slides we say no — the IR tree is the canonical
   * representation, the editor doesn't need a SlideDocument view, and
   * compiling on every editor open wastes CPU. Use needsCompilation()
   * for the editable-export path which DOES require a SlideDocument.
   */
  needsEditorCompilation(slide: Slide): boolean {
    if (slide.sourceKind === 'authored_ir') return false;
    return this.needsCompilation(slide);
  }

  /**
   * Build a TranslationState from a compilation result. `currentSourceKind`
   * preserves the slide's prior source-of-truth identity: authored_ir
   * slides keep that identity even after we lazily produce a SlideDocument
   * for editable export, so the App / metadata path knows the IR is still
   * the source of truth.
   */
  buildTranslationState(
    result: SlideDocumentCompilationResult,
    currentSourceKind?: Slide['sourceKind'],
  ): SlideTranslationState {
    const preserveIR = currentSourceKind === 'authored_ir';
    const hasBlockingIssues = result.issues.some((issue) => issue.severity === 'error');
    if (hasBlockingIssues || !result.document) {
      return {
        sourceKind: preserveIR ? 'authored_ir' : 'legacy_html',
        document: null,
        translationIssues: result.issues,
      };
    }

    return {
      sourceKind: preserveIR ? 'authored_ir' : 'document_v1',
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
