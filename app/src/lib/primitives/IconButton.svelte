<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends HTMLButtonAttributes {
    label: string;
    tone?: 'default' | 'subtle' | 'danger' | 'primary';
    size?: 'sm' | 'md';
    children: Snippet;
  }

  let {
    label,
    tone = 'default',
    size = 'md',
    class: className,
    children,
    type = 'button',
    ...rest
  }: Props = $props();
</script>

<button {type} class={`icon-btn tone-${tone} size-${size} ${className ?? ''}`} aria-label={label} title={label} {...rest}>
  {@render children()}
</button>

<style>
  .icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-md);
    border: 1px solid transparent;
    color: var(--ink-2);
    transition:
      background-color var(--dur-micro) var(--ease),
      color var(--dur-micro) var(--ease),
      border-color var(--dur-micro) var(--ease);
  }

  .size-sm {
    width: 28px;
    height: 28px;
  }

  .size-md {
    width: 36px;
    height: 36px;
  }

  .icon-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--mint-tint);
  }

  .tone-default:hover {
    background: var(--surface-2);
    color: var(--ink-1);
  }

  .tone-subtle {
    color: var(--ink-3);
  }

  .tone-subtle:hover {
    background: var(--surface-2);
    color: var(--ink-1);
  }

  .tone-primary {
    color: var(--mint);
    background: var(--mint-tint);
  }

  .tone-primary:hover {
    background: var(--mint);
    color: var(--surface-1);
  }

  .tone-danger:hover {
    background: var(--error-tint);
    color: var(--error);
  }

  .icon-btn :global(svg) {
    width: 18px;
    height: 18px;
    display: block;
  }

  .size-sm :global(svg) {
    width: 14px;
    height: 14px;
  }
</style>
