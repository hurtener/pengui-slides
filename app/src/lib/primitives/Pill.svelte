<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    tone?: 'mint' | 'terracotta' | 'slate' | 'muted' | 'success' | 'warning' | 'error';
    size?: 'sm' | 'md';
    children: Snippet;
  }

  let { tone = 'muted', size = 'sm', children }: Props = $props();
</script>

<span class={`pill tone-${tone} size-${size}`}>{@render children()}</span>

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: var(--s-1);
    border-radius: var(--r-pill);
    font-weight: 500;
    letter-spacing: 0.01em;
    white-space: nowrap;
    line-height: 1;
  }

  .size-sm {
    padding: 4px 10px;
    font-size: 11px;
  }

  .size-md {
    padding: 6px 14px;
    font-size: 13px;
  }

  .tone-mint {
    background: var(--mint-tint);
    color: var(--mint-hover);
  }

  .tone-terracotta {
    background: var(--terracotta-tint);
    color: var(--terracotta);
  }

  .tone-slate {
    background: var(--slate-tint);
    color: var(--slate);
  }

  .tone-muted {
    background: var(--surface-2);
    color: var(--ink-3);
  }

  .tone-success {
    background: var(--success-tint);
    color: var(--success);
  }

  .tone-warning {
    background: var(--warning-tint);
    color: var(--warning);
  }

  .tone-error {
    background: var(--error-tint);
    color: var(--error);
  }
</style>
