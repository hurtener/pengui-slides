import { describe, it, expect } from 'vitest';
import { SlugIndex, type SlugIndexRecord } from '../../../../src/domain/_shared/slug-index.js';

type Id = string & { readonly __brand: 'Id' };
const toId = (s: string) => s as Id;

function makeStore(initial: Array<{ id: string; slug?: string; name: string }>) {
  const state = new Map<string, { slug?: string; name: string }>();
  for (const r of initial) state.set(r.id, { slug: r.slug, name: r.name });
  const persistCalls: Array<{ id: string; slug: string }> = [];
  const index = new SlugIndex<Id>(
    async () =>
      Array.from(state.entries()).map(([id, rec]): SlugIndexRecord<Id> => ({
        id: toId(id),
        slug: rec.slug,
        slugSource: rec.name,
      })),
    async (id, slug) => {
      persistCalls.push({ id, slug });
      const rec = state.get(id);
      if (rec) rec.slug = slug;
    },
  );
  return { index, persistCalls, state };
}

describe('SlugIndex', () => {
  it('resolves by existing slug and by uuid', async () => {
    const { index } = makeStore([{ id: 'abc-123', slug: 'brand-handbook', name: 'Brand Handbook' }]);
    expect(await index.resolve('brand-handbook')).toBe('abc-123');
    expect(await index.resolve('abc-123')).toBe('abc-123');
  });

  it('returns undefined for unknown ref', async () => {
    const { index } = makeStore([]);
    expect(await index.resolve('does-not-exist')).toBeUndefined();
  });

  it('backfills missing slugs on first access, derived from slugSource', async () => {
    const { index, persistCalls, state } = makeStore([
      { id: 'id1', name: 'First Thing' },
      { id: 'id2', name: 'Second' },
    ]);
    await index.ensure();
    expect(state.get('id1')?.slug).toBe('first-thing');
    expect(state.get('id2')?.slug).toBe('second');
    expect(persistCalls).toHaveLength(2);
  });

  it('backfill resolves collisions against records that already have slugs', async () => {
    const { index, state } = makeStore([
      { id: 'id1', slug: 'brand-handbook', name: 'Brand Handbook' },
      { id: 'id2', name: 'Brand Handbook' },
    ]);
    await index.ensure();
    expect(state.get('id2')?.slug).toBe('brand-handbook-2');
  });

  it('ensure is idempotent — second call does not re-persist', async () => {
    const { index, persistCalls } = makeStore([{ id: 'id1', name: 'One' }]);
    await index.ensure();
    await index.ensure();
    expect(persistCalls).toHaveLength(1);
  });

  it('pickForNew avoids collisions with existing slugs', async () => {
    const { index } = makeStore([{ id: 'id1', slug: 'report', name: 'Report' }]);
    expect(await index.pickForNew('Report')).toBe('report-2');
    expect(await index.pickForNew('Annual Report')).toBe('annual-report');
  });

  it('register makes a new slug resolvable without re-running ensure', async () => {
    const { index } = makeStore([]);
    await index.ensure();
    index.register('new-deck', toId('deck-x'));
    expect(await index.resolve('new-deck')).toBe('deck-x');
  });

  it('slugFor returns the slug for a known id after backfill', async () => {
    const { index } = makeStore([{ id: 'id1', name: 'My Deck' }]);
    expect(await index.slugFor(toId('id1'))).toBe('my-deck');
  });
});
