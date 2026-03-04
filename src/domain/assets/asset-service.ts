/**
 * Asset Service for Pengui Slides.
 *
 * Handles upload, retrieval, listing, and deletion of image assets.
 * The LLM never sees raw binary data — it works with asset://ID refs
 * that are resolved at the render/export boundary.
 */

import type { Logger } from '../../infrastructure/logger.js';
import type { Clock } from '../../infrastructure/clock.js';
import { generateAssetId } from '../../infrastructure/id-generator.js';
import type { AssetId } from '../../types/common.js';
import type { Asset, AssetMimeType, AssetScope } from '../../types/asset.js';
import { ASSET_PROTOCOL } from '../../types/asset.js';
import type { IAssetStore, AssetListFilter } from '../../storage/interfaces.js';
import { ErrorCode, PenguiError } from '../../types/errors.js';

const VALID_MIME_TYPES: ReadonlySet<string> = new Set<string>([
  'image/png',
  'image/svg+xml',
  'image/jpeg',
]);

export interface UploadAssetInput {
  name: string;
  filename: string;
  mimeType: AssetMimeType;
  scope: AssetScope;
  role: 'logo' | 'content';
  dataBase64: string;
}

export class AssetService {
  constructor(
    private readonly assetStore: IAssetStore,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /**
   * Upload a new image asset.
   * Validates the mime type, decodes base64, persists metadata + binary,
   * and returns the Asset (with its ref for use in HTML).
   */
  async upload(input: UploadAssetInput): Promise<Asset> {
    if (!VALID_MIME_TYPES.has(input.mimeType)) {
      throw new PenguiError(
        ErrorCode.ASSET_INVALID_MIME,
        `Unsupported mime type: ${input.mimeType}. Supported: ${[...VALID_MIME_TYPES].join(', ')}`,
      );
    }

    const data = Buffer.from(input.dataBase64, 'base64');
    const id = generateAssetId();

    const asset: Asset = {
      id,
      name: input.name,
      filename: input.filename,
      mimeType: input.mimeType,
      scope: input.scope,
      role: input.role,
      sizeBytes: data.length,
      createdAt: this.clock.now(),
    };

    await this.assetStore.saveMetadata(asset);
    await this.assetStore.saveData(id, data);

    this.logger.info('Asset uploaded', {
      assetId: id,
      name: input.name,
      mimeType: input.mimeType,
      sizeBytes: data.length,
    });

    return asset;
  }

  /**
   * Get asset metadata by ID. Does not return binary data.
   */
  async get(id: AssetId): Promise<Asset | undefined> {
    return this.assetStore.getMetadata(id);
  }

  /**
   * Build a full data URI for the asset: "data:image/png;base64,..."
   * Returns undefined if the asset doesn't exist.
   */
  async getDataUri(id: AssetId): Promise<string | undefined> {
    const asset = await this.assetStore.getMetadata(id);
    if (!asset) return undefined;

    const data = await this.assetStore.getData(id);
    if (!data) return undefined;

    return `data:${asset.mimeType};base64,${data.toString('base64')}`;
  }

  /**
   * List assets with optional filtering.
   */
  async list(filter?: AssetListFilter): Promise<Asset[]> {
    return this.assetStore.list(filter);
  }

  /**
   * Delete an asset (metadata + binary).
   */
  async delete(id: AssetId): Promise<boolean> {
    const deleted = await this.assetStore.delete(id);

    if (deleted) {
      this.logger.info('Asset deleted', { assetId: id });
    }

    return deleted;
  }

  /**
   * Build the ref string for use in slide HTML: "asset://UUID"
   */
  static ref(id: AssetId): string {
    return `${ASSET_PROTOCOL}${id}`;
  }
}
