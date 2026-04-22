<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends HTMLButtonAttributes {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    fullWidth?: boolean;
    children: Snippet;
    leading?: Snippet;
    trailing?: Snippet;
  }

  let {
    variant = 'secondary',
    size = 'md',
    loading = false,
    fullWidth = false,
    disabled = false,
    type = 'button',
    children,
    leading,
    trailing,
    class: className,
    ...rest
  }: Props = $props();
</script>

<button
  {type}
  disabled={disabled || loading}
  class={`btn btn-${variant} btn-${size} ${fullWidth ? 'btn-full' : ''} ${className ?? ''}`}
  {...rest}
>
  {#if loading}
    <span class="spinner" aria-hidden="true"></span>
  {:else if leading}
    <span class="slot-leading">{@render leading()}</span>
  {/if}
  <span class="label">{@render children()}</span>
  {#if trailing}
    <span class="slot-trailing">{@render trailing()}</span>
  {/if}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--s-2);
    font-family: var(--font-ui);
    font-weight: 500;
    border-radius: var(--r-md);
    border: 1px solid transparent;
    transition:
      background-color var(--dur-micro) var(--ease),
      border-color var(--dur-micro) var(--ease),
      color var(--dur-micro) var(--ease),
      box-shadow var(--dur-micro) var(--ease),
      transform var(--dur-micro) var(--ease);
    white-space: nowrap;
    user-select: none;
  }

  .btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--mint-tint);
  }

  .btn:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .btn-full {
    width: 100%;
  }

  .btn-sm {
    padding: var(--s-1) var(--s-3);
    font-size: 12px;
    min-height: 30px;
  }

  .btn-md {
    padding: var(--s-2) var(--s-4);
    font-size: 14px;
    min-height: 38px;
  }

  .btn-lg {
    padding: var(--s-3) var(--s-5);
    font-size: 15px;
    min-height: 46px;
  }

  .btn-primary {
    background: var(--mint);
    color: var(--surface-1);
    border-color: var(--mint);
  }

  .btn-primary:hover:not(:disabled) {
    background: var(--mint-hover);
    border-color: var(--mint-hover);
  }

  .btn-primary:active:not(:disabled) {
    transform: translateY(1px);
  }

  .btn-secondary {
    background: var(--surface-1);
    color: var(--ink-1);
    border-color: var(--border-subtle);
  }

  .btn-secondary:hover:not(:disabled) {
    background: var(--surface-2);
    border-color: var(--ink-3);
  }

  .btn-ghost {
    background: transparent;
    color: var(--ink-2);
  }

  .btn-ghost:hover:not(:disabled) {
    background: var(--surface-2);
    color: var(--ink-1);
  }

  .btn-danger {
    background: var(--error-tint);
    color: var(--error);
    border-color: var(--error-tint);
  }

  .btn-danger:hover:not(:disabled) {
    background: var(--error);
    color: var(--surface-1);
    border-color: var(--error);
  }

  .label {
    display: inline-flex;
    align-items: center;
  }

  .slot-leading,
  .slot-trailing {
    display: inline-flex;
    align-items: center;
  }

  .spinner {
    width: 14px;
    height: 14px;
    border-radius: var(--r-pill);
    border: 2px solid currentColor;
    border-top-color: transparent;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
