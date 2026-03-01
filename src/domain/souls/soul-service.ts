/**
 * Soul Service — domain logic for Design Soul lifecycle.
 *
 * Orchestrates registration, approval, listing, and retrieval
 * of Design Souls and their skeleton templates.
 */

import type { SoulId } from '../../types/common.js';
import type {
  DesignSoul,
  DesignSoulInput,
  SkeletonTemplate,
  SoulStatus,
} from '../../types/design-soul.js';
import type { ISoulStore } from '../../storage/interfaces.js';
import type { Clock } from '../../infrastructure/clock.js';
import type { Logger } from '../../infrastructure/logger.js';
import { generateSoulId } from '../../infrastructure/id-generator.js';
import { SoulNotFoundError, PenguiError, ErrorCode } from '../../types/errors.js';
import { generateTokens } from './token-generator.js';
import { SkeletonGenerator } from './skeleton-generator.js';

export class SoulService {
  private readonly skeletonGenerator = new SkeletonGenerator();

  constructor(
    private readonly store: ISoulStore,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /**
   * Register a new Design Soul.
   *
   * Generates CSS tokens from the provided layers, creates the soul
   * entity in 'draft' status, and persists it.
   */
  async register(input: DesignSoulInput): Promise<DesignSoul> {
    this.logger.info('Registering new Design Soul', { name: input.name });

    const { cssString, tokenNames, allowedFonts } = generateTokens(input.layers);

    const now = this.clock.now();
    const soul: DesignSoul = {
      id: generateSoulId(),
      name: input.name,
      description: input.description,
      status: 'draft',
      layers: input.layers,
      cssTokens: cssString,
      tokenNames,
      allowedFonts,
      createdAt: now,
      updatedAt: now,
    };

    await this.store.save(soul);

    this.logger.info('Design Soul registered', { soulId: soul.id, tokenCount: tokenNames.length });

    return soul;
  }

  /**
   * Approve a draft Design Soul.
   *
   * Verifies the soul exists and is in 'draft' status, generates
   * skeleton templates, updates the status to 'approved', and
   * persists the skeletons.
   */
  async approve(soulId: SoulId): Promise<{ soul: DesignSoul; skeletons: SkeletonTemplate[] }> {
    this.logger.info('Approving Design Soul', { soulId });

    const existing = await this.store.get(soulId);
    if (!existing) {
      throw new SoulNotFoundError(soulId);
    }

    if (existing.status !== 'draft') {
      throw new PenguiError(
        ErrorCode.SOUL_ALREADY_APPROVED,
        `Design Soul "${soulId}" is already ${existing.status} and cannot be approved`,
        { soulId, currentStatus: existing.status },
      );
    }

    // Generate skeleton templates
    const skeletons = this.skeletonGenerator.generateAll(
      soulId,
      existing.cssTokens,
      this.clock,
    );

    // Update soul status
    const now = this.clock.now();
    const updatedSoul: DesignSoul = {
      ...existing,
      status: 'approved',
      updatedAt: now,
      approvedAt: now,
    };

    await this.store.save(updatedSoul);
    await this.store.saveSkeletons(soulId, skeletons);

    this.logger.info('Design Soul approved', {
      soulId,
      skeletonCount: skeletons.length,
    });

    return { soul: updatedSoul, skeletons };
  }

  /**
   * List Design Souls, optionally filtered by status.
   */
  async list(statusFilter?: SoulStatus | 'all'): Promise<DesignSoul[]> {
    this.logger.debug('Listing Design Souls', { statusFilter: statusFilter ?? 'all' });
    return this.store.list(statusFilter);
  }

  /**
   * Retrieve a Design Soul by ID, optionally including its skeleton templates.
   */
  async get(
    soulId: SoulId,
    includeSkeletons?: boolean,
  ): Promise<{ soul: DesignSoul; skeletons?: SkeletonTemplate[] }> {
    this.logger.debug('Getting Design Soul', { soulId, includeSkeletons });

    const soul = await this.store.get(soulId);
    if (!soul) {
      throw new SoulNotFoundError(soulId);
    }

    let skeletons: SkeletonTemplate[] | undefined;
    if (includeSkeletons) {
      skeletons = await this.store.getSkeletons(soulId);
    }

    return { soul, skeletons };
  }
}
