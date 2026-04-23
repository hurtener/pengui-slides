/**
 * Storage factory.
 *
 * Creates the appropriate storage backend (in-memory or file-based)
 * based on the presence of a persistence directory.
 */

import type {
  ISoulStore,
  IDeckStore,
  ISlideStore,
  ISectionStore,
  IAssetStore,
  ICommentStore,
} from './interfaces.js';
import { InMemorySoulStore } from './memory/soul-store.js';
import { InMemoryDeckStore } from './memory/deck-store.js';
import { InMemorySlideStore } from './memory/slide-store.js';
import { InMemorySectionStore } from './memory/section-store.js';
import { InMemoryAssetStore } from './memory/asset-store.js';
import { InMemoryCommentStore } from './memory/comment-store.js';
import { FileSoulStore } from './file/soul-store.js';
import { FileDeckStore } from './file/deck-store.js';
import { FileSlideStore } from './file/slide-store.js';
import { FileSectionStore } from './file/section-store.js';
import { FileAssetStore } from './file/asset-store.js';
import { FileCommentStore } from './file/comment-store.js';

export interface StorageProvider {
  soulStore: ISoulStore;
  deckStore: IDeckStore;
  slideStore: ISlideStore;
  sectionStore: ISectionStore;
  assetStore: IAssetStore;
  commentStore: ICommentStore;
}

/**
 * Creates a StorageProvider backed by either file-based or in-memory stores.
 *
 * @param persistDir - If provided, stores persist state as JSON files
 *                     under this directory. Otherwise, uses in-memory stores.
 */
export function createStorage(persistDir?: string): StorageProvider {
  if (persistDir) {
    return {
      soulStore: new FileSoulStore(persistDir),
      deckStore: new FileDeckStore(persistDir),
      slideStore: new FileSlideStore(persistDir),
      sectionStore: new FileSectionStore(persistDir),
      assetStore: new FileAssetStore(persistDir),
      commentStore: new FileCommentStore(persistDir),
    };
  }

  return {
    soulStore: new InMemorySoulStore(),
    deckStore: new InMemoryDeckStore(),
    slideStore: new InMemorySlideStore(),
    sectionStore: new InMemorySectionStore(),
    assetStore: new InMemoryAssetStore(),
    commentStore: new InMemoryCommentStore(),
  };
}
