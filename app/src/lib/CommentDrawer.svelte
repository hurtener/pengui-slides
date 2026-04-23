<!--
  CommentDrawer — side drawer listing comments for the currently-open deck.
  Filter tabs: unresolved / all / resolved.
  Each item is clickable (emits onJump with the target string).
-->
<script lang="ts">
  import type { CommentItem, McpDeckEditorBridge } from './bridge';

  interface Props {
    bridge: McpDeckEditorBridge;
    deckId: string;
    open?: boolean;
    onClose?: () => void;
    onJump?: (target: string) => void;
  }

  let { bridge, deckId, open = false, onClose, onJump }: Props = $props();

  type Filter = 'unresolved' | 'all' | 'resolved';
  let filter = $state<Filter>('unresolved');
  let comments = $state<CommentItem[]>([]);
  let loading = $state(false);
  let error = $state('');
  let resolvingId = $state<string | null>(null);

  const filtered = $derived(
    filter === 'unresolved' ? comments.filter((c) => !c.resolved_at)
    : filter === 'resolved' ? comments.filter((c) => !!c.resolved_at)
    : comments
  );

  const unresolvedCount = $derived(comments.filter((c) => !c.resolved_at).length);

  $effect(() => {
    if (open && deckId) {
      void load();
    }
  });

  async function load(): Promise<void> {
    loading = true;
    error = '';
    try {
      const result = await bridge.listComments(deckId);
      // Sort newest first
      comments = [...result.comments].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  async function handleResolve(commentId: string): Promise<void> {
    resolvingId = commentId;
    try {
      await bridge.resolveComment({
        deck_id: deckId,
        comment_id: commentId,
        resolved_by: 'user',
      });
      await load();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      resolvingId = null;
    }
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'short' });
    } catch {
      return iso;
    }
  }

  function kindTone(kind: string): string {
    switch (kind) {
      case 'blocker': return 'error';
      case 'suggestion': return 'warning';
      default: return 'note';
    }
  }
</script>

