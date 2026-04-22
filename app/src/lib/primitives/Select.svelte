<script lang="ts">
  import type { HTMLSelectAttributes } from 'svelte/elements';

  interface Option {
    value: string;
    label: string;
  }

  interface Props extends Omit<HTMLSelectAttributes, 'value'> {
    label?: string;
    hint?: string;
    options: Option[];
    value?: string;
  }

  let {
    label,
    hint,
    options,
    value = $bindable(''),
    id,
    class: className,
    ...rest
  }: Props = $props();

  const resolvedId = $derived(id ?? `select-${Math.random().toString(36).slice(2, 8)}`);
</script>

<div class={`field ${className ?? ''}`}>
  {#if label}
    <label for={resolvedId}>{label}</label>
  {/if}
  <div class="select-wrap">
    <select id={resolvedId} bind:value {...rest}>
      {#each options as opt (opt.value)}
        <option value={opt.value}>{opt.label}</option>
      {/each}
    </select>
    <span class="chev" aria-hidden="true">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M4 6l4 4 4-4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
  </div>
  {#if hint}
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

  .select-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  select {
    width: 100%;
    padding: var(--s-3) var(--s-7) var(--s-3) var(--s-4);
    background: var(--surface-1);
    color: var(--ink-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-md);
    font-size: 14px;
    appearance: none;
    cursor: pointer;
    transition:
      border-color var(--dur-micro) var(--ease),
      box-shadow var(--dur-micro) var(--ease);
  }

  select:focus {
    outline: none;
    border-color: var(--mint);
    box-shadow: 0 0 0 3px var(--mint-tint);
  }

  .chev {
    position: absolute;
    right: var(--s-4);
    pointer-events: none;
    color: var(--ink-3);
    display: inline-flex;
  }

  .chev :global(svg) {
    width: 16px;
    height: 16px;
  }

  .hint {
    font-size: 12px;
    color: var(--ink-3);
  }
</style>
