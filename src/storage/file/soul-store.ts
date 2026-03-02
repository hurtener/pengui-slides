/**
 * File-based implementation of ISoulStore.
 *
 * Persists DesignSoul objects and LayoutRecipe arrays as JSON files
 * in a configurable directory. Deep-clones on read/write for data integrity.
 *
 * File layout:
 *   <baseDir>/souls/<soulId>.json            - DesignSoul object
 *   <baseDir>/souls/<soulId>.recipes.json     - LayoutRecipe[]
 *   <baseDir>/souls/<soulId>.skeletons.json   - (legacy, read-only fallback)
 */

import fs from 'node:fs';
import path from 'node:path';
import type { SoulId } from '../../types/common.js';
import type { DesignSoul, LayoutRecipe, SoulStatus } from '../../types/design-soul.js';
import type { ISoulStore } from '../interfaces.js';

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export class FileSoulStore implements ISoulStore {
  private readonly dir: string;

  constructor(baseDir: string) {
    this.dir = path.join(baseDir, 'souls');
  }

  private ensureDir(): void {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private soulPath(id: SoulId): string {
    return path.join(this.dir, `${id}.json`);
  }

  private recipesPath(id: SoulId): string {
    return path.join(this.dir, `${id}.recipes.json`);
  }

  /** @deprecated Kept for backward-compat reading */
  private skeletonsPath(id: SoulId): string {
    return path.join(this.dir, `${id}.skeletons.json`);
  }

  async save(soul: DesignSoul): Promise<void> {
    this.ensureDir();
    fs.writeFileSync(this.soulPath(soul.id), JSON.stringify(clone(soul), null, 2), 'utf-8');
  }

  async get(id: SoulId): Promise<DesignSoul | undefined> {
    const filePath = this.soulPath(id);
    if (!fs.existsSync(filePath)) return undefined;
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as DesignSoul;
  }

  async list(statusFilter?: SoulStatus | 'all'): Promise<DesignSoul[]> {
    this.ensureDir();
    const files = fs.readdirSync(this.dir);
    const souls: DesignSoul[] = [];
    for (const file of files) {
      if (
        !file.endsWith('.json') ||
        file.endsWith('.skeletons.json') ||
        file.endsWith('.recipes.json')
      )
        continue;
      const data = fs.readFileSync(path.join(this.dir, file), 'utf-8');
      souls.push(JSON.parse(data) as DesignSoul);
    }
    const filtered =
      !statusFilter || statusFilter === 'all'
        ? souls
        : souls.filter((s) => s.status === statusFilter);
    return clone(filtered);
  }

  async delete(id: SoulId): Promise<boolean> {
    const filePath = this.soulPath(id);
    const existed = fs.existsSync(filePath);
    if (existed) fs.unlinkSync(filePath);
    const recipesPath = this.recipesPath(id);
    if (fs.existsSync(recipesPath)) fs.unlinkSync(recipesPath);
    const skPath = this.skeletonsPath(id);
    if (fs.existsSync(skPath)) fs.unlinkSync(skPath);
    return existed;
  }

  async saveRecipes(soulId: SoulId, recipes: LayoutRecipe[]): Promise<void> {
    this.ensureDir();
    fs.writeFileSync(
      this.recipesPath(soulId),
      JSON.stringify(clone(recipes), null, 2),
      'utf-8',
    );
  }

  async getRecipes(soulId: SoulId): Promise<LayoutRecipe[]> {
    // Try new .recipes.json first
    const recipesFile = this.recipesPath(soulId);
    if (fs.existsSync(recipesFile)) {
      const data = fs.readFileSync(recipesFile, 'utf-8');
      return JSON.parse(data) as LayoutRecipe[];
    }
    // Fall back to legacy .skeletons.json
    const skeletonsFile = this.skeletonsPath(soulId);
    if (fs.existsSync(skeletonsFile)) {
      const data = fs.readFileSync(skeletonsFile, 'utf-8');
      return JSON.parse(data) as LayoutRecipe[];
    }
    return [];
  }

  async addRecipe(soulId: SoulId, recipe: LayoutRecipe): Promise<void> {
    const existing = await this.getRecipes(soulId);
    existing.push(recipe);
    await this.saveRecipes(soulId, existing);
  }
}
