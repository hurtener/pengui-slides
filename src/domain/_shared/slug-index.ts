/**
 * Shared slug-index helper for v4.
 *
 * Maintains an in-memory slug→id map for one record kind (Deck or Soul),
 * backed by the store. On first access it walks the store once, derives
 * slugs for any legacy records that lack one, and persists the backfill.
 * Subsequent calls are O(1) lookups.
 *
 * Intentionally generic over `Id` and the record shape — Deck uses `title`,
 * Soul uses `name`, so callers pass a getter and a persister lambda.
 */

import { deriveSlug } from '../../infrastructure/slug.js';

export interface SlugIndexRecord<Id extends string> {
  id: Id;
  slug?: string;
  /** The human-facing label used to derive a slug when one is missing. */
  slugSource: string;
}

export class SlugIndex<Id extends string> {
  private readonly byslug = new Map<string, Id>();
  private readonly byId = new Map<Id, string>();
  private ensured: Promise<void> | null = null;

  constructor(
    private readonly load: () => Promise<SlugIndexRecord<Id>[]>,
    private readonly persistSlug: (id: Id, slug: string) => Promise<void>,
  ) {}

  /** Build the index and backfill missing slugs. Idempotent. */
  async ensure(): Promise<void> {
    if (!this.ensured) this.ensured = this.build();
    return this.ensured;
  }

  private async build(): Promise<void> {
    const records = await this.load();
    const taken = new Set<string>();
    // Pass 1 — record existing slugs
    for (const r of records) {
      if (r.slug) {
        this.byslug.set(r.slug, r.id);
        this.byId.set(r.id, r.slug);
        taken.add(r.slug);
      }
    }
    // Pass 2 — backfill records missing a slug
    for (const r of records) {
      if (!r.slug) {
        const s = deriveSlug(r.slugSource, taken);
        taken.add(s);
        this.byslug.set(s, r.id);
        this.byId.set(r.id, s);
        await this.persistSlug(r.id, s);
      }
    }
  }

  /** Resolve a ref (UUID or slug) to an Id, or undefined if unknown. */
  async resolve(ref: string): Promise<Id | undefined> {
    await this.ensure();
    // Slug lookup first (slugs never collide with UUIDs because UUIDs contain hyphens
    // but include hex chars in positions slugs don't — and practically, slugs are
    // short and UUIDs are 36 chars with fixed hyphen positions).
    const bySlug = this.byslug.get(ref);
    if (bySlug) return bySlug;
    // Fall back to id-match. Caller is expected to verify the id actually exists
    // in the store; this helper only checks it's known to the slug index.
    return this.byId.has(ref as Id) ? (ref as Id) : undefined;
  }

  /** Slug for a known id, or undefined. */
  async slugFor(id: Id): Promise<string | undefined> {
    await this.ensure();
    return this.byId.get(id);
  }

  /** Derive a fresh, non-colliding slug for a new record. */
  async pickForNew(source: string): Promise<string> {
    await this.ensure();
    const taken = new Set(this.byslug.keys());
    return deriveSlug(source, taken);
  }

  /** Register a newly created record's slug. Callers are responsible for persistence. */
  register(slug: string, id: Id): void {
    this.byslug.set(slug, id);
    this.byId.set(id, slug);
  }

  /** Drop an id from the index (after deletion). */
  remove(id: Id): void {
    const slug = this.byId.get(id);
    if (slug) this.byslug.delete(slug);
    this.byId.delete(id);
  }
}
