/**
 * Dependency injection container.
 *
 * Wires all stores, services, and infrastructure together.
 */

import type { PenguiConfig } from './config.js';
import { Logger, systemClock, type Clock } from './infrastructure/index.js';

// Storage
import { createStorage } from './storage/factory.js';
import type {
  ISoulStore,
  IDeckStore,
  ISlideStore,
  ISectionStore,
  IAssetStore,
  ICommentStore,
} from './storage/interfaces.js';

// Domain services
import { SoulService } from './domain/souls/soul-service.js';
import { DeckService } from './domain/decks/deck-service.js';
import { ValidationService } from './domain/validation/validation-service.js';
import { MetadataParser } from './domain/metadata/metadata-parser.js';
import { MetadataEmbedder } from './domain/metadata/metadata-embedder.js';
import { MetadataExporter } from './domain/metadata/metadata-exporter.js';
import { RenderService } from './domain/rendering/render-service.js';
import { AssetService } from './domain/assets/asset-service.js';
import { CommentService } from './domain/comments/comment-service.js';
import { EditorService } from './domain/editor/editor-service.js';
import { SlideDocumentService, DocumentService } from './domain/documents/index.js';
import { GoogleSlidesExportService } from './domain/export/google-slides-export-service.js';

export interface ServiceContainer {
  config: PenguiConfig;
  logger: Logger;
  clock: Clock;

  // Stores
  soulStore: ISoulStore;
  deckStore: IDeckStore;
  slideStore: ISlideStore;
  sectionStore: ISectionStore;
  assetStore: IAssetStore;
  commentStore: ICommentStore;

  // Services
  soulService: SoulService;
  deckService: DeckService;
  documentService: DocumentService;
  validationService: ValidationService;
  metadataParser: MetadataParser;
  metadataEmbedder: MetadataEmbedder;
  metadataExporter: MetadataExporter;
  renderService: RenderService;
  assetService: AssetService;
  commentService: CommentService;
  slideDocumentService: SlideDocumentService;
  editorService: EditorService;
  googleSlidesExportService: GoogleSlidesExportService;
}

export function createContainer(config: PenguiConfig): ServiceContainer {
  const logger = new Logger('pengui-slides', config.logLevel);
  const clock = systemClock;

  // Storage layer - uses file-based persistence if persistDir is configured
  const { soulStore, deckStore, slideStore, sectionStore, assetStore, commentStore } =
    createStorage(config.persistDir);

  // Domain services
  const soulService = new SoulService(soulStore, slideStore, clock, logger.child('souls'));
  const deckService = new DeckService(
    deckStore,
    slideStore,
    sectionStore,
    soulStore,
    soulService,
    clock,
    logger.child('decks'),
  );
  const documentService = new DocumentService(
    deckStore,
    sectionStore,
    deckService,
    clock,
    logger.child('documents'),
  );
  const validationService = new ValidationService(soulStore, config, logger.child('validation'));
  const metadataParser = new MetadataParser();
  const metadataEmbedder = new MetadataEmbedder();
  const metadataExporter = new MetadataExporter();
  const assetService = new AssetService(assetStore, clock, logger.child('assets'));
  const commentService = new CommentService(
    commentStore,
    deckService,
    clock,
    logger.child('comments'),
  );
  const slideDocumentService = new SlideDocumentService(
    logger.child('documents'),
    config.headless,
    assetService,
  );
  const renderService = new RenderService(
    config,
    logger.child('rendering'),
    assetService,
    soulService,
  );
  const editorService = new EditorService(
    deckService,
    soulService,
    validationService,
    renderService,
    metadataEmbedder,
    slideDocumentService,
    logger.child('editor'),
  );
  const googleSlidesExportService = new GoogleSlidesExportService(
    config,
    logger.child('google-slides-export'),
    renderService,
  );

  return {
    config,
    logger,
    clock,
    soulStore,
    deckStore,
    slideStore,
    sectionStore,
    assetStore,
    commentStore,
    soulService,
    deckService,
    documentService,
    validationService,
    metadataParser,
    metadataEmbedder,
    metadataExporter,
    renderService,
    assetService,
    commentService,
    slideDocumentService,
    editorService,
    googleSlidesExportService,
  };
}
