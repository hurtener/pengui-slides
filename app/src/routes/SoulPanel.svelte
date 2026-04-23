<!--
  SoulPanel — detailed view of one design soul.
  READ-ONLY in Wave 2 (edit UI is Wave 3).

  Shows:
  - Token swatches grouped by layer
  - Recipe previews (sandboxed iframe)
  - StyleGuide markdown rendered as plain text sections
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import TokenSwatch from '../lib/TokenSwatch.svelte';
  import RecipePreview from '../lib/RecipePreview.svelte';
  import type { McpDeckEditorBridge, DesignSoul } from '../lib/bridge';

  interface Props {
    bridge: McpDeckEditorBridge;
    soulRef: string;
    soulName?: string;
  }

  let { bridge, soulRef, soulName }: Props = $props();

  let soul = $state<DesignSoul | null>(null);
  let loading = $state(true);
  let error = $state('');
  let activeTab = $state<'tokens' | 'recipes' | 'guide'>('tokens');
  let activeLayer = $state<string | null>(null);

  onMount(() => {
    void load();
  });

  // Reload when soulRef changes
  $effect(() => {
    // Track soulRef so effect re-runs on change
    const ref = soulRef;
    if (ref) {
      void load();
    }
  });

  async function load(): Promise<void> {
    loading = true;
    error = '';
    soul = null;
    activeLayer = null;
    try {
      const result = await bridge.getDesignSoul(soulRef);
      soul = result.soul;
      if (soul.layers.length > 0) {
        activeLayer = soul.layers[0].name;
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  const currentLayer = $derived(
    soul?.layers.find((l) => l.name === activeLayer) ?? null
  );

  const currentTokenEntries = $derived(
    currentLayer ? Object.entries(currentLayer.tokens) : []
  );

  // Convert markdown-ish styleGuide text to sections for display.
  // Very lightweight — just splits by headings (##).
  function parseGuide(text: string): { heading: string; body: string }[] {
    const sections: { heading: string; body: string }[] = [];
    const lines = text.split('\n');
    let current: { heading: string; body: string } | null = null;
    for (const line of lines) {
      if (line.startsWith('## ')) {
        if (current) sections.push(current);
        current = { heading: line.replace(/^##+ /, ''), body: '' };
      } else if (line.startsWith('# ')) {
        if (current) sections.push(current);
        current = { heading: line.replace(/^#+ /, ''), body: '' };
      } else {
        if (current) {
          current.body += (current.body ? '\n' : '') + line;
        } else if (line.trim()) {
          current = { heading: '', body: line };
        }
      }
    }
    if (current) sections.push(current);
    return sections.filter((s) => s.heading || s.body.trim());
  }

  const guideSections = $derived(soul?.styleGuide ? parseGuide(soul.styleGuide) : []);
</script>

<div class="soul-panel">

  {#if loading}
    <div class="loading-state">
      <div class="spinner" aria-label="Loading soul"></div>
      <p>Loading {soulName ?? 'soul'}…</p>
    </div>

  {:else if error}
    <div class="error-bar" role="alert">{error}</div>

  {:else if soul}

    <!-- Header -->
    <div class="soul-head">
      <div class="soul-head-left">
        <h2>{soul.name}</h2>
        <span class={`status-pill ${soul.status}`}>{soul.status}</span>
      </div>
      <p class="soul-slug">{soul.slug}</p>
    </div>

    <!-- Tabs -->
    <div class="tab-bar" role="tablist">
      <button
        type="button"
        role="tab"
        class={`tab ${activeTab === 'tokens' ? 'active' : ''}`}
        aria-selected={activeTab === 'tokens'}
        onclick={() => { activeTab = 'tokens'; }}
      >
        Tokens ({soul.layers.reduce((n, l) => n + Object.keys(l.tokens).length, 0)})
      </button>
      <button
        type="button"
        role="tab"
        class={`tab ${activeTab === 'recipes' ? 'active' : ''}`}
        aria-selected={activeTab === 'recipes'}
        onclick={() => { activeTab = 'recipes'; }}
      >
        Recipes ({soul.recipes.length})
      </button>
      {#if soul.styleGuide}
        <button
          type="button"
          role="tab"
          class={`tab ${activeTab === 'guide' ? 'active' : ''}`}
          aria-selected={activeTab === 'guide'}
          onclick={() => { activeTab = 'guide'; }}
        >
          Style Guide
        </button>
      {/if}
    </div>

    <!-- Tab panels -->
    <div class="tab-panel" role="tabpanel">

      {#if activeTab === 'tokens'}
        <div class="tokens-layout">
          <!-- Layer picker -->
          {#if soul.layers.length > 1}
            <div class="layer-tabs">
              {#each soul.layers as layer (layer.name)}
                <button
                  type="button"
                  class={`layer-tab ${activeLayer === layer.name ? 'active' : ''}`}
                  onclick={() => { activeLayer = layer.name; }}
                >
                  {layer.name}
                  <span class="layer-count">{Object.keys(layer.tokens).length}</span>
                </button>
              {/each}
            </div>
          {/if}

          {#if currentTokenEntries.length === 0}
            <p class="muted">No tokens in this layer.</p>
          {:else}
            <div class="token-list">
              {#each currentTokenEntries as [name, value] (name)}
                <TokenSwatch {name} {value} layer={activeLayer ?? ''} />
              {/each}
            </div>
          {/if}
        </div>

      {:else if activeTab === 'recipes'}
        {#if soul.recipes.length === 0}
          <p class="muted">No recipes defined for this soul.</p>
        {:else}
          <div class="recipe-list">
            {#each soul.recipes as recipe (recipe.id)}
              <RecipePreview {recipe} />
            {/each}
          </div>
        {/if}

      {:else if activeTab === 'guide'}
        {#if guideSections.length === 0}
          <p class="muted">No style guide content.</p>
        {:else}
          <div class="guide-content">
            {#each guideSections as section, i (i)}
              {#if section.heading}
                <h3 class="guide-heading">{section.heading}</h3>
              {/if}
              {#if section.body.trim()}
                <p class="guide-body">{section.body.trim()}</p>
              {/if}
            {/each}
          </div>
        {/if}
      {/if}

    </div>

  {/if}
</div>

<style>
  .soul-panel {
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 400px;
  }

  /* Loading / error */
  .loading-state {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-7) var(--s-5);
    font-size: 13px;
    color: var(--ink-3);
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

  .error-bar {
    margin: var(--s-4);
    background: var(--error-tint);
    border: 1px solid var(--error);
    border-radius: var(--r-md);
    padding: var(--s-3) var(--s-4);
    font-size: 13px;
    color: var(--error);
  }

  /* Soul header */
  .soul-head {
    padding: var(--s-4) var(--s-5) var(--s-3);
    border-bottom: 1px solid var(--border-hairline);
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
  }

  .soul-head-left {
    display: flex;
    align-items: center;
    gap: var(--s-2);
  }

  h2 {
    font-size: 18px;
    font-weight: 600;
    color: var(--ink-1);
    margin: 0;
  }

  .status-pill {
    font-size: 10px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: var(--r-pill);
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

  .soul-slug {
    font-size: 12px;
    color: var(--ink-3);
    font-family: var(--font-mono);
    margin: 0;
  }

  /* Tabs */
  .tab-bar {
    display: flex;
    gap: var(--s-1);
    padding: var(--s-2) var(--s-4);
    border-bottom: 1px solid var(--border-hairline);
  }

  .tab {
    font-size: 13px;
    font-weight: 500;
    padding: var(--s-1) var(--s-3);
    border-radius: var(--r-pill);
    color: var(--ink-2);
    transition: background-color var(--dur-micro) var(--ease);
  }

  .tab:hover {
    background: var(--surface-2);
  }

  .tab.active {
    background: var(--mint-tint);
    color: var(--mint-hover);
  }

  /* Tab panel */
  .tab-panel {
    padding: var(--s-4) var(--s-5);
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    max-height: 600px;
  }

  .muted {
    font-size: 13px;
    color: var(--ink-3);
    margin: 0;
  }

  /* Tokens tab */
  .tokens-layout {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }

  .layer-tabs {
    display: flex;
    gap: var(--s-1);
    flex-wrap: wrap;
  }

  .layer-tab {
    display: inline-flex;
    align-items: center;
    gap: var(--s-1);
    font-size: 12px;
    font-weight: 500;
    padding: var(--s-1) var(--s-3);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-pill);
    color: var(--ink-2);
    background: var(--surface-1);
    cursor: pointer;
    transition: all var(--dur-micro) var(--ease);
    text-transform: capitalize;
  }

  .layer-tab:hover {
    border-color: var(--mint);
    color: var(--mint-hover);
  }

  .layer-tab.active {
    background: var(--mint-tint);
    border-color: var(--mint);
    color: var(--mint-hover);
  }

  .layer-count {
    font-size: 10px;
    color: inherit;
    opacity: 0.7;
    background: rgba(0,0,0,0.06);
    padding: 1px 6px;
    border-radius: var(--r-pill);
  }

  .token-list {
    display: flex;
    flex-direction: column;
  }

  /* Recipes tab */
  .recipe-list {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }

  /* Guide tab */
  .guide-content {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }

  .guide-heading {
    font-size: 15px;
    font-weight: 600;
    color: var(--ink-1);
    margin: 0;
    padding-top: var(--s-2);
    border-top: 1px solid var(--border-hairline);
  }

  .guide-heading:first-child {
    border-top: none;
    padding-top: 0;
  }

  .guide-body {
    font-size: 13px;
    color: var(--ink-2);
    line-height: 1.65;
    margin: 0;
    white-space: pre-wrap;
  }
</style>
