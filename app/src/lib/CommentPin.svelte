<!--
  CommentPin — a small pin badge positioned absolutely near a target element.
  Click toggles a popover with the comment body and resolution status.
-->
<script lang="ts">
  import type { CommentItem } from './bridge';

  interface Props {
    comment: CommentItem;
    onResolve?: (commentId: string) => void;
  }

  let { comment, onResolve }: Props = $props();

  let open = $state(false);

  const isResolved = $derived(!!comment.resolved_at);

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'short' });
    } catch {
      return iso;
    }
  }

  function toggle(): void {
    open = !open;
  }

  function handleResolve(): void {
    onResolve?.(comment.id);
    open = false;
  }
</script>

<div class="pin-host">
  <button
    type="button"
    class={`pin-badge ${isResolved ? 'resolved' : ''} ${comment.kind}`}
    onclick={toggle}
    aria-label="Comment: {comment.body}"
    aria-expanded={open}
  >
    {#if comment.kind === 'blocker'}
      <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
        <path d="M6 1L1 10h10L6 1z"/>
      </svg>
    {:else if comment.kind === 'suggestion'}
      <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
        <circle cx="6" cy="6" r="5"/>
      </svg>
    {:else}
      <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
        <rect x="1" y="1" width="10" height="10" rx="2"/>
      </svg>
    {/if}
  </button>

  {#if open}
    <div class="pin-popover" role="dialog" aria-label="Comment detail">
      <div class="pop-header">
        <span class="pop-author">{comment.author}</span>
        <span class="pop-kind">{comment.kind}</span>
        <button
          type="button"
          class="pop-close"
          onclick={toggle}
          aria-label="Close comment"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <p class="pop-body">{comment.body}</p>
      <div class="pop-footer">
        <span class="pop-date">{formatDate(comment.created_at)}</span>
        {#if isResolved}
          <span class="resolved-label">Resolved {comment.resolved_by ? `by ${comment.resolved_by}` : ''}</span>
        {:else}
          <button
            type="button"
            class="resolve-btn"
            onclick={handleResolve}
          >
            Mark resolved
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .pin-host {
    position: absolute;
    z-index: 20;
  }

  .pin-badge {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: var(--e1);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform var(--dur-micro) var(--ease);
    padding: 0;
    color: #fff;
  }

  .pin-badge:hover {
    transform: scale(1.15);
  }

  .pin-badge:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--mint-tint);
  }

  /* Kind-based colours */
  .pin-badge.blocker { background: var(--error); }
  .pin-badge.suggestion { background: var(--warning); }
  .pin-badge.note { background: var(--mint); }
  .pin-badge:not(.blocker):not(.suggestion):not(.note) { background: var(--slate); }
  .pin-badge.resolved { background: var(--success); opacity: 0.7; }

  .pin-badge svg {
    width: 8px;
    height: 8px;
  }

  /* Popover */
  .pin-popover {
    position: absolute;
    top: 26px;
    left: 0;
    width: 280px;
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    box-shadow: var(--e3);
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
  }

  .pop-header {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-3) var(--s-3) var(--s-2);
    border-bottom: 1px solid var(--border-hairline);
  }

  .pop-author {
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-1);
    flex: 1;
  }

  .pop-kind {
    font-size: 10px;
    font-weight: 500;
    color: var(--ink-3);
    background: var(--surface-2);
    padding: 2px 6px;
    border-radius: var(--r-pill);
    text-transform: capitalize;
  }

  .pop-close {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-sm);
    color: var(--ink-3);
    transition: background-color var(--dur-micro) var(--ease);
  }

  .pop-close:hover {
    background: var(--surface-2);
    color: var(--ink-1);
  }

  .pop-close svg {
    width: 14px;
    height: 14px;
  }

  .pop-body {
    margin: 0;
    padding: var(--s-3) var(--s-3);
    font-size: 13px;
    color: var(--ink-1);
    line-height: 1.5;
  }

  .pop-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    padding: var(--s-2) var(--s-3) var(--s-3);
    border-top: 1px solid var(--border-hairline);
  }

  .pop-date {
    font-size: 11px;
    color: var(--ink-3);
  }

  .resolved-label {
    font-size: 11px;
    color: var(--success);
    font-weight: 500;
  }

  .resolve-btn {
    font-size: 11px;
    font-weight: 500;
    color: var(--mint-hover);
    padding: 3px 8px;
    border: 1px solid var(--mint);
    border-radius: var(--r-pill);
    background: var(--mint-tint);
    cursor: pointer;
    transition: background-color var(--dur-micro) var(--ease);
  }

  .resolve-btn:hover {
    background: var(--mint);
    color: #fff;
  }
</style>
