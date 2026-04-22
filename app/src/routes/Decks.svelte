<!--
  Decks route — Deck library.

  NOTE: The backend does not expose a `list_decks` tool (checked: src/tools/decks/ has
  no list-decks.tool.ts). Fallback: show the currently-open deck as a single card with
  a note explaining the limitation.
-->
<script lang="ts">
  import Card from '../lib/primitives/Card.svelte';
  import Button from '../lib/primitives/Button.svelte';
  import FormatBadge from '../lib/FormatBadge.svelte';
  import type { DeckStore } from '../stores/deck.svelte';
  import type { FormatKind } from '../lib/types';

  interface Props {
    deck: DeckStore;
    onOpenDeck?: (deckId: string) => void;
  }

  let { deck, onOpenDeck }: Props = $props();

  const state = $derived(deck.editorState);
  const deckFormat = $derived<FormatKind>(state?.deck.format ?? 'slides_16_9');

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
    } catch {
      return iso;
    }
  }
</script>

<div class="decks-route">
  <div class="decks-header">
    <h1>Decks</h1>
    <p class="subtitle">
      Deck library coming soon — pass a <code>deck_id</code> via
      <code>open_deck_editor</code> to select a different deck.
    </p>
  </div>

  {#if state}
    <div class="deck-grid">
      <button
        type="button"
        class="deck-card-btn"
        onclick={() => onOpenDeck?.(state.deck.id)}
        aria-label="Open deck: {state.deck.title}"
      >
        <Card padding="none" elevation="e2" class="deck-card">
          <div class="deck-thumb">
            {#if state.thumbnails?.[0]}
              <img
                alt="First slide of {state.deck.title}"
                src="data:image/png;base64,{state.thumbnails[0].imageBase64}"
                class={deckFormat === 'slides_16_9' ? 'thumb-landscape' : 'thumb-portrait'}
              />
            {:else}
              <div class="thumb-placeholder">
                <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
                  <rect x="4" y="5" width="24" height="18" rx="2.5" />
                  <path d="M8 11h16M8 15h10" stroke-linecap="round" />
                </svg>
              </div>
            {/if}
          </div>
          <div class="deck-meta">
            <div class="deck-meta-top">
              <h2 class="deck-title">{state.deck.title}</h2>
              <FormatBadge format={deckFormat} size="sm" />
            </div>
            <div class="deck-meta-bottom">
              <span class="meta-item">{state.deck.slideCount} {deckFormat === 'slides_16_9' ? 'slides' : 'pages'}</span>
              {#if state.deck.updatedAt}
                <span class="meta-item">Updated {formatDate(state.deck.updatedAt)}</span>
              {/if}
              {#if state.deck.author}
                <span class="meta-item">by {state.deck.author}</span>
              {/if}
            </div>
          </div>
        </Card>
      </button>
    </div>
  {:else if deck.loading}
    <div class="empty-state">
      <div class="spinner" aria-label="Loading…"></div>
      <p>Loading deck…</p>
    </div>
  {:else}
    <div class="empty-state">
      <p class="muted">No deck loaded yet. Send an <code>open_deck_editor</code> call to get started.</p>
    </div>
  {/if}
</div>

<style>
  .decks-route {
    padding: var(--s-5);
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
    overflow-y: auto;
    max-height: 100%;
  }

  .decks-header {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }

  h1 {
    font-size: 22px;
    font-weight: 600;
    color: var(--ink-1);
  }

  .subtitle {
    font-size: 13px;
    color: var(--ink-3);
    line-height: 1.6;
  }

  .subtitle code {
    background: var(--surface-2);
    border-radius: var(--r-sm);
    padding: 2px 6px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ink-2);
  }

  .deck-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--s-4);
  }

  .deck-card-btn {
    text-align: left;
    display: block;
    width: 100%;
    border-radius: var(--r-lg);
    transition: transform var(--dur-micro) var(--ease);
  }

  .deck-card-btn:hover {
    transform: translateY(-2px);
  }

  .deck-card-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--mint-tint);
    border-radius: var(--r-lg);
  }

  :global(.deck-card) {
    overflow: hidden;
    cursor: pointer;
  }

  .deck-thumb {
    background: var(--surface-2);
    border-bottom: 1px solid var(--border-hairline);
    overflow: hidden;
    border-radius: var(--r-lg) var(--r-lg) 0 0;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 140px;
  }

  .thumb-landscape {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    display: block;
  }

  .thumb-portrait {
    width: 100%;
    aspect-ratio: 1240 / 1754;
    object-fit: cover;
    display: block;
    max-height: 200px;
    object-position: top;
  }

  .thumb-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 140px;
    color: var(--ink-3);
  }

  .thumb-placeholder svg {
    width: 48px;
    height: 48px;
    opacity: 0.4;
  }

  .deck-meta {
    padding: var(--s-4) var(--s-4) var(--s-4);
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }

  .deck-meta-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--s-2);
  }

  .deck-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--ink-1);
    line-height: 1.3;
    flex: 1;
    min-width: 0;
  }

  .deck-meta-bottom {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }

  .meta-item {
    font-size: 12px;
    color: var(--ink-3);
  }

  .meta-item + .meta-item::before {
    content: '·';
    margin-right: var(--s-2);
    color: var(--border-subtle);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-4);
    padding: var(--s-8) var(--s-5);
    text-align: center;
  }

  .spinner {
    width: 36px;
    height: 36px;
    border-radius: var(--r-pill);
    border: 3px solid var(--border-subtle);
    border-top-color: var(--mint);
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .muted {
    color: var(--ink-3);
    font-size: 13px;
  }

  .muted code {
    background: var(--surface-2);
    border-radius: var(--r-sm);
    padding: 2px 6px;
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--ink-2);
  }
</style>
