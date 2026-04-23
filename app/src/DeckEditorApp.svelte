<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Sidebar from './lib/primitives/Sidebar.svelte';
  import Toast from './lib/primitives/Toast.svelte';
  import Editor from './routes/Editor.svelte';
  import Decks from './routes/Decks.svelte';
  import Export from './routes/Export.svelte';
  import { createDeckStore } from './stores/deck.svelte';
  import type { DeckEditorBridge } from './lib/types';
  import type { RevisionPayload } from './lib/types';

  import './styles/globals.css';

  interface Props {
    bridge: DeckEditorBridge;
  }

  let { bridge }: Props = $props();

  // Route state
  let route = $state<'decks' | 'editor' | 'export'>('editor');

  // Create deck store — wraps all bridge-to-state logic.
  // The bridge is a singleton created once at mount; untrack() tells Svelte
  // this one-time capture is intentional and silences the reactivity warning.
  const initialBridge = untrack(() => bridge);
  const deck = createDeckStore(initialBridge);

  // Loading / error display state (before any editor state arrives).
  let loadingLabel = $state('Connecting to deck editor…');
  let errorMessage = $state('');

  onMount(() => {
    const disposeInput = initialBridge.onToolInput((args) => {
      const deckId = typeof args.deck_id === 'string' ? args.deck_id : '';
      const slideId = typeof args.slide_id === 'string' ? args.slide_id : undefined;
      if (!deckId) return;

      // Only auto-load on the first call while we have no state yet.
      if (!deck.editorState) {
        void deck.loadEditor(deckId, slideId);
      }
    });

    const disposeResult = initialBridge.onToolResult((result) => {
      deck.applyIncomingState(result);
    });

    void connectBridge();

    return () => {
      disposeInput();
      disposeResult();
    };
  });

  async function connectBridge(): Promise<void> {
    try {
      await initialBridge.connect();
      loadingLabel = 'Waiting for editor data…';
    } catch (error) {
      deck.loading = false;
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  async function handleRevisionRequest(payload: RevisionPayload): Promise<void> {
    await initialBridge.sendRevisionRequest(payload);
  }

  function handleNav(key: string): void {
    route = key as typeof route;
  }

  function handleOpenDeck(deckId: string): void {
    route = 'editor';
    void deck.loadEditor(deckId);
  }

  const isLoading = $derived(deck.loading && !deck.editorState);
  const hasError = $derived(!!errorMessage && !deck.editorState);
</script>

<svelte:head>
  <title>Pengui Slides Deck Editor</title>
</svelte:head>

{#if isLoading}
  <div class="screen-state">
    <div class="status-card">
      <div class="spinner" aria-hidden="true"></div>
      <p>{loadingLabel}</p>
    </div>
  </div>

{:else if hasError}
  <div class="screen-state">
    <div class="status-card error">
      <h1>Editor failed to load</h1>
      <p>{errorMessage}</p>
    </div>
  </div>

{:else}
  <div class="app-shell">
    <Sidebar
      active={route}
      onNavigate={handleNav}
      wordmark="Pengui"
      sub="Slides"
    />

    <main class="main-area">
      {#if route === 'decks'}
        <Decks {deck} onOpenDeck={handleOpenDeck} />
      {:else if route === 'editor'}
        <Editor {deck} onRevisionRequest={handleRevisionRequest} />
      {:else if route === 'export'}
        <Export {deck} {bridge} />
      {/if}
    </main>
  </div>

  <Toast />
{/if}

<style>
  /* ── Full-page loading / error ─────────────────────────────── */
  .screen-state {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: var(--s-5);
  }

  .status-card {
    max-width: 420px;
    width: 100%;
    text-align: center;
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-xl);
    padding: var(--s-6);
    box-shadow: var(--e3);
  }

  .status-card.error {
    text-align: left;
  }

  .status-card h1 {
    font-size: 18px;
    margin-bottom: var(--s-3);
  }

  .spinner {
    width: 40px;
    height: 40px;
    margin: 0 auto var(--s-4);
    border-radius: var(--r-pill);
    border: 3px solid var(--border-subtle);
    border-top-color: var(--mint);
    animation: spin 0.8s linear infinite;
  }

  /* ── App shell ─────────────────────────────────────────────── */
  .app-shell {
    display: flex;
    height: 100vh;
    overflow: hidden;
    width: 100%;
  }

  .main-area {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: var(--s-3);
    background: var(--canvas);
  }

  /* Route views fill available space */
  .main-area > :global(*) {
    flex: 1;
    min-height: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 560px) {
    .main-area {
      padding: var(--s-2);
    }
  }
</style>
