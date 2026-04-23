<script lang="ts">
  // Import relative to this file: ../../stores/toast.svelte.ts
  import { toast } from '../../stores/toast.svelte';
</script>

<div class="toast-stack" aria-live="polite">
  {#each toast.items as t (t.id)}
    <button class={`toast tone-${t.tone}`} onclick={() => toast.dismiss(t.id)}>
      <span class="dot" aria-hidden="true"></span>
      <span class="msg">{t.message}</span>
      <span class="close" aria-hidden="true">×</span>
    </button>
  {/each}
</div>

<style>
  .toast-stack {
    position: fixed;
    right: var(--s-5);
    bottom: var(--s-5);
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    z-index: 40;
    pointer-events: none;
    max-width: 380px;
  }

  .toast {
    pointer-events: auto;
    display: inline-flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-4);
    background: var(--surface-1);
    color: var(--ink-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-md);
    box-shadow: var(--e2);
    font-size: 13px;
    animation: slide-in-right var(--dur-popover) var(--ease);
    text-align: left;
    cursor: pointer;
    transition:
      border-color var(--dur-micro) var(--ease),
      background-color var(--dur-micro) var(--ease);
  }

  .toast:hover {
    background: var(--surface-2);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: var(--r-pill);
    background: var(--ink-3);
    flex-shrink: 0;
  }

  .tone-success .dot {
    background: var(--success);
  }

  .tone-error .dot {
    background: var(--error);
  }

  .tone-warn .dot {
    background: var(--warning);
  }

  .tone-info .dot {
    background: var(--mint);
  }

  .msg {
    flex: 1;
  }

  .close {
    color: var(--ink-3);
    font-size: 18px;
    line-height: 1;
    padding-left: var(--s-2);
  }
</style>
