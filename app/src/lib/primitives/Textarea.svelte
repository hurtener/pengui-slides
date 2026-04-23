<script lang="ts">
  import type { HTMLTextareaAttributes } from 'svelte/elements';

  interface Props extends HTMLTextareaAttributes {
    label?: string;
    hint?: string;
    error?: string;
    value?: string;
    monospace?: boolean;
  }

  let {
    label,
    hint,
    error,
    value = $bindable(''),
    id,
    monospace = false,
    rows = 6,
    class: className,
    ...rest
  }: Props = $props();

  const resolvedId = $derived(id ?? `textarea-${Math.random().toString(36).slice(2, 8)}`);
</script>

<div class={`field ${className ?? ''}`}>
  {#if label}
    <label for={resolvedId}>{label}</label>
  {/if}
  <textarea
    id={resolvedId}
    bind:value
    {rows}
    class={`${error ? 'has-error' : ''} ${monospace ? 'mono' : ''}`}
    {...rest}
  ></textarea>
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

  textarea {
    width: 100%;
    padding: var(--s-3) var(--s-4);
    background: var(--surface-1);
    color: var(--ink-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-md);
    font-size: 14px;
    line-height: 1.55;
    resize: vertical;
    min-height: 120px;
    transition:
      border-color var(--dur-micro) var(--ease),
      box-shadow var(--dur-micro) var(--ease);
  }

  textarea.mono {
    font-family: var(--font-mono);
    font-size: 13px;
  }

  textarea:focus {
    outline: none;
    border-color: var(--mint);
    box-shadow: 0 0 0 3px var(--mint-tint);
  }

  textarea.has-error {
    border-color: var(--error);
  }

  textarea::placeholder {
    color: var(--ink-3);
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
