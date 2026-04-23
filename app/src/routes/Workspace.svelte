<!--
  Workspace route — landing page for v4.
  Shows:
  - Decks list (newest first)
  - Design souls list (approved highlighted)
  - Quick-link to Assets route
  - Compact unresolved comments summary for the active deck

  Uses list_decks + list_design_souls + list_comments via bridge.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Card from '../lib/primitives/Card.svelte';
  import FormatBadge from '../lib/FormatBadge.svelte';
  import type { McpDeckEditorBridge, DeckListItem, SoulListItem, CommentItem } from '../lib/bridge';
  import type { FormatKind } from '../lib/types';
  import { targetLabel, kindClass } from '../lib/commentUtils';

  interface Props {
    bridge: McpDeckEditorBridge;
    onOpenDeck?: (deckId: string) => void;
    onNavigate?: (route: string) => void;
  }

  let { bridge, onOpenDeck, onNavigate }: Props = $props();

  // ── Data state ──────────────────────────────────────────────────────────

  let decks = $state<DeckListItem[]>([]);
  let souls = $state<SoulListItem[]>([]);
  let comments = $state<CommentItem[]>([]);
  let activeDeckId = $state<string | null>(null);

  let loadingDecks = $state(true);
  let loadingSouls = $state(true);
  let loadingComments = $state(false);
  let error = $state('');

  // ── Derived ─────────────────────────────────────────────────────────────

  const unresolvedComments = $derived(comments.filter((c) => !c.resolved_at));

  const approvedSouls = $derived(souls.filter((s) => s.status === 'approved'));
  const otherSouls = $derived(souls.filter((s) => s.status !== 'approved'));

  // ── Load ─────────────────────────────────────────────────────────────────

  onMount(() => {
    void loadAll();
  });

  async function loadAll(): Promise<void> {
    await Promise.all([loadDecks(), loadSouls(), loadSession()]);
  }

  async function loadDecks(): Promise<void> {
    loadingDecks = true;
    try {
      const result = await bridge.listDecks();
      // Sort newest first
      decks = [...result.decks].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      );
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loadingDecks = false;
    }
  }

  async function loadSouls(): Promise<void> {
    loadingSouls = true;
    try {
      const result = await bridge.listDesignSouls();
      souls = result.souls;
    } catch {
      // souls are optional — fail gracefully
      souls = [];
    } finally {
      loadingSouls = false;
    }
  }

  async function loadSession(): Promise<void> {
    try {
      const session = await bridge.getSession();
      if (session.active_deck) {
        activeDeckId = session.active_deck.id;
        await loadComments(activeDeckId);
      }
    } catch {
      // session optional
    }
  }

  async function loadComments(deckId: string): Promise<void> {
    loadingComments = true;
    try {
      const result = await bridge.listComments(deckId);
      comments = result.comments;
    } catch {
      comments = [];
    } finally {
      loadingComments = false;
    }
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
    } catch {
      return iso;
    }
  }

  function deckFormatLabel(format: string): FormatKind {
    const valid: FormatKind[] = ['slides_16_9', 'print_a4_portrait', 'print_letter_portrait'];
    return valid.includes(format as FormatKind) ? (format as FormatKind) : 'slides_16_9';
  }

  function deckSlideLabel(d: DeckListItem): string {
    const isPrint = d.format !== 'slides_16_9';
    return `${d.slide_count} ${isPrint ? 'pages' : 'slides'}`;
  }
</script>

