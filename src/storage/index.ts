export type { ISoulStore, IDeckStore, ISlideStore } from './interfaces.js';
export { InMemorySoulStore, InMemoryDeckStore, InMemorySlideStore } from './memory/index.js';
export { FileSoulStore, FileDeckStore, FileSlideStore } from './file/index.js';
export { createStorage, type StorageProvider } from './factory.js';
