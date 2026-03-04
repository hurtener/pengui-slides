/**
 * In-memory implementation of ISoulStore.
 *
 * Uses Map<string, T> as the backing store and deep-clones every
 * object on read/write to prevent external mutation bugs.
 */

import type { SoulId } from '../../types/common.js';
import type { DesignSoul, LayoutRecipe, SoulStatus } from '../../types/design-soul.js';
import type { ISoulStore } from '../interfaces.js';

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class InMemorySoulStore implements ISoulStore {
  private souls = new Map<string, DesignSoul>();
  private recipes = new Map<string, LayoutRecipe[]>();

  async save(soul: DesignSoul): Promise<void> {
    this.souls.set(soul.id, clone(soul));
  }

  async get(id: SoulId): Promise<DesignSoul | undefined> {
    const soul = this.souls.get(id);
    return soul ? clone(soul) : undefined;
  }

  async list(statusFilter?: SoulStatus | 'all'): Promise<DesignSoul[]> {
    const all = Array.from(this.souls.values());
    const filtered =
      !statusFilter || statusFilter === 'all'
        ? all
        : all.filter((s) => s.status === statusFilter);
    return clone(filtered);
  }

  async delete(id: SoulId): Promise<boolean> {
    const existed = this.souls.delete(id);
    this.recipes.delete(id);
    return existed;
  }

  async saveRecipes(soulId: SoulId, recipes: LayoutRecipe[]): Promise<void> {
    this.recipes.set(soulId, clone(recipes));
  }

  async getRecipes(soulId: SoulId): Promise<LayoutRecipe[]> {
    const recipes = this.recipes.get(soulId);
    return recipes ? clone(recipes) : [];
  }

  async addRecipe(soulId: SoulId, recipe: LayoutRecipe): Promise<void> {
    const existing = this.recipes.get(soulId) ?? [];
    existing.push(clone(recipe));
    this.recipes.set(soulId, existing);
  }
}
