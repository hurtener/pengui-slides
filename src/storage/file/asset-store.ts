/**
 * File-based implementation of IAssetStore.
 *
 * Persists asset metadata as JSON and binary image data as .bin files.
 *
 * File layout:
 *   <baseDir>/assets/<assetId>.json - Asset metadata
 *   <baseDir>/assets/<assetId>.bin  - Binary image data
 */

import fs from 'node:fs';
import path from 'node:path';
import type { AssetId } from '../../types/common.js';
import type { Asset } from '../../types/asset.js';
import type { IAssetStore, AssetListFilter } from '../interfaces.js';

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class FileAssetStore implements IAssetStore {
  private readonly dir: string;

  constructor(baseDir: string) {
    this.dir = path.join(baseDir, 'assets');
  }

  private ensureDir(): void {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private metadataPath(id: AssetId): string {
    return path.join(this.dir, `${id}.json`);
  }

  private dataPath(id: AssetId): string {
    return path.join(this.dir, `${id}.bin`);
  }

  async saveMetadata(asset: Asset): Promise<void> {
    this.ensureDir();
    fs.writeFileSync(
      this.metadataPath(asset.id),
      JSON.stringify(clone(asset), null, 2),
      'utf-8',
    );
  }

  async saveData(id: AssetId, data: Buffer): Promise<void> {
    this.ensureDir();
    fs.writeFileSync(this.dataPath(id), data);
  }

  async getMetadata(id: AssetId): Promise<Asset | undefined> {
    const filePath = this.metadataPath(id);
    if (!fs.existsSync(filePath)) return undefined;
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as Asset;
  }

  async getData(id: AssetId): Promise<Buffer | undefined> {
    const filePath = this.dataPath(id);
    if (!fs.existsSync(filePath)) return undefined;
    return fs.readFileSync(filePath);
  }

  async list(filter?: AssetListFilter): Promise<Asset[]> {
    this.ensureDir();
    const files = fs.readdirSync(this.dir);
    const assets: Asset[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const data = fs.readFileSync(path.join(this.dir, file), 'utf-8');
      const asset = JSON.parse(data) as Asset;

      if (this.matchesFilter(asset, filter)) {
        assets.push(asset);
      }
    }

    return clone(assets);
  }

  async delete(id: AssetId): Promise<boolean> {
    const metaPath = this.metadataPath(id);
    if (!fs.existsSync(metaPath)) return false;

    fs.unlinkSync(metaPath);

    const binPath = this.dataPath(id);
    if (fs.existsSync(binPath)) {
      fs.unlinkSync(binPath);
    }

    return true;
  }

  private matchesFilter(asset: Asset, filter?: AssetListFilter): boolean {
    if (!filter) return true;

    if (filter.scope && asset.scope.type !== filter.scope) return false;
    if (filter.role && asset.role !== filter.role) return false;
    // Only check soulId against soul-scoped assets (avoid rejecting deck/global assets)
    if (filter.soulId && asset.scope.type === 'soul' && asset.scope.soulId !== filter.soulId) return false;
    // Only check deckId against deck-scoped assets (avoid rejecting soul/global assets)
    if (filter.deckId && asset.scope.type === 'deck' && asset.scope.deckId !== filter.deckId) return false;

    return true;
  }
}
