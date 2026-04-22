<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';

  interface Props extends HTMLInputAttributes {
    label?: string;
    hint?: string;
    error?: string;
    value?: string;
  }

  let {
    label,
    hint,
    error,
    value = $bindable(''),
    id,
    class: className,
    ...rest
  }: Props = $props();

  const resolvedId = $derived(id ?? `input-${Math.random().toString(36).slice(2, 8)}`);
</script>

<div class={`field ${className ?? ''}`}>
  {#if label}
    <label for={resolvedId}>{label}</label>
  {/if}
  <input
    id={resolvedId}
    bind:value
    class={error ? 'has-error' : ''}
    {...rest}
  />
  {#if error}
    <p class="error">{error}</p>
  {:else if hint}
    <p class="hint">{hint}</p>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }

  label {
    font-size: 13px;
    font-weight: 500;
    color: var(--ink-2);
  }

  input {
    width: 100%;
    padding: var(--s-3) var(--s-4);
    background: var(--surface-1);
    color: var(--ink-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-md);
    font-size: 14px;
    transition:
      border-color var(--dur-micro) var(--ease),
      box-shadow var(--dur-micro) var(--ease);
  }

  input::placeholder {
    color: var(--ink-3);
  }

  input:focus {
    outline: none;
    border-color: var(--mint);
    box-shadow: 0 0 0 3px var(--mint-tint);
  }

  input.has-error {
    border-color: var(--error);
  }

  input.has-error:focus {
    box-shadow: 0 0 0 3px var(--error-tint);
  }

  input:disabled {
    background: var(--surface-2);
    color: var(--ink-3);
    cursor: not-allowed;
  }

  .hint {
    font-size: 12px;
    color: var(--ink-3);
  }

  .error {
    font-size: 12px;
    color: var(--error);
  }
</style>
