/**
 * Dependency injection container.
 *
 * Wires all stores, services, and infrastructure together.
 */

import type { PenguiConfig } from './config.js';
import { Logger, systemClock, type Clock } from './infrastructure/index.js';

// Storage
import { createStorage } from './storage/factory.js';
import type { ISoulStore, IDeckStore, ISlideStore, IAssetStore } from './storage/interfaces.js';

// Domain services
import { SoulService } from './domain/souls/soul-service.js';
import { DeckService } from './domain/decks/deck-service.js';
import { ValidationService } from './domain/validation/validation-service.js';
import { MetadataParser } from './domain/metadata/metadata-parser.js';
import { MetadataEmbedder } from './domain/metadata/metadata-embedder.js';
import { MetadataExporter } from './domain/metadata/metadata-exporter.js';
import { RenderService } from './domain/rendering/render-service.js';
import { AssetService } from './domain/assets/asset-service.js';

export interface ServiceContainer {
  config: PenguiConfig;
  logger: Logger;
  clock: Clock;

  // Stores
  soulStore: ISoulStore;
  deckStore: IDeckStore;
  slideStore: ISlideStore;
  assetStore: IAssetStore;

  // Services
  soulService: SoulService;
  deckService: DeckService;
  validationService: ValidationService;
  metadataParser: MetadataParser;
  metadataEmbedder: MetadataEmbedder;
  metadataExporter: MetadataExporter;
  renderService: RenderService;
  assetService: AssetService;
}

export function createContainer(config: PenguiConfig): ServiceContainer {
  const logger = new Logger('pengui-slides', config.logLevel);
  const clock = systemClock;

  // Storage layer - uses file-based persistence if persistDir is configured
  const { soulStore, deckStore, slideStore, assetStore } = createStorage(config.persistDir);

  // Domain services
  const soulService = new SoulService(soulStore, slideStore, clock, logger.child('souls'));
  const deckService = new DeckService(deckStore, slideStore, soulStore, clock, logger.child('decks'));
  const validationService = new ValidationService(soulStore, config, logger.child('validation'));
  const metadataParser = new MetadataParser();
  const metadataEmbedder = new MetadataEmbedder();
  const metadataExporter = new MetadataExporter();
  const assetService = new AssetService(assetStore, clock, logger.child('assets'));
  const renderService = new RenderService(config, logger.child('rendering'), assetService);

  return {
    config,
    logger,
    clock,
    soulStore,
    deckStore,
    slideStore,
    assetStore,
    soulService,
    deckService,
    validationService,
    metadataParser,
    metadataEmbedder,
    metadataExporter,
    renderService,
    assetService,
  };
}
