<!--
  PagePreview — vertical scrollable multi-page preview for print decks.

  Renders all pages at a reduced scale (≈32%) in a continuous vertical
  stack. Page numbers appear in the left gutter. Clicking a page calls
  onSelect with its slideId.
-->
<script lang="ts">
  import type { EditorThumbnail, FormatKind } from './types';

  // Native canvas dimensions per format.
  const FORMAT_DIMS: Record<FormatKind, { width: number; height: number }> = {
    slides_16_9:           { width: 1920, height: 1080 },
    print_a4_portrait:     { width: 1240, height: 1754 },
    print_letter_portrait: { width: 1275, height: 1650 },
  };

  const PAGE_SCALE = 0.32; // ≈ 32% — 5-6 A4 pages visible in viewport

  interface Props {
    thumbnails: EditorThumbnail[];
    activeSlideId?: string;
    format?: FormatKind;
    onSelect?: (slideId: string) => void;
  }

  let {
    thumbnails = [],
    activeSlideId = '',
    format = 'print_a4_portrait',
    onSelect,
  }: Props = $props();

  const dims = $derived(FORMAT_DIMS[format] ?? FORMAT_DIMS.print_a4_portrait);
  const thumbWidth = $derived(Math.round(dims.width * PAGE_SCALE));
  const thumbHeight = $derived(Math.round(dims.height * PAGE_SCALE));
</script>

<div class="page-preview-stack">
  {#each thumbnails as thumb (thumb.slideId)}
    <div class="page-row">
      <span class="page-num" aria-label="Page {thumb.position + 1}">{thumb.position + 1}</span>
      <button
        class={`page-thumb ${thumb.slideId === activeSlideId ? 'active' : ''}`}
        style="width: {thumbWidth}px;"
        onclick={() => onSelect?.(thumb.slideId)}
        aria-label="Go to page {thumb.position + 1}: {thumb.title}"
      >
        <img
          alt="Page {thumb.position + 1} — {thumb.title}"
          src="data:image/png;base64,{thumb.imageBase64}"
          width={thumbWidth}
          height={thumbHeight}
          style="width: {thumbWidth}px; height: {thumbHeight}px; display: block;"
        />
      </button>
    </div>
  {/each}
</div>

<style>
  .page-preview-stack {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
    padding: var(--s-4) var(--s-3);
    overflow-y: auto;
    overscroll-behavior: contain;
    max-height: 100%;
  }

  .page-row {
    display: flex;
    align-items: flex-start;
    gap: var(--s-3);
  }

  .page-num {
    font-size: 11px;
    color: var(--ink-3);
    font-variant-numeric: tabular-nums;
    width: 20px;
    text-align: right;
    flex-shrink: 0;
    padding-top: 4px;
    letter-spacing: 0.02em;
  }

  .page-thumb {
    flex-shrink: 0;
    padding: 0;
    border: 2px solid var(--border-subtle);
    border-radius: var(--r-sm);
    overflow: hidden;
    cursor: pointer;
    background: white;
    transition:
      border-color var(--dur-micro) var(--ease),
      box-shadow var(--dur-micro) var(--ease);
  }

  .page-thumb:hover {
    border-color: var(--mint);
    box-shadow: 0 4px 16px rgba(47, 184, 166, 0.18);
  }

  .page-thumb.active {
    border-color: var(--mint);
    box-shadow: 0 0 0 3px var(--mint-tint);
  }

  .page-thumb:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--mint-tint);
  }
</style>
