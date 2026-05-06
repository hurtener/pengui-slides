<!--
  AssetPicker — modal grid for choosing an image to insert.

  Loads the deck's image assets via `bridge.listAssets()` and filters
  out logos (which belong in the chrome editor, not the inline picker).
  Surfaces every v4.16 role bucket — illustration, screenshot, photo,
  icon, and the legacy 'content' alias — under one picker.
  and filters to image MIME types. Used by both the slide editor and the
  document editor when the user clicks "Add image" in edit-layout mode.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from './primitives/index';
  import type { McpDeckEditorBridge } from './bridge';

  interface PickerAsset {
    asset_id: string;
    label?: string;
    name?: string;
    filename?: string;
    mime_type: string;
    role: string;
    width?: number;
    height?: number;
    data_base64?: string;
  }

  // v4.18 — image.frame chrome variant. Caller may opt in to the
  // 2-stage picker by setting `withFramePicker: true`; the user picks
  // asset, then picks one of 5 frame variants. When `withFramePicker`
  // is false (default), behaviour matches the pre-v4.18 single-stage
  // picker (asset → onPick immediately).
  type ImageFrame = 'none' | 'browser' | 'phone' | 'desktop' | 'laptop';

  interface FramedPick {
    asset: PickerAsset;
    frame: ImageFrame;
  }

  interface Props {
    bridge: McpDeckEditorBridge;
    open: boolean;
    /** v4.18: when true, surface a frame picker after the user selects
     *  an asset, then resolve onPick with { asset, frame }. Default
     *  false so existing call sites keep their single-stage UX. */
    withFramePicker?: boolean;
    onPick: (asset: PickerAsset) => void;
    /** v4.18: alternate callback fired only when withFramePicker is true.
     *  Caller composes the IR image node with both fields. */
    onPickWithFrame?: (pick: FramedPick) => void;
    onClose: () => void;
  }

  let {
    bridge, open, withFramePicker = false,
    onPick, onPickWithFrame, onClose,
  }: Props = $props();

  // v4.18 — 2-stage state. `pendingAsset` holds the chosen asset while
  // the frame picker is open. Reset on close + on stage rewind.
  let pendingAsset = $state<PickerAsset | null>(null);

  const FRAME_OPTIONS: ReadonlyArray<{ value: ImageFrame; label: string; hint: string }> = [
    { value: 'none',    label: 'No frame',  hint: 'Bare image, no chrome' },
    { value: 'browser', label: 'Browser',   hint: 'Title bar + URL pill — for UI screenshots' },
    { value: 'phone',   label: 'Phone',     hint: 'Device bezel + status bar' },
    { value: 'desktop', label: 'Desktop',   hint: 'Monitor + stand' },
    { value: 'laptop',  label: 'Laptop',    hint: 'Lid + keyboard tray' },
  ];

  function handleAssetClick(a: PickerAsset): void {
    if (withFramePicker) {
      pendingAsset = a;
    } else {
      onPick(a);
    }
  }

  function handleFramePick(frame: ImageFrame): void {
    if (!pendingAsset) return;
    if (onPickWithFrame) {
      onPickWithFrame({ asset: pendingAsset, frame });
    } else {
      onPick(pendingAsset);
    }
    pendingAsset = null;
  }

  function rewindToAssetGrid(): void {
    pendingAsset = null;
  }

  // Reset the frame stage when the picker closes externally.
  $effect(() => {
    if (!open) pendingAsset = null;
  });

  let loading = $state(false);
  let error = $state('');
  let items = $state<PickerAsset[]>([]);
  let loaded = $state(false);

  async function load(): Promise<void> {
    loading = true;
    error = '';
    try {
      // v4.16 — list ALL non-logo image assets so the picker exposes
      // illustrations / screenshots / photos / icons / legacy 'content'
      // uploads, not just the legacy 'content' bucket. Logos are still
      // filtered out — they belong in the chrome editor, not the inline
      // image picker.
      const list = await bridge.listAssets();
      const all = list.assets ?? [];
      items = all.filter((a: PickerAsset) =>
        typeof a.mime_type === 'string' &&
        a.mime_type.startsWith('image/') &&
        a.role !== 'logo',
      );
      loaded = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  // Lazy-load on first open. Re-fetch if the user reopens after a long
  // gap so newly uploaded images show up.
  $effect(() => {
    if (open && !loaded) {
      void load();
    }
  });

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  function displayLabel(a: PickerAsset): string {
    return a.label || a.name || a.filename || 'Untitled image';
  }
</script>

{#if open}
  <button type="button" class="picker-scrim" aria-label="Close" onclick={onClose}></button>
  <div class="picker" role="dialog" aria-label="Choose an image">
    <div class="picker-head">
      {#if pendingAsset}
        <Button variant="ghost" size="sm" onclick={rewindToAssetGrid}>← Back</Button>
        <p class="eyebrow">Pick a frame</p>
      {:else}
        <p class="eyebrow">Choose an image</p>
      {/if}
      <Button variant="ghost" size="sm" onclick={onClose}>Close</Button>
    </div>
    <div class="picker-body">
      {#if pendingAsset}
        <!-- Stage 2 — frame picker. v4.18 image.frame extension. -->
        <div class="frame-grid">
          {#each FRAME_OPTIONS as opt (opt.value)}
            <button
              type="button"
              class="frame-tile"
              onclick={() => handleFramePick(opt.value)}
              aria-label={opt.label}
              title={opt.hint}
            >
              <span class={`frame-thumb frame-thumb-${opt.value}`}></span>
              <span class="frame-label">{opt.label}</span>
              <span class="frame-hint">{opt.hint}</span>
            </button>
          {/each}
        </div>
      {:else if loading}
        <p class="muted">Loading images…</p>
      {:else if error}
        <p class="error">Couldn't load images: {error}</p>
      {:else if items.length === 0}
        <p class="muted">
          No images uploaded yet. Add one in the Assets panel first, then come
          back here.
        </p>
      {:else}
        <div class="picker-grid">
          {#each items as a (a.asset_id)}
            <button
              type="button"
              class="picker-tile"
              onclick={() => handleAssetClick(a)}
              aria-label={displayLabel(a)}
            >
              {#if a.data_base64 && a.mime_type.startsWith('image/')}
                <img
                  src={`data:${a.mime_type};base64,${a.data_base64}`}
                  alt=""
                />
              {:else}
                <span class="picker-tile-fallback">{a.mime_type}</span>
              {/if}
              <span class="picker-tile-label">{displayLabel(a)}</span>
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
    width: min(640px, calc(100vw - 80px));
    max-height: min(70vh, 520px);
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

  .error {
    color: var(--terracotta);
    font-size: 13px;
    margin: 0;
  }

  .picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: var(--s-3);
  }

  .picker-tile {
    all: unset;
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    padding: var(--s-2);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-md);
    background: var(--surface-1);
    cursor: pointer;
    text-align: left;
  }

  .picker-tile:hover,
  .picker-tile:focus-visible {
    border-color: var(--mint);
    box-shadow: 0 0 0 3px var(--mint-tint);
  }

  .picker-tile img {
    width: 100%;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    border-radius: var(--r-sm);
    background: var(--surface-2);
    display: block;
  }

  .picker-tile-fallback {
    display: block;
    aspect-ratio: 4 / 3;
    background: var(--surface-2);
    border-radius: var(--r-sm);
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--ink-3);
    padding: var(--s-2);
  }

  .picker-tile-label {
    font-size: 12px;
    color: var(--ink-1);
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .frame-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: var(--s-3);
  }

  .frame-tile {
    all: unset;
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    padding: var(--s-3);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-md);
    background: var(--surface-1);
    cursor: pointer;
    text-align: left;
  }

  .frame-tile:hover,
  .frame-tile:focus-visible {
    border-color: var(--mint);
    box-shadow: 0 0 0 3px var(--mint-tint);
  }

  .frame-thumb {
    display: block;
    width: 100%;
    aspect-ratio: 4 / 3;
    background: var(--surface-2);
    border-radius: var(--r-sm);
    position: relative;
    overflow: hidden;
  }

  .frame-thumb-none {
    background: var(--surface-2);
  }

  .frame-thumb-browser {
    background:
      linear-gradient(var(--surface-3) 14%, var(--surface-2) 14%);
    border: 1px solid var(--border-subtle);
  }

  .frame-thumb-phone {
    background: var(--surface-3);
    border-radius: var(--r-md);
    border: 2px solid var(--ink-2);
    margin: 0 auto;
    width: 50%;
  }

  .frame-thumb-desktop {
    background: var(--surface-3);
    border: 2px solid var(--ink-2);
    border-bottom-width: 6px;
    border-radius: var(--r-sm);
  }

  .frame-thumb-laptop {
    background: var(--surface-3);
    border: 1px solid var(--ink-2);
    border-radius: var(--r-sm) var(--r-sm) 0 0;
    border-bottom: 6px solid var(--ink-2);
  }

  .frame-label {
    font-size: 13px;
    color: var(--ink-1);
    font-weight: 500;
  }

  .frame-hint {
    font-size: 11px;
    color: var(--ink-3);
    line-height: 1.3;
  }
</style>
