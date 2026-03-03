/**
 * In-memory implementation of IAssetStore.
 *
 * Uses Maps as the backing store and deep-clones metadata
 * on read/write to prevent external mutation bugs.
 */

import type { AssetId } from '../../types/common.js';
import type { Asset } from '../../types/asset.js';
import type { IAssetStore, AssetListFilter } from '../interfaces.js';

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class InMemoryAssetStore implements IAssetStore {
  private metadata = new Map<string, Asset>();
  private data = new Map<string, Buffer>();

  async saveMetadata(asset: Asset): Promise<void> {
    this.metadata.set(asset.id, clone(asset));
  }

  async saveData(id: AssetId, data: Buffer): Promise<void> {
    this.data.set(id, Buffer.from(data));
  }

  async getMetadata(id: AssetId): Promise<Asset | undefined> {
    const asset = this.metadata.get(id);
    return asset ? clone(asset) : undefined;
  }

  async getData(id: AssetId): Promise<Buffer | undefined> {
    const buf = this.data.get(id);
    return buf ? Buffer.from(buf) : undefined;
  }

  async list(filter?: AssetListFilter): Promise<Asset[]> {
    const all = Array.from(this.metadata.values());
    const filtered = filter ? all.filter((a) => this.matchesFilter(a, filter)) : all;
    return clone(filtered);
  }

  async delete(id: AssetId): Promise<boolean> {
    const existed = this.metadata.delete(id);
    this.data.delete(id);
    return existed;
  }

  private matchesFilter(asset: Asset, filter: AssetListFilter): boolean {
    if (filter.scope && asset.scope.type !== filter.scope) return false;
    if (filter.role && asset.role !== filter.role) return false;
    if (filter.soulId && (asset.scope.type !== 'soul' || asset.scope.soulId !== filter.soulId)) return false;
    if (filter.deckId && (asset.scope.type !== 'deck' || asset.scope.deckId !== filter.deckId)) return false;

    return true;
  }
}
