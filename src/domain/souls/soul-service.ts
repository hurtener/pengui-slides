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
import { SlugIndex } from '../_shared/slug-index.js';

export class SoulService {
  private readonly recipeGenerator = new RecipeGenerator();
  private readonly slugIndex: SlugIndex<SoulId>;

  constructor(
    private readonly store: ISoulStore,
    private readonly slideStore: ISlideStore,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {
    this.slugIndex = new SlugIndex<SoulId>(
      async () => {
        const all = await this.store.list('all');
        return all.map((s) => ({ id: s.id, slug: s.slug, slugSource: s.name }));
      },
      async (id, slug) => {
        const soul = await this.store.get(id);
        if (soul && !soul.slug) {
          soul.slug = slug;
          await this.store.save(soul);
        }
      },
    );
  }

  /** Resolve a UUID or slug to a SoulId, or undefined if unknown. */
  async resolveRef(ref: string): Promise<SoulId | undefined> {
    const resolved = await this.slugIndex.resolve(ref);
    if (resolved) return resolved;
    // Fall back to direct store lookup — supports newly created ids that aren't
    // in the slug index yet (the index caches post-build registrations but a
    // caller might pass an id that pre-exists the most recent ensure()).
    const soul = await this.store.get(ref as SoulId);
    return soul ? soul.id : undefined;
  }

  /** Resolve a UUID or slug to a SoulId, throwing if unknown. */
  async resolveRefOrThrow(ref: string): Promise<SoulId> {
    const id = await this.resolveRef(ref);
    if (!id) throw new SoulNotFoundError(ref);
    return id;
  }

  /** Slug for a known soul id (may trigger backfill on first access). */
  async slugFor(id: SoulId): Promise<string | undefined> {
    return this.slugIndex.slugFor(id);
  }

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
    const id = generateSoulId();
    const slug = await this.slugIndex.pickForNew(input.name);
    const soul: DesignSoul = {
      id,
      slug,
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
    this.slugIndex.register(slug, id);

    this.logger.info('Design Soul registered', { soulId: soul.id, slug, tokenCount: tokenNames.length });

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

    // Generate layout recipes for both mediums
    const slideRecipes = this.recipeGenerator.generateAll(
      soulId,
      existing.cssTokens,
      this.clock,
    );
    const printRecipes = this.recipeGenerator.generatePrintAll(
      soulId,
      existing.cssTokens,
      this.clock,
    );
    const recipes = [...slideRecipes, ...printRecipes];

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
      slideRecipeCount: slideRecipes.length,
      printRecipeCount: printRecipes.length,
      totalRecipeCount: recipes.length,
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
   * Apply a single token override to an existing soul.
   *
   * Mutates `layers[layer][tokenName] = value`, then regenerates cssTokens,
   * allowedFonts, utilityCss, and styleGuide. If the soul is already approved,
   * recipes are also regenerated and re-saved. Bumps updatedAt.
   *
   * @throws SoulNotFoundError if the soul does not exist.
   * @throws PenguiError(INVALID_INPUT) if `layer` or `tokenName` is unknown.
   */
  async applyTokenOverride(
    soulIdArg: SoulId,
    layer: keyof import('../../types/design-soul.js').SoulLayers,
    tokenName: string,
    value: string | number,
  ): Promise<DesignSoul> {
    const soul = await this.store.get(soulIdArg);
    if (!soul) throw new SoulNotFoundError(soulIdArg);

    const layerObj = soul.layers[layer] as unknown as Record<string, unknown>;
    if (!(tokenName in layerObj)) {
      const known = Object.keys(layerObj).join(', ');
      throw new PenguiError(
        ErrorCode.INVALID_INPUT,
        `Unknown token "${tokenName}" in layer "${layer}". Known: ${known}`,
        { layer, tokenName, knownTokens: Object.keys(layerObj) },
      );
    }

    // Mutate the layer in place on a clone
    const updatedLayers = {
      ...soul.layers,
      [layer]: { ...layerObj, [tokenName]: value },
    } as import('../../types/design-soul.js').SoulLayers;

    // Regenerate derived fields
    const { cssString, tokenNames, allowedFonts } = generateTokens(updatedLayers);
    const utilityCss = generateUtilityCss();
    const styleGuide = generateStyleGuide(updatedLayers, tokenNames);

    const now = this.clock.now();
    const updatedSoul: DesignSoul = {
      ...soul,
      layers: updatedLayers,
      cssTokens: cssString,
      tokenNames,
      allowedFonts,
      utilityCss,
      styleGuide,
      updatedAt: now,
    };

    await this.store.save(updatedSoul);

    // If approved, also regenerate recipes
    if (updatedSoul.status === 'approved') {
      const slideRecipes = this.recipeGenerator.generateAll(soulIdArg, cssString, this.clock);
      const printRecipes = this.recipeGenerator.generatePrintAll(soulIdArg, cssString, this.clock);
      await this.store.saveRecipes(soulIdArg, [...slideRecipes, ...printRecipes]);
    }

    this.logger.info('Token override applied', { soulId: soulIdArg, layer, tokenName });
    return updatedSoul;
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
      medium: 'slides',   // user-saved templates default to slides; print templates are built-in
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
