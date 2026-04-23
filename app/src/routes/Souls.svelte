<!--
  Souls route — full design-soul list, clickable to open SoulPanel.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import SoulPanel from './SoulPanel.svelte';
  import type { McpDeckEditorBridge, SoulListItem } from '../lib/bridge';

  interface Props {
    bridge: McpDeckEditorBridge;
    onOpenSoul?: (soulRef: string) => void;
  }

  let { bridge, onOpenSoul }: Props = $props();

  let souls = $state<SoulListItem[]>([]);
  let loading = $state(true);
  let error = $state('');
  let selectedSoulRef = $state<string | null>(null);

  const selectedSoul = $derived(selectedSoulRef ? souls.find((s) => s.soul_id === selectedSoulRef || s.slug === selectedSoulRef) ?? null : null);

  function selectSoul(ref: string): void {
    selectedSoulRef = ref;
    onOpenSoul?.(ref);
  }

  onMount(() => {
    void load();
  });

  async function load(): Promise<void> {
    loading = true;
    error = '';
    try {
      const result = await bridge.listDesignSouls();
      souls = result.souls;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  function statusLabel(status: string): string {
    switch (status) {
      case 'approved': return 'Approved';
      case 'draft': return 'Draft';
      case 'deprecated': return 'Deprecated';
      default: return status;
    }
  }

  function statusClass(status: string): string {
    switch (status) {
      case 'approved': return 'approved';
      case 'draft': return 'draft';
      case 'deprecated': return 'deprecated';
      default: return '';
    }
  }
</script>

<div class="souls-route">
  <div class="souls-header">
    <h1>Design Souls</h1>
    <p class="subtitle">
      Visual identity systems — token layers, recipes, and style guides.
    </p>
  </div>

  {#if error}
    <div class="error-bar" role="alert">{error}</div>
  {/if}

  {#if loading}
    <div class="loading-state">
      <div class="spinner" aria-label="Loading souls"></div>
      <p>Loading design souls…</p>
    </div>
  {:else if souls.length === 0}
    <p class="muted">No design souls found. Create one via the agent.</p>
  {:else}
    <div class="souls-layout">

      <!-- Soul list -->
      <aside class="soul-list">
        {#each souls as soul (soul.soul_id)}
          <button
            type="button"
            class={`soul-item ${selectedSoulRef === soul.soul_id ? 'selected' : ''} ${statusClass(soul.status)}`}
            onclick={() => selectSoul(soul.soul_id)}
            aria-label="View soul: {soul.name}"
            aria-pressed={selectedSoulRef === soul.soul_id}
          >
            <div class="soul-item-top">
              <span class="soul-name">{soul.name}</span>
              <span class={`status-pill ${statusClass(soul.status)}`}>{statusLabel(soul.status)}</span>
            </div>
            <div class="soul-item-meta">
              <span class="soul-slug">{soul.slug}</span>
              <span class="soul-counts">{soul.token_count} tokens · {soul.recipe_count} recipes</span>
            </div>
          </button>
        {/each}
      </aside>

      <!-- Soul detail panel -->
      <div class="soul-detail">
        {#if selectedSoul}
          <SoulPanel {bridge} soulRef={selectedSoul.soul_id} soulName={selectedSoul.name} />
        {:else}
          <div class="no-selection">
            <div class="no-sel-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.4">
                <rect x="6" y="6" width="36" height="36" rx="6"/>
                <path d="M16 22h16M16 28h10" stroke-linecap="round"/>
              </svg>
            </div>
            <p>Select a soul to view its token layers, recipes, and style guide.</p>
          </div>
        {/if}
      </div>

    </div>
  {/if}
</div>

<style>
  .souls-route {
    padding: var(--s-5);
    overflow-y: auto;
    max-height: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
  }

  .souls-header {
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

  .loading-state {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    font-size: 13px;
    color: var(--ink-3);
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

  .muted {
    font-size: 13px;
    color: var(--ink-3);
    margin: 0;
  }

  /* ── Two-column layout ──────────────────────────────────────── */
  .souls-layout {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: var(--s-4);
    align-items: start;
    flex: 1;
    min-height: 0;
  }

  @media (max-width: 860px) {
    .souls-layout { grid-template-columns: 1fr; }
  }

  /* ── Soul list ──────────────────────────────────────────────── */
  .soul-list {
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .soul-item {
    padding: var(--s-3) var(--s-4);
    border-bottom: 1px solid var(--border-hairline);
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    transition: background-color var(--dur-micro) var(--ease);
  }

  .soul-item:last-child { border-bottom: none; }

  .soul-item:hover {
    background: var(--surface-2);
  }

  .soul-item.selected {
    background: var(--mint-tint);
  }

  .soul-item:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--mint);
  }

  .soul-item-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
  }

  .soul-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink-1);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-pill {
    font-size: 10px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: var(--r-pill);
    flex-shrink: 0;
    text-transform: capitalize;
  }

  .status-pill.approved {
    background: var(--success-tint);
    color: var(--success);
  }

  .status-pill.draft {
    background: var(--warning-tint);
    color: var(--warning);
  }

  .status-pill.deprecated {
    background: var(--surface-2);
    color: var(--ink-3);
  }

  .soul-item-meta {
    display: flex;
    gap: var(--s-3);
    align-items: center;
  }

  .soul-slug {
    font-size: 11px;
    color: var(--ink-3);
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .soul-counts {
    font-size: 11px;
    color: var(--ink-3);
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* ── Soul detail panel ──────────────────────────────────────── */
  .soul-detail {
    min-width: 0;
  }

  .no-selection {
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--s-4);
    padding: var(--s-9) var(--s-5);
    text-align: center;
    color: var(--ink-3);
    font-size: 13px;
  }

  .no-sel-icon {
    color: var(--border-subtle);
  }

  .no-sel-icon svg {
    width: 64px;
    height: 64px;
  }
</style>
