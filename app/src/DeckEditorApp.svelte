<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Sidebar from './lib/primitives/Sidebar.svelte';
  import Toast from './lib/primitives/Toast.svelte';
  import Editor from './routes/Editor.svelte';
  import DocumentEditor from './routes/DocumentEditor.svelte';
  import Decks from './routes/Decks.svelte';
  import Export from './routes/Export.svelte';
  import Workspace from './routes/Workspace.svelte';
  import Souls from './routes/Souls.svelte';
  import Assets from './routes/Assets.svelte';
  import { createDeckStore } from './stores/deck.svelte';
  import type { DeckEditorBridge } from './lib/types';
  import type { RevisionPayload } from './lib/types';
  import type { McpDeckEditorBridge } from './lib/bridge';

  import './styles/globals.css';

  interface Props {
    bridge: DeckEditorBridge;
  }

  let { bridge }: Props = $props();

  // Route state — extended with v4 workspace routes
  let route = $state<'workspace' | 'decks' | 'editor' | 'export' | 'souls' | 'assets'>('workspace');

  // v4 sidebar nav items
  const navItems = [
    { key: 'workspace', label: 'Workspace', icon: 'library' as const },
    { key: 'editor',    label: 'Editor',    icon: 'plus' as const },
    { key: 'souls',     label: 'Souls',     icon: 'cog' as const },
    { key: 'assets',    label: 'Assets',    icon: 'cog' as const },
    { key: 'export',    label: 'Export',    icon: 'cog' as const },
  ];

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
      // Auto-navigate to editor when the host pushes editor state (e.g. via
      // open_deck_editor). This preserves pre-v4 behaviour while keeping
      // workspace as the default landing page for direct opens.
      const payload = result.structuredContent;
      if (payload && typeof payload === 'object' && 'editor_state' in payload && payload.editor_state) {
        route = 'editor';
        // Pick up the deck reference + authoring model from the pushed state
        // so document-mode decks open in the DocumentEditor, not the slide one.
        const deckId =
          typeof (payload as { deck_id?: unknown }).deck_id === 'string'
            ? ((payload as { deck_id: string }).deck_id)
            : null;
        if (deckId) {
          activeDeckRef = deckId;
          void resolveAuthoringModelFor(deckId);
        }
      }
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

  // v4: active-workspace tracking so Assets scopes uploads correctly and the
  // agent's `get_session` reflects what the user is looking at.
  let activeDeckRef = $state<string | null>(null);
  let activeSoulRef = $state<string | null>(null);

  function handleNav(key: string): void {
    route = key as typeof route;
    // Fire-and-forget: tell the server which panels are open. Failure here
    // does not block navigation.
    void announceSession();
  }

  // v4: authoring model of the currently-open deck. Drives the Editor route
  // selection (slide-mode Editor vs document-mode DocumentEditor).
  let activeAuthoringModel = $state<'slides' | 'document' | null>(null);

  function handleOpenDeck(deckId: string): void {
    route = 'editor';
    activeDeckRef = deckId;
    void resolveAuthoringModelFor(deckId);
    void deck.loadEditor(deckId);
    void announceSession();
  }

  async function resolveAuthoringModelFor(deckRef: string): Promise<void> {
    const mcp = bridge as unknown as McpDeckEditorBridge;
    if (typeof mcp.callTool !== 'function') return;
    try {
      const r = await mcp.callTool<{ authoring_model?: 'slides' | 'document' }>(
        'get_deck_summary',
        { deck_id: deckRef },
      );
      const model = r.structuredContent?.authoring_model;
      activeAuthoringModel = model === 'document' ? 'document' : 'slides';
    } catch {
      activeAuthoringModel = 'slides';
    }
  }

  function handleOpenSoul(soulRef: string): void {
    route = 'souls';
    activeSoulRef = soulRef;
    void announceSession();
  }

  async function announceSession(): Promise<void> {
    const mcp = bridge as unknown as McpDeckEditorBridge;
    // Only the concrete bridge has setActiveWorkspace; older test doubles
    // may not. Guard defensively.
    if (typeof mcp.setActiveWorkspace !== 'function') return;
    try {
      await mcp.setActiveWorkspace({
        deck_ref: activeDeckRef ?? undefined,
        soul_ref: activeSoulRef ?? undefined,
        open_panels: [route],
      });
    } catch {
      // Session announcement is best-effort; swallow and continue.
    }
  }

  // Cast bridge to the concrete class type so v4 route components can use
  // the new typed methods. The bridge prop is typed as the interface for
  // test compatibility; at runtime it will always be McpDeckEditorBridge.
  const mcpBridge = $derived(bridge as unknown as McpDeckEditorBridge);

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
      items={navItems}
    />

    <main class="main-area">
      {#if route === 'workspace'}
        <Workspace bridge={mcpBridge} onOpenDeck={handleOpenDeck} onNavigate={handleNav} />
      {:else if route === 'decks'}
        <Decks {deck} onOpenDeck={handleOpenDeck} />
      {:else if route === 'editor'}
        {#if activeAuthoringModel === 'document' && activeDeckRef}
          <DocumentEditor bridge={mcpBridge} deckRef={activeDeckRef} />
        {:else}
          <Editor
            {deck}
            bridge={mcpBridge}
            onRevisionRequest={handleRevisionRequest}
          />
        {/if}
      {:else if route === 'export'}
        <Export {deck} {bridge} />
      {:else if route === 'souls'}
        <Souls bridge={mcpBridge} onOpenSoul={handleOpenSoul} />
      {:else if route === 'assets'}
        <Assets
          bridge={mcpBridge}
          activeDeckRef={activeDeckRef}
          activeSoulRef={activeSoulRef}
        />
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
