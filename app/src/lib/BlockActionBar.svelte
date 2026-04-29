<!--
  BlockActionBar — actions for the currently-selected block in
  Edit-layout mode.

  Lives in the parent DOM (NOT inside the canvas iframe), so it never
  overlaps slide content and renders at native size on any canvas
  zoom. The Editor / DocumentEditor passes the selected block's IR
  path + a short preview, plus per-action callbacks. The parent owns
  delete confirmation and any persistent status messaging.
-->
<script lang="ts">
  import { Button } from './primitives/index';

  interface Props {
    selectedIrPath: string | null;
    selectedPreview: string;
    allowImageInsert?: boolean;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onDuplicate: () => void;
    onAddParagraph: () => void;
    onAddImage: () => void;
    onDelete: () => void;
    onDeselect: () => void;
  }

  let {
    selectedIrPath,
    selectedPreview,
    allowImageInsert = true,
    canMoveUp = true,
    canMoveDown = true,
    onMoveUp,
    onMoveDown,
    onDuplicate,
    onAddParagraph,
    onAddImage,
    onDelete,
    onDeselect,
  }: Props = $props();

  // Inline two-step delete confirm. window.confirm() is blocked when
  // the editor runs inside Claude Desktop's nested iframe, so we
  // surface a "Confirm? / Cancel" pair instead. Auto-resets if the
  // user navigates away (selection changes).
  let confirmingDelete = $state(false);
  let confirmTimeout: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    // Reset confirm state when the selected block changes.
    selectedIrPath;
    confirmingDelete = false;
    if (confirmTimeout) {
      clearTimeout(confirmTimeout);
      confirmTimeout = null;
    }
  });

  function requestDelete(): void {
    if (confirmingDelete) {
      confirmingDelete = false;
      if (confirmTimeout) {
        clearTimeout(confirmTimeout);
        confirmTimeout = null;
      }
      onDelete();
      return;
    }
    confirmingDelete = true;
    if (confirmTimeout) clearTimeout(confirmTimeout);
    confirmTimeout = setTimeout(() => {
      confirmingDelete = false;
      confirmTimeout = null;
    }, 4000);
  }

  function cancelDelete(): void {
    confirmingDelete = false;
    if (confirmTimeout) {
      clearTimeout(confirmTimeout);
      confirmTimeout = null;
    }
  }

  function shortLabel(s: string): string {
    if (!s) return 'block';
    return s.length > 48 ? s.slice(0, 45) + '…' : s;
  }
</script>

{#if selectedIrPath}
  <div class="block-bar" role="toolbar" aria-label="Actions for the selected block">
    <div class="bar-label">
      <span class="bar-eyebrow">Selected block</span>
      <span class="bar-preview" title={selectedPreview}>{shortLabel(selectedPreview)}</span>
    </div>
    <div class="bar-actions">
      <button
        type="button"
        class="bar-btn"
        onclick={onMoveUp}
        disabled={!canMoveUp}
        title={canMoveUp ? 'Move up' : 'Already at the top'}
      >
        ↑ <span class="bar-btn-label">Move up</span>
      </button>
      <button
        type="button"
        class="bar-btn"
        onclick={onMoveDown}
        disabled={!canMoveDown}
        title={canMoveDown ? 'Move down' : 'Already at the bottom'}
      >
        ↓ <span class="bar-btn-label">Move down</span>
      </button>
      <button type="button" class="bar-btn" onclick={onDuplicate} title="Duplicate">
        ⧉ <span class="bar-btn-label">Duplicate</span>
      </button>
      <button type="button" class="bar-btn" onclick={onAddParagraph} title="Add paragraph below">
        + <span class="bar-btn-label">Paragraph</span>
      </button>
      {#if allowImageInsert}
        <button type="button" class="bar-btn" onclick={onAddImage} title="Add image below">
          + <span class="bar-btn-label">Image</span>
        </button>
      {/if}
      {#if confirmingDelete}
        <button
          type="button"
          class="bar-btn danger confirming"
          onclick={requestDelete}
          title="Confirm delete"
        >
          ✕ <span class="bar-btn-label">Confirm delete?</span>
        </button>
        <button type="button" class="bar-btn" onclick={cancelDelete} title="Cancel delete">
          <span class="bar-btn-label">Cancel</span>
        </button>
      {:else}
        <button
          type="button"
          class="bar-btn danger"
          onclick={requestDelete}
          title="Delete this block"
        >
          ✕ <span class="bar-btn-label">Delete</span>
        </button>
      {/if}
      <span class="bar-spacer"></span>
      <Button variant="ghost" size="sm" onclick={onDeselect}>Deselect</Button>
    </div>
  </div>
{/if}

<style>
  .block-bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-2) var(--s-4);
    border-top: 1px solid var(--border-hairline);
    background: var(--surface-2, #f7f5f0);
    border-radius: 0 0 var(--r-lg) var(--r-lg);
    flex-wrap: wrap;
  }

  .bar-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    overflow: hidden;
  }

  .bar-eyebrow {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--ink-3);
    font-weight: 600;
  }

  .bar-preview {
    font-size: 13px;
    color: var(--ink-1);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 280px;
  }

  .bar-actions {
    display: flex;
    align-items: center;
    gap: var(--s-1);
    flex-wrap: wrap;
  }

  .bar-btn {
    all: unset;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    padding: 5px 10px;
    border-radius: var(--r-md);
    border: 1px solid var(--border-subtle);
    background: var(--surface-1);
    color: var(--ink-1);
    font-size: 12px;
    font-weight: 500;
    line-height: 1;
  }

  .bar-btn:hover,
  .bar-btn:focus-visible {
    border-color: var(--mint);
    background: var(--mint-tint);
    color: var(--mint-hover);
    outline: none;
  }

  .bar-btn:disabled {
    cursor: not-allowed;
    opacity: 0.45;
    background: var(--surface-1);
    color: var(--ink-3);
    border-color: var(--border-subtle);
  }
  .bar-btn:disabled:hover,
  .bar-btn:disabled:focus-visible {
    border-color: var(--border-subtle);
    background: var(--surface-1);
    color: var(--ink-3);
  }

  .bar-btn.danger:hover,
  .bar-btn.danger:focus-visible {
    border-color: var(--terracotta, #c66);
    background: rgba(204, 102, 102, 0.12);
    color: var(--terracotta, #c66);
  }

  .bar-btn.danger.confirming {
    border-color: var(--terracotta, #c66);
    background: rgba(204, 102, 102, 0.18);
    color: var(--terracotta, #c66);
    animation: pulse-confirm 1.2s ease-in-out infinite;
  }

  @keyframes pulse-confirm {
    0%,
    100% {
      box-shadow: 0 0 0 0 rgba(204, 102, 102, 0.35);
    }
    50% {
      box-shadow: 0 0 0 4px rgba(204, 102, 102, 0);
    }
  }

  .bar-btn-label {
    font-size: 12px;
  }

  .bar-spacer {
    width: var(--s-2);
  }

  @media (max-width: 720px) {
    .bar-btn-label {
      display: none;
    }
    .bar-btn {
      padding: 6px 9px;
      font-size: 14px;
    }
  }
</style>
