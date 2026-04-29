<!--
  NodeTypePicker — modal grid for choosing a block type.

  Shared by both the Editor (slide layout) and the DocumentEditor
  (section layout). Drives:
    - the `+ Block ▾` insert flow (passes `mode='insert'`)
    - the `Change ▾` morph flow (passes `mode='morph'` + `availableKinds`)

  Picking a tile fires `onPick(kind)`. Image picks always defer to the
  AssetPicker — the parent listens for `kind === 'image'` and opens
  the AssetPicker as a second step. Defaults (heading h2 / list bullet
  / callout note) are baked into `nodeCatalogue.defaultNodePayload`;
  sub-option selection is a deliberate v4.9f polish item.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from './primitives/index';
  import {
    CATALOGUE,
    type CatalogueEntry,
    type LeafNodeKind,
  } from './nodeCatalogue';

  interface Props {
    open: boolean;
    title?: string;
    /** When provided, only catalogue entries whose `kind` is in this
     *  list render. The morph path always passes a list; the insert
     *  path may pass undefined to mean "everything the catalogue
     *  knows about". */
    availableKinds?: ReadonlyArray<LeafNodeKind>;
    onPick: (kind: LeafNodeKind) => void;
    onClose: () => void;
  }

  let {
    open,
    title = 'Choose a block',
    availableKinds,
    onPick,
    onClose,
  }: Props = $props();

  const entries = $derived<ReadonlyArray<CatalogueEntry>>(
    availableKinds === undefined
      ? CATALOGUE
      : CATALOGUE.filter((entry) => availableKinds!.includes(entry.kind)),
  );

  function handleKeydown(event: KeyboardEvent): void {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    // Single-letter shortcuts mirror the catalogue's `shortcut` field.
    // Modifier keys must be off so we don't fight typed text in
    // contentEditable elsewhere on the page.
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    const match = entries.find((entry) => entry.shortcut === key);
    if (match) {
      event.preventDefault();
      onPick(match.kind);
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if open}
  <button type="button" class="picker-scrim" aria-label="Close" onclick={onClose}></button>
  <div class="picker" role="dialog" aria-label={title}>
    <div class="picker-head">
      <p class="eyebrow">{title}</p>
      <Button variant="ghost" size="sm" onclick={onClose}>Close</Button>
    </div>
    <div class="picker-body">
      {#if entries.length === 0}
        <p class="muted">
          No block types are available here. Try inserting in the main slide
          body, or close this and use a different selection.
        </p>
      {:else}
        <div class="picker-grid">
          {#each entries as entry (entry.kind)}
            <button
              type="button"
              class="picker-tile"
              onclick={() => onPick(entry.kind)}
              aria-label={`${entry.label} — ${entry.hint}`}
              title={`${entry.label} (${entry.shortcut.toUpperCase()})`}
            >
              <span class="tile-glyph" aria-hidden="true">{entry.glyph}</span>
              <span class="tile-label">{entry.label}</span>
              <span class="tile-hint">{entry.hint}</span>
              <span class="tile-shortcut" aria-hidden="true">{entry.shortcut.toUpperCase()}</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .picker-scrim {
    position: fixed;
    inset: 0;
    border: 0;
    background: rgba(31, 35, 40, 0.18);
    z-index: 50;
    cursor: pointer;
  }

  .picker {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(560px, calc(100vw - 80px));
    max-height: min(70vh, 480px);
    z-index: 51;
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    box-shadow: var(--e3);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
  }

  .picker-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--s-3) var(--s-4);
    border-bottom: 1px solid var(--border-hairline);
  }

  .picker-body {
    padding: var(--s-3) var(--s-4) var(--s-4);
    overflow-y: auto;
  }

  .eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 11px;
    color: var(--ink-3);
    font-weight: 500;
  }

  .muted {
    color: var(--ink-3);
    font-size: 13px;
    margin: 0;
  }

  .picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--s-2);
  }

  .picker-tile {
    all: unset;
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: var(--s-2);
    align-items: center;
    padding: var(--s-3);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-md);
    background: var(--surface-1);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.12s ease, box-shadow 0.12s ease;
  }

  .picker-tile:hover,
  .picker-tile:focus-visible {
    border-color: var(--mint);
    box-shadow: 0 0 0 3px var(--mint-tint);
    outline: none;
  }

  .tile-glyph {
    grid-row: 1 / span 2;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-sm);
    background: var(--mint-tint);
    color: var(--mint-hover);
    font-size: 16px;
    font-weight: 600;
    line-height: 1;
  }

  .tile-label {
    grid-column: 2;
    grid-row: 1;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-1);
    line-height: 1.2;
  }

  .tile-hint {
    grid-column: 2;
    grid-row: 2;
    font-size: 11px;
    color: var(--ink-3);
    line-height: 1.3;
  }

  .tile-shortcut {
    position: absolute;
    top: 6px;
    right: 8px;
    font-size: 10px;
    font-weight: 600;
    color: var(--ink-3);
    background: var(--surface-2);
    border: 1px solid var(--border-hairline);
    border-radius: 3px;
    padding: 1px 4px;
    line-height: 1.2;
    letter-spacing: 0.04em;
  }
</style>