{#if open}
  <!-- Scrim -->
  <button
    type="button"
    class="scrim"
    aria-label="Close comment drawer"
    onclick={onClose}
  ></button>

  <aside class="drawer" aria-label="Comments">
    <div class="drawer-head">
      <h2>Comments {unresolvedCount > 0 ? `(${unresolvedCount})` : ''}</h2>
      <button
        type="button"
        class="close-btn"
        aria-label="Close"
        onclick={onClose}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round"/>
        </svg>
      </button>
    </div>

    <div class="filter-tabs">
      {#each (['unresolved', 'all', 'resolved'] as Filter[]) as tab}
        <button
          type="button"
          class={`tab ${filter === tab ? 'active' : ''}`}
          onclick={() => { filter = tab; }}
        >
          {tab.charAt(0).toUpperCase() + tab.slice(1)}
        </button>
      {/each}
      <button
        type="button"
        class="refresh-btn"
        onclick={load}
        disabled={loading}
        aria-label="Refresh comments"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
          <path d="M13 8A5 5 0 103 8" stroke-linecap="round"/>
          <path d="M13 5v3h-3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <div class="drawer-body">
      {#if loading}
        <div class="empty-state">
          <div class="spinner" aria-label="Loading comments"></div>
          <p>Loading…</p>
        </div>
      {:else if error}
        <div class="empty-state">
          <p class="error-text">{error}</p>
        </div>
      {:else if filtered.length === 0}
        <div class="empty-state">
          <p class="muted">No {filter === 'all' ? '' : filter} comments.</p>
        </div>
      {:else}
        <ul class="comment-list">
          {#each filtered as comment (comment.id)}
            <li class={`comment-item ${comment.resolved_at ? 'resolved' : ''}`}>
              <div class="comment-top">
                <span class={`kind-dot ${kindTone(comment.kind)}`} aria-hidden="true"></span>
                <span class="comment-author">{comment.author}</span>
                <span class="comment-date">{formatDate(comment.created_at)}</span>
                {#if !comment.resolved_at}
                  <button
                    type="button"
                    class="resolve-btn"
                    onclick={() => handleResolve(comment.id)}
                    disabled={resolvingId === comment.id}
                    aria-label="Resolve comment"
                  >
                    {resolvingId === comment.id ? '…' : 'Resolve'}
                  </button>
                {/if}
              </div>
              <button
                type="button"
                class="comment-body-btn"
                onclick={() => onJump?.(comment.target)}
                title="Jump to: {comment.target}"
              >
                <p class="comment-body">{comment.body}</p>
                <span class="comment-target">{comment.target}</span>
              </button>
              {#if comment.resolved_at && comment.resolution_note}
                <p class="resolution-note">Note: {comment.resolution_note}</p>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(31, 35, 40, 0.08);
    z-index: 40;
    border: none;
    cursor: pointer;
  }

  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(380px, calc(100vw - 48px));
    background: var(--surface-1);
    border-left: 1px solid var(--border-subtle);
    box-shadow: var(--e3);
    z-index: 41;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
  }

  .drawer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--s-4) var(--s-5) var(--s-3);
    border-bottom: 1px solid var(--border-hairline);
  }

  h2 {
    font-size: 16px;
    font-weight: 600;
    color: var(--ink-1);
    margin: 0;
  }

  .close-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-sm);
    color: var(--ink-3);
    transition: background-color var(--dur-micro) var(--ease);
  }

  .close-btn:hover {
    background: var(--surface-2);
    color: var(--ink-1);
  }

  .close-btn svg {
    width: 14px;
    height: 14px;
  }

  .filter-tabs {
    display: flex;
    gap: var(--s-1);
    padding: var(--s-3) var(--s-5) var(--s-2);
    border-bottom: 1px solid var(--border-hairline);
    align-items: center;
  }

  .tab {
    font-size: 12px;
    font-weight: 500;
    padding: var(--s-1) var(--s-3);
    border-radius: var(--r-pill);
    color: var(--ink-2);
    transition: background-color var(--dur-micro) var(--ease);
  }

  .tab:hover {
    background: var(--surface-2);
    color: var(--ink-1);
  }

  .tab.active {
    background: var(--mint-tint);
    color: var(--mint-hover);
  }

  .refresh-btn {
    margin-left: auto;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-sm);
    color: var(--ink-3);
  }

  .refresh-btn:hover:not(:disabled) {
    background: var(--surface-2);
    color: var(--ink-1);
  }

  .refresh-btn svg {
    width: 14px;
    height: 14px;
  }

  .drawer-body {
    overflow-y: auto;
    padding: var(--s-3) var(--s-4);
    overscroll-behavior: contain;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-7) var(--s-4);
    text-align: center;
  }

  .spinner {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid var(--border-subtle);
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

  .error-text {
    color: var(--error);
    font-size: 13px;
  }

  .comment-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }

  .comment-item {
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    overflow: hidden;
  }

  .comment-item.resolved {
    opacity: 0.65;
  }

  .comment-top {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-2) var(--s-3) var(--s-1);
  }

  .kind-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .kind-dot.error { background: var(--error); }
  .kind-dot.warning { background: var(--warning); }
  .kind-dot.note { background: var(--mint); }

  .comment-author {
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-1);
    flex: 1;
  }

  .comment-date {
    font-size: 11px;
    color: var(--ink-3);
  }

  .resolve-btn {
    font-size: 10px;
    font-weight: 500;
    padding: 2px 8px;
    border: 1px solid var(--mint);
    border-radius: var(--r-pill);
    background: var(--mint-tint);
    color: var(--mint-hover);
    cursor: pointer;
    transition: background-color var(--dur-micro) var(--ease);
  }

  .resolve-btn:hover:not(:disabled) {
    background: var(--mint);
    color: #fff;
  }

  .comment-body-btn {
    width: 100%;
    text-align: left;
    padding: 0 var(--s-3) var(--s-2);
    cursor: pointer;
  }

  .comment-body-btn:hover .comment-body {
    color: var(--ink-1);
  }

  .comment-body {
    font-size: 13px;
    color: var(--ink-2);
    line-height: 1.5;
    margin: 0 0 var(--s-1);
  }

  .comment-target {
    font-size: 10px;
    color: var(--mint-hover);
    font-family: var(--font-mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
  }

  .resolution-note {
    font-size: 11px;
    color: var(--ink-3);
    padding: 0 var(--s-3) var(--s-2);
    margin: 0;
    font-style: italic;
  }
</style>