<div class="workspace">

  <!-- ── Header ──────────────────────────────────────────────────── -->
  <div class="ws-header">
    <div class="ws-title-block">
      <h1>Workspace</h1>
      <p class="subtitle">Your decks, design souls, and assets in one place.</p>
    </div>
    {#if unresolvedComments.length > 0}
      <div class="comment-badge" role="status" aria-label="{unresolvedComments.length} unresolved comments">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M14 2H2a1 1 0 00-1 1v8a1 1 0 001 1h3l2 2 2-2h5a1 1 0 001-1V3a1 1 0 00-1-1z" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span>{unresolvedComments.length} open</span>
      </div>
    {/if}
  </div>

  {#if error}
    <div class="error-bar" role="alert">{error}</div>
  {/if}

  <!-- ── Two-column layout ──────────────────────────────────────── -->
  <div class="ws-grid">

    <!-- Left: Decks -->
    <section class="ws-section decks-section">
      <div class="section-head">
        <h2 class="section-title">Decks</h2>
        {#if !loadingDecks}
          <span class="count-badge">{decks.length}</span>
        {/if}
      </div>

      {#if loadingDecks}
        <div class="loading-row">
          <div class="spinner" aria-label="Loading decks"></div>
          <span>Loading decks…</span>
        </div>
      {:else if decks.length === 0}
        <p class="muted">No decks found. Create one via the agent.</p>
      {:else}
        <div class="deck-list">
          {#each decks as deck (deck.id)}
            <button
              type="button"
              class={`deck-row ${activeDeckId === deck.id ? 'active-deck' : ''}`}
              onclick={() => onOpenDeck?.(deck.id)}
              aria-label="Open deck: {deck.title}"
            >
              <div class="deck-thumb-mini">
                <svg viewBox="0 0 24 18" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
                  <rect x="1" y="1" width="22" height="16" rx="2"/>
                  <path d="M4 5h16M4 9h10" stroke-linecap="round"/>
                </svg>
              </div>
              <div class="deck-info">
                <div class="deck-info-top">
                  <span class="deck-name">{deck.title}</span>
                  <FormatBadge format={deckFormatLabel(deck.format)} size="sm" />
                </div>
                <div class="deck-meta-row">
                  <span class="meta-item">{deckSlideLabel(deck)}</span>
                  {#if deck.author}
                    <span class="meta-item">{deck.author}</span>
                  {/if}
                  <span class="meta-item">{formatDate(deck.updated_at)}</span>
                </div>
              </div>
              {#if activeDeckId === deck.id}
                <span class="active-pip" aria-label="Active deck"></span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </section>

    <!-- Right: Souls + Assets shortcut + Comments -->
    <div class="ws-right">

      <!-- Souls -->
      <section class="ws-section">
        <div class="section-head">
          <h2 class="section-title">Design Souls</h2>
          <button
            type="button"
            class="see-all-btn"
            onclick={() => onNavigate?.('souls')}
          >
            See all
          </button>
        </div>

        {#if loadingSouls}
          <div class="loading-row">
            <div class="spinner" aria-label="Loading souls"></div>
            <span>Loading…</span>
          </div>
        {:else if souls.length === 0}
          <p class="muted">No design souls found.</p>
        {:else}
          <div class="soul-list">
            {#each approvedSouls as soul (soul.soul_id)}
              <button
                type="button"
                class="soul-row approved"
                onclick={() => onNavigate?.('souls')}
                aria-label="View soul: {soul.name}"
              >
                <span class="soul-dot approved-dot" aria-hidden="true"></span>
                <span class="soul-name">{soul.name}</span>
                <span class="soul-meta">{soul.token_count}t · {soul.recipe_count}r</span>
              </button>
            {/each}
            {#each otherSouls.slice(0, 3) as soul (soul.soul_id)}
              <button
                type="button"
                class="soul-row"
                onclick={() => onNavigate?.('souls')}
                aria-label="View soul: {soul.name}"
              >
                <span class="soul-dot" aria-hidden="true"></span>
                <span class="soul-name">{soul.name}</span>
                <span class="soul-meta">{soul.status}</span>
              </button>
            {/each}
            {#if otherSouls.length > 3}
              <p class="muted-sm">+{otherSouls.length - 3} more — <button type="button" class="inline-link" onclick={() => onNavigate?.('souls')}>view all</button></p>
            {/if}
          </div>
        {/if}
      </section>

      <!-- Assets quick-link -->
      <button
        type="button"
        class="assets-card"
        onclick={() => onNavigate?.('assets')}
        aria-label="Open asset library"
      >
        <div class="assets-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="8" height="8" rx="1.5"/>
            <rect x="13" y="3" width="8" height="8" rx="1.5"/>
            <rect x="3" y="13" width="8" height="8" rx="1.5"/>
            <rect x="13" y="13" width="8" height="8" rx="1.5"/>
          </svg>
        </div>
        <div class="assets-label">
          <span class="assets-title">Asset Library</span>
          <span class="assets-sub">Logos, images, uploads</span>
        </div>
        <svg class="assets-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
          <path d="M6 4l4 4-4 4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <!-- Comments summary -->
      {#if activeDeckId}
        <section class="ws-section comments-section">
          <div class="section-head">
            <h2 class="section-title">Comments</h2>
            {#if loadingComments}
              <span class="spinner-xs" aria-label="Loading"></span>
            {:else}
              <span class="count-badge {unresolvedComments.length > 0 ? 'alert' : ''}">{unresolvedComments.length} open</span>
            {/if}
          </div>

          {#if unresolvedComments.length === 0 && !loadingComments}
            <p class="muted">No open comments for the active deck.</p>
          {:else}
            <ul class="comment-list">
              {#each unresolvedComments.slice(0, 4) as c (c.id)}
                <li class="comment-row">
                  <span class={`c-dot ${kindClass(c.kind)}`} aria-hidden="true"></span>
                  <div class="c-info">
                    <span class="c-author">{c.author}</span>
                    <p class="c-body">{c.body}</p>
                    <span class="c-target">{targetLabel(c.target)}</span>
                  </div>
                </li>
              {/each}
              {#if unresolvedComments.length > 4}
                <li class="comment-more">+{unresolvedComments.length - 4} more</li>
              {/if}
            </ul>
          {/if}
        </section>
      {/if}

    </div>
  </div>
</div>

<style>
  .workspace {
    padding: var(--s-5);
    overflow-y: auto;
    max-height: 100%;
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
  }

  /* ── Header ──────────────────────────────────────────────────── */
  .ws-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--s-4);
    flex-wrap: wrap;
  }

  .ws-title-block {
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

  .comment-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--s-1);
    font-size: 12px;
    font-weight: 500;
    color: var(--warning);
    background: var(--warning-tint);
    padding: var(--s-1) var(--s-3);
    border-radius: var(--r-pill);
  }

  .comment-badge svg {
    width: 14px;
    height: 14px;
  }

  .error-bar {
    background: var(--error-tint);
    border: 1px solid var(--error);
    border-radius: var(--r-md);
    padding: var(--s-3) var(--s-4);
    font-size: 13px;
    color: var(--error);
  }

  /* ── Two-column layout ──────────────────────────────────────── */
  .ws-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: var(--s-4);
    align-items: start;
  }

  @media (max-width: 900px) {
    .ws-grid { grid-template-columns: 1fr; }
  }

  .ws-right {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }

  /* ── Section wrapper ──────────────────────────────────────────── */
  .ws-section {
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
    overflow: hidden;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-4) var(--s-3);
    border-bottom: 1px solid var(--border-hairline);
  }

  h2.section-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-2);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    margin: 0;
  }

  .count-badge {
    font-size: 11px;
    font-weight: 500;
    color: var(--ink-3);
    background: var(--surface-2);
    padding: 2px 8px;
    border-radius: var(--r-pill);
  }

  .count-badge.alert {
    color: var(--warning);
    background: var(--warning-tint);
  }

  .see-all-btn {
    font-size: 12px;
    color: var(--mint-hover);
    font-weight: 500;
    padding: 2px 8px;
    border-radius: var(--r-pill);
    transition: background-color var(--dur-micro) var(--ease);
  }

  .see-all-btn:hover {
    background: var(--mint-tint);
  }

  /* ── Loading state ──────────────────────────────────────────── */
  .loading-row {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-4) var(--s-4);
    font-size: 13px;
    color: var(--ink-3);
  }

  .spinner {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid var(--border-subtle);
    border-top-color: var(--mint);
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  .spinner-xs {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid var(--border-subtle);
    border-top-color: var(--mint);
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .muted {
    font-size: 13px;
    color: var(--ink-3);
    padding: var(--s-4) var(--s-4);
    margin: 0;
  }

  .muted-sm {
    font-size: 12px;
    color: var(--ink-3);
    padding: var(--s-2) var(--s-4);
    margin: 0;
  }

  .inline-link {
    color: var(--mint-hover);
    text-decoration: underline;
    cursor: pointer;
  }

  /* ── Deck list ──────────────────────────────────────────────── */
  .deck-list {
    display: flex;
    flex-direction: column;
  }

  .deck-row {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-4);
    border-bottom: 1px solid var(--border-hairline);
    text-align: left;
    transition: background-color var(--dur-micro) var(--ease);
    cursor: pointer;
    position: relative;
  }

  .deck-row:last-child {
    border-bottom: none;
  }

  .deck-row:hover {
    background: var(--surface-2);
  }

  .deck-row:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--mint);
  }

  .deck-row.active-deck {
    background: var(--mint-tint);
  }

  .deck-thumb-mini {
    flex-shrink: 0;
    width: 40px;
    height: 30px;
    background: var(--surface-2);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink-3);
  }

  .deck-thumb-mini svg {
    width: 28px;
    height: 20px;
  }

  .deck-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
  }

  .deck-info-top {
    display: flex;
    align-items: center;
    gap: var(--s-2);
  }

  .deck-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink-1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  .deck-meta-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
  }

  .meta-item {
    font-size: 11px;
    color: var(--ink-3);
  }

  .meta-item + .meta-item::before {
    content: '·';
    margin-right: var(--s-2);
    color: var(--border-subtle);
  }

  .active-pip {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--mint);
    flex-shrink: 0;
  }

  /* ── Soul list ──────────────────────────────────────────────── */
  .soul-list {
    display: flex;
    flex-direction: column;
  }

  .soul-row {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-2) var(--s-4);
    border-bottom: 1px solid var(--border-hairline);
    text-align: left;
    cursor: pointer;
    transition: background-color var(--dur-micro) var(--ease);
  }

  .soul-row:last-child {
    border-bottom: none;
  }

  .soul-row:hover {
    background: var(--surface-2);
  }

  .soul-row.approved {
    background: color-mix(in srgb, var(--success-tint) 30%, transparent);
  }

  .soul-row.approved:hover {
    background: var(--success-tint);
  }

  .soul-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border-subtle);
    flex-shrink: 0;
  }

  .approved-dot {
    background: var(--success);
  }

  .soul-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--ink-1);
    flex: 1;
  }

  .soul-meta {
    font-size: 11px;
    color: var(--ink-3);
  }

  /* ── Assets quick-link card ───────────────────────────────── */
  .assets-card {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
    padding: var(--s-3) var(--s-4);
    text-align: left;
    cursor: pointer;
    transition:
      box-shadow var(--dur-micro) var(--ease),
      border-color var(--dur-micro) var(--ease);
    width: 100%;
  }

  .assets-card:hover {
    border-color: var(--mint);
    box-shadow: var(--e2);
  }

  .assets-card:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--mint-tint);
  }

  .assets-icon {
    width: 36px;
    height: 36px;
    background: var(--mint-tint);
    border-radius: var(--r-md);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--mint);
    flex-shrink: 0;
  }

  .assets-icon svg {
    width: 18px;
    height: 18px;
  }

  .assets-label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .assets-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink-1);
  }

  .assets-sub {
    font-size: 12px;
    color: var(--ink-3);
  }

  .assets-arrow {
    width: 16px;
    height: 16px;
    color: var(--ink-3);
    flex-shrink: 0;
  }

  /* ── Comments summary ───────────────────────────────────────── */
  .comment-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .comment-row {
    display: flex;
    align-items: flex-start;
    gap: var(--s-2);
    padding: var(--s-2) var(--s-4);
    border-bottom: 1px solid var(--border-hairline);
  }

  .comment-row:last-child {
    border-bottom: none;
  }

  .c-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-top: 5px;
    flex-shrink: 0;
  }

  .c-dot.kind-revision { background: var(--warning); }
  .c-dot.kind-question { background: var(--mint); }
  .c-dot.kind-approval { background: var(--success); }
  .c-dot.kind-note { background: var(--ink-3); }

  .c-info {
    min-width: 0;
    flex: 1;
  }

  .c-author {
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-2);
  }

  .c-body {
    font-size: 12px;
    color: var(--ink-2);
    margin: 2px 0;
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .c-target {
    font-size: 10px;
    color: var(--ink-3);
    font-family: var(--font-mono);
  }

  .comment-more {
    padding: var(--s-2) var(--s-4);
    font-size: 12px;
    color: var(--ink-3);
  }
</style>
