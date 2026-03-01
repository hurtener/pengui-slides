/**
 * Dependency injection container.
 *
 * Wires all stores, services, and infrastructure together.
 */

import type { PenguiConfig } from './config.js';
import { Logger, systemClock, type Clock } from './infrastructure/index.js';

// Storage
import { InMemorySoulStore } from './storage/memory/soul-store.js';
import { InMemoryDeckStore } from './storage/memory/deck-store.js';
import { InMemorySlideStore } from './storage/memory/slide-store.js';
import type { ISoulStore, IDeckStore, ISlideStore } from './storage/interfaces.js';

// Domain services
import { SoulService } from './domain/souls/soul-service.js';
import { DeckService } from './domain/decks/deck-service.js';
import { ValidationService } from './domain/validation/validation-service.js';
import { MetadataParser } from './domain/metadata/metadata-parser.js';
import { MetadataEmbedder } from './domain/metadata/metadata-embedder.js';
import { MetadataExporter } from './domain/metadata/metadata-exporter.js';
import { RenderService } from './domain/rendering/render-service.js';

export interface ServiceContainer {
  config: PenguiConfig;
  logger: Logger;
  clock: Clock;

  // Stores
  soulStore: ISoulStore;
  deckStore: IDeckStore;
  slideStore: ISlideStore;

  // Services
  soulService: SoulService;
  deckService: DeckService;
  validationService: ValidationService;
  metadataParser: MetadataParser;
  metadataEmbedder: MetadataEmbedder;
  metadataExporter: MetadataExporter;
  renderService: RenderService;
}

export function createContainer(config: PenguiConfig): ServiceContainer {
  const logger = new Logger('pengui-slides', config.logLevel);
  const clock = systemClock;

  // Storage layer
  const soulStore = new InMemorySoulStore();
  const deckStore = new InMemoryDeckStore();
  const slideStore = new InMemorySlideStore();

  // Domain services
  const soulService = new SoulService(soulStore, clock, logger.child('souls'));
  const deckService = new DeckService(deckStore, slideStore, soulStore, clock, logger.child('decks'));
  const validationService = new ValidationService(soulStore, config, logger.child('validation'));
  const metadataParser = new MetadataParser();
  const metadataEmbedder = new MetadataEmbedder();
  const metadataExporter = new MetadataExporter();
  const renderService = new RenderService(config, logger.child('rendering'));

  return {
    config,
    logger,
    clock,
    soulStore,
    deckStore,
    slideStore,
    soulService,
    deckService,
    validationService,
    metadataParser,
    metadataEmbedder,
    metadataExporter,
    renderService,
  };
}
