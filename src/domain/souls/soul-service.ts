/**
 * Soul Service — domain logic for Design Soul lifecycle.
 *
 * Orchestrates registration, approval, listing, and retrieval
 * of Design Souls and their layout recipes.
 */

import type { SoulId, SlideId } from '../../types/common.js';
import type {
  DesignSoul,
  DesignSoulInput,
  LayoutRecipe,
  SoulStatus,
} from '../../types/design-soul.js';
import type { ISoulStore, ISlideStore } from '../../storage/interfaces.js';
import type { Clock } from '../../infrastructure/clock.js';
import type { Logger } from '../../infrastructure/logger.js';
import { generateSoulId, generateTemplateId } from '../../infrastructure/id-generator.js';
import { SoulNotFoundError, PenguiError, ErrorCode } from '../../types/errors.js';
import { generateTokens } from './token-generator.js';
import { generateUtilityCss } from './utility-css-generator.js';
import { generateStyleGuide } from './style-guide-generator.js';
import { RecipeGenerator } from './recipe-generator.js';

export class SoulService {
  private readonly recipeGenerator = new RecipeGenerator();

  constructor(
    private readonly store: ISoulStore,
    private readonly slideStore: ISlideStore,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /**
   * Register a new Design Soul.
   *
   * Generates CSS tokens, utility CSS, and style guide from the provided
   * layers, creates the soul entity in 'draft' status, and persists it.
   */
  async register(input: DesignSoulInput): Promise<DesignSoul> {
    this.logger.info('Registering new Design Soul', { name: input.name });

    const { cssString, tokenNames, allowedFonts } = generateTokens(input.layers);
    const utilityCss = generateUtilityCss();
    const styleGuide = generateStyleGuide(input.layers, tokenNames);

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
      utilityCss,
      styleGuide,
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
   * layout recipes, updates the status to 'approved', and
   * persists the recipes.
   */
  async approve(soulId: SoulId): Promise<{ soul: DesignSoul; recipes: LayoutRecipe[] }> {
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

    // Generate layout recipes
    const recipes = this.recipeGenerator.generateAll(
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
    await this.store.saveRecipes(soulId, recipes);

    this.logger.info('Design Soul approved', {
      soulId,
      recipeCount: recipes.length,
    });

    return { soul: updatedSoul, recipes };
  }

  /**
   * List Design Souls, optionally filtered by status.
   */
  async list(statusFilter?: SoulStatus | 'all'): Promise<DesignSoul[]> {
    this.logger.debug('Listing Design Souls', { statusFilter: statusFilter ?? 'all' });
    return this.store.list(statusFilter);
  }

  /**
   * Retrieve a Design Soul by ID, optionally including its layout recipes.
   */
  async get(
    soulId: SoulId,
    includeRecipes?: boolean,
  ): Promise<{ soul: DesignSoul; recipes?: LayoutRecipe[] }> {
    this.logger.debug('Getting Design Soul', { soulId, includeRecipes });

    const soul = await this.store.get(soulId);
    if (!soul) {
      throw new SoulNotFoundError(soulId);
    }

    let recipes: LayoutRecipe[] | undefined;
    if (includeRecipes) {
      recipes = await this.store.getRecipes(soulId);
    }

    return { soul, recipes };
  }

  /**
   * Save a validated slide as a reusable layout recipe (template).
   *
   * The slide must belong to an existing soul and must have passed
   * validation before it can be saved as a template.
   */
  async saveAsTemplate(
    soulId: SoulId,
    slideId: SlideId,
    name: string,
    tags: string[],
    description: string,
  ): Promise<LayoutRecipe> {
    // 1. Verify soul exists
    const soul = await this.store.get(soulId);
    if (!soul) throw new SoulNotFoundError(soulId);

    // 2. Get slide from slideStore
    const slide = await this.slideStore.get(slideId);
    if (!slide) {
      throw new PenguiError(ErrorCode.SLIDE_NOT_FOUND, `Slide "${slideId}" not found`, {
        slideId,
      });
    }

    // 3. Verify slide passed validation
    if (!slide.lastValidation?.passed) {
      throw new PenguiError(
        ErrorCode.VALIDATION_FAILED,
        'Slide must pass validation before saving as template',
        { slideId, validation: slide.lastValidation },
      );
    }

    // 4. Create recipe
    const recipe: LayoutRecipe = {
      id: generateTemplateId(),
      soulId,
      type: name.toLowerCase().replace(/\s+/g, '-'),
      name,
      description,
      tags,
      source: 'user-saved',
      html: slide.html,
      createdAt: this.clock.now(),
      savedFromSlideId: slideId,
    };

    // 5. Store it
    await this.store.addRecipe(soulId, recipe);

    this.logger.info('Saved slide as template', { soulId, slideId, recipeId: recipe.id });

    return recipe;
  }
}
