<!--
  Assets route — asset library grouped by scope (soul / deck / global)
  and by role (logo / content / other).
  Upload button opens a file picker → base64 → upload_asset_from_app.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import AssetCard from '../lib/AssetCard.svelte';
  import AssetUploader from '../lib/AssetUploader.svelte';
  import type { McpDeckEditorBridge, AssetItem, AssetScopeWire } from '../lib/bridge';

  interface Props {
    bridge: McpDeckEditorBridge;
    activeDeckRef?: string | null;
    activeSoulRef?: string | null;
  }

  let { bridge, activeDeckRef = null, activeSoulRef = null }: Props = $props();

  let assets = $state<AssetItem[]>([]);
  let loading = $state(true);
  let error = $state('');
  let scopeFilter = $state<'all' | 'soul' | 'deck' | 'global'>('all');
  let roleFilter = $state<'all' | 'logo' | 'content'>('all');
  let uploadScope = $state<'global' | 'deck' | 'soul'>('global');
  let uploadRole = $state<'logo' | 'content'>('content');

  function scopeKey(s: AssetScopeWire): 'soul' | 'deck' | 'global' {
    return s.type;
  }

  function scopeDisplay(s: AssetScopeWire): string {
    if (s.type === 'soul') return `soul:${(s.soulId ?? '').slice(0, 8)}`;
    if (s.type === 'deck') return `deck:${(s.deckId ?? '').slice(0, 8)}`;
    return 'global';
  }

  onMount(() => {
    void load();
  });

  async function load(): Promise<void> {
    loading = true;
    error = '';
    try {
      const result = await bridge.listAssets();
      assets = result.assets;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  // Group the assets by scope type → role
  const scopes = $derived(
    [...new Set(assets.map((a) => scopeKey(a.scope)))].sort()
  );

  const roles = $derived(
    [...new Set(assets.map((a) => a.role))].sort()
  );

  const filtered = $derived(
    assets.filter((a) => {
      const scopeOk = scopeFilter === 'all' || scopeKey(a.scope) === scopeFilter;
      const roleOk = roleFilter === 'all' || a.role === roleFilter;
      return scopeOk && roleOk;
    })
  );

  // Group filtered assets by scope type
  const grouped = $derived(
    (() => {
      const map = new Map<string, AssetItem[]>();
      for (const a of filtered) {
        const key = scopeKey(a.scope);
        const list = map.get(key) ?? [];
        list.push(a);
        map.set(key, list);
      }
      return map;
    })()
  );

  function handleUploaded(_assetId: string): void {
    // Reload the full list to pick up the new asset.
    void load();
  }
</script>

<div class="assets-route">

  <div class="assets-header">
    <div class="header-left">
      <h1>Asset Library</h1>
      <p class="subtitle">Images, logos, and files used by your decks and souls.</p>
    </div>
    <div class="header-actions">
      <AssetUploader
        {bridge}
        scope={uploadScope}
        role={uploadRole}
        activeDeckRef={activeDeckRef ?? undefined}
        activeSoulRef={activeSoulRef ?? undefined}
        onUploaded={handleUploaded}
      />
    </div>
  </div>

  {#if error}
    <div class="error-bar" role="alert">{error}</div>
  {/if}

  <!-- Upload controls row -->
  <div class="upload-context">
    <label class="ctx-label">
      <span>Upload scope</span>
      <select bind:value={uploadScope} class="ctx-select">
        <option value="global">global</option>
        <option value="deck">deck</option>
        <option value="soul">soul</option>
      </select>
    </label>
    <label class="ctx-label">
      <span>Upload role</span>
      <select bind:value={uploadRole} class="ctx-select">
        <option value="content">content</option>
        <option value="logo">logo</option>
        <option value="background">background</option>
        <option value="icon">icon</option>
      </select>
    </label>
  </div>

  <!-- Filter bar -->
  {#if !loading && assets.length > 0}
    <div class="filter-bar">
      <div class="filter-group">
        <span class="filter-label">Scope</span>
        <button
          type="button"
          class={`filter-btn ${scopeFilter === 'all' ? 'active' : ''}`}
          onclick={() => { scopeFilter = 'all'; }}
        >All</button>
        {#each scopes as scope}
          <button
            type="button"
            class={`filter-btn ${scopeFilter === scope ? 'active' : ''}`}
            onclick={() => { scopeFilter = scope; }}
          >{scope}</button>
        {/each}
      </div>
      <div class="filter-group">
        <span class="filter-label">Role</span>
        <button
          type="button"
          class={`filter-btn ${roleFilter === 'all' ? 'active' : ''}`}
          onclick={() => { roleFilter = 'all'; }}
        >All</button>
        {#each roles as role}
          <button
            type="button"
            class={`filter-btn ${roleFilter === role ? 'active' : ''}`}
            onclick={() => { roleFilter = role; }}
          >{role}</button>
        {/each}
      </div>
    </div>
  {/if}

  {#if loading}
    <div class="loading-state">
      <div class="spinner" aria-label="Loading assets"></div>
      <p>Loading assets…</p>
    </div>

  {:else if assets.length === 0}
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.3">
          <rect x="6" y="6" width="16" height="16" rx="3"/>
          <rect x="26" y="6" width="16" height="16" rx="3"/>
          <rect x="6" y="26" width="16" height="16" rx="3"/>
          <rect x="26" y="26" width="16" height="16" rx="3"/>
        </svg>
      </div>
      <p>No assets yet. Upload one using the button above.</p>
    </div>

  {:else if filtered.length === 0}
    <p class="muted">No assets match the selected filters.</p>

  {:else}
    <!-- Grouped sections -->
    {#each [...grouped.entries()] as [scope, items] (scope)}
      <section class="scope-section">
        <h2 class="scope-heading">{scope}</h2>

        <!-- Group by role within scope -->
        {#each [...new Set(items.map((a) => a.role))].sort() as role}
          {@const roleItems = items.filter((a) => a.role === role)}
          <div class="role-group">
            <h3 class="role-heading">{role} <span class="role-count">({roleItems.length})</span></h3>
            <div class="asset-grid">
              {#each roleItems as asset (asset.asset_id)}
                <AssetCard {asset} label={scopeDisplay(asset.scope)} />
              {/each}
            </div>
          </div>
        {/each}
      </section>
    {/each}
  {/if}

</div>

<style>
  .assets-route {
    padding: var(--s-5);
    overflow-y: auto;
    max-height: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }

  /* ── Header ──────────────────────────────────────────────────── */
  .assets-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--s-4);
    flex-wrap: wrap;
  }

  .header-left {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
  }

  h1 {
    font-size: 22px;
    font-weight: 600;
    color: var(--ink-1);
    margin: 0;
  }

  .subtitle {
    font-size: 13px;
    color: var(--ink-3);
    margin: 0;
  }

  .error-bar {
    background: var(--error-tint);
    border: 1px solid var(--error);
    border-radius: var(--r-md);
    padding: var(--s-3) var(--s-4);
    font-size: 13px;
    color: var(--error);
  }

  /* ── Upload context ──────────────────────────────────────────── */
  .upload-context {
    display: flex;
    gap: var(--s-3);
    flex-wrap: wrap;
    align-items: center;
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    padding: var(--s-3) var(--s-4);
  }

  .ctx-label {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    font-size: 12px;
    color: var(--ink-2);
  }

  .ctx-select {
    font-size: 12px;
    color: var(--ink-1);
    background: var(--surface-2);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-sm);
    padding: 2px 8px;
  }

  /* ── Filter bar ──────────────────────────────────────────────── */
  .filter-bar {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: var(--s-1);
    flex-wrap: wrap;
  }

  .filter-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-3);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    min-width: 40px;
  }

  .filter-btn {
    font-size: 12px;
    font-weight: 500;
    padding: 3px 10px;
    border-radius: var(--r-pill);
    color: var(--ink-2);
    border: 1px solid var(--border-subtle);
    background: var(--surface-1);
    cursor: pointer;
    transition: all var(--dur-micro) var(--ease);
    text-transform: capitalize;
  }

  .filter-btn:hover {
    border-color: var(--mint);
    color: var(--mint-hover);
  }

  .filter-btn.active {
    background: var(--mint-tint);
    border-color: var(--mint);
    color: var(--mint-hover);
  }

  /* ── Loading / empty ─────────────────────────────────────────── */
  .loading-state {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    font-size: 13px;
    color: var(--ink-3);
    padding: var(--s-7) 0;
    justify-content: center;
  }

  .spinner {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    border: 2px solid var(--border-subtle);
    border-top-color: var(--mint);
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-4);
    padding: var(--s-9) var(--s-5);
    text-align: center;
    color: var(--ink-3);
    font-size: 13px;
  }

  .empty-icon {
    color: var(--border-subtle);
  }

  .empty-icon svg {
    width: 64px;
    height: 64px;
  }

  .muted {
    font-size: 13px;
    color: var(--ink-3);
    margin: 0;
    padding: var(--s-4) 0;
  }

  /* ── Scope sections ──────────────────────────────────────────── */
  .scope-section {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }

  .scope-heading {
    font-size: 16px;
    font-weight: 600;
    color: var(--ink-1);
    margin: 0;
    padding-bottom: var(--s-2);
    border-bottom: 2px solid var(--border-subtle);
    text-transform: capitalize;
  }

  .role-group {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }

  .role-heading {
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-3);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin: 0;
  }

  .role-count {
    font-weight: 400;
  }

  .asset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--s-3);
  }
</style>
