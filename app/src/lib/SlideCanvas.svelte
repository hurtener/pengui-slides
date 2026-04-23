<script lang="ts">
  import { onMount } from 'svelte';
  import type { FormatKind } from './types';

  // Format geometry registry (mirrors FORMAT_REGISTRY on the backend).
  const FORMAT_DIMS: Record<FormatKind, { width: number; height: number }> = {
    slides_16_9:         { width: 1920, height: 1080 },
    print_a4_portrait:   { width: 1240, height: 1754 },
    print_letter_portrait: { width: 1275, height: 1650 },
  };

  interface Props {
    html?: string;
    revisionHash?: string;
    renderNonce?: number;
    disabled?: boolean;
    format?: FormatKind;
    /**
     * When true, clicks on `[data-edit-id]` elements emit `onpintarget`
     * instead of starting an inline text edit. Used by the v4 comment
     * composer — the user picks the specific child element to pin their
     * note to, which gives the agent a semantic target (editId) rather
     * than a pixel coordinate.
     */
    pinMode?: boolean;
    /** data-edit-ids of elements that already have comments attached. */
    pinnedEditIds?: string[];
    oncommit?: (detail: { editId: string; text: string }) => void;
    onpintarget?: (detail: { editId: string }) => void;
    onerror?: (detail: { message: string }) => void;
  }

  let {
    html = '',
    revisionHash = '',
    renderNonce = 0,
    disabled = false,
    format = 'slides_16_9',
    pinMode = false,
    pinnedEditIds = [],
    oncommit,
    onpintarget,
    onerror,
  }: Props = $props();

  const dims = $derived(FORMAT_DIMS[format] ?? FORMAT_DIMS.slides_16_9);
  const NATIVE_WIDTH = $derived(dims.width);
  const NATIVE_HEIGHT = $derived(dims.height);

  let containerEl: HTMLDivElement | null = $state(null);
  let iframeEl: HTMLIFrameElement | null = $state(null);
  let scale = $state(1);
  let cleanupFrame: (() => void) | null = null;
  let activeElement: HTMLElement | null = null;
  let activeOriginalText = '';

  const frameKey = $derived(`${revisionHash}:${renderNonce}`);
  const scaledWidth = $derived(NATIVE_WIDTH * scale);
  const scaledHeight = $derived(NATIVE_HEIGHT * scale);

  onMount(() => {
    const resizeObserver = new ResizeObserver(() => updateScale());
    if (containerEl) {
      resizeObserver.observe(containerEl);
    }

    return () => {
      cleanupFrame?.();
      resizeObserver.disconnect();
    };
  });

  function updateScale(): void {
    if (!containerEl) return;
    const widthScale = containerEl.clientWidth / NATIVE_WIDTH;
    const heightScale = containerEl.clientHeight / NATIVE_HEIGHT;
    scale = Math.min(widthScale, heightScale, 1);
  }

  function handleLoad(): void {
    cleanupFrame?.();
    updateScale();

    const doc = iframeEl?.contentDocument;
    if (!doc) return;

    const clickHandler = (event: MouseEvent) => {
      if (disabled) return;
      const target = event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>('[data-edit-id]')
        : null;
      if (!target) return;
      event.preventDefault();
      if (pinMode) {
        const editId = target.dataset.editId;
        if (editId) onpintarget?.({ editId });
        return;
      }
      startEditing(target);
    };

    doc.addEventListener('click', clickHandler);
    applyPinDecorations(doc);

    cleanupFrame = () => {
      doc.removeEventListener('click', clickHandler);
      clearPinDecorations(doc);
      teardownActiveElement();
    };
  }

  function applyPinDecorations(doc: Document): void {
    const editables = doc.querySelectorAll<HTMLElement>('[data-edit-id]');
    const pinnedSet = new Set(pinnedEditIds);
    editables.forEach((el) => {
      const isPinned = el.dataset.editId ? pinnedSet.has(el.dataset.editId) : false;
      if (pinMode) {
        el.style.cursor = 'crosshair';
        el.style.outline = '1px dashed rgba(92, 64, 41, 0.4)';
        el.style.outlineOffset = '2px';
      } else {
        el.style.cursor = disabled ? 'default' : 'text';
        el.style.outline = isPinned ? '1px dashed rgba(47, 184, 166, 0.55)' : 'none';
        el.style.outlineOffset = isPinned ? '2px' : '0';
      }
    });
  }

  function clearPinDecorations(doc: Document): void {
    doc.querySelectorAll<HTMLElement>('[data-edit-id]').forEach((el) => {
      el.style.cursor = '';
      el.style.outline = '';
      el.style.outlineOffset = '';
    });
  }

  // Re-apply decorations if pinMode / pinnedEditIds change after initial load.
  $effect(() => {
    const doc = iframeEl?.contentDocument;
    if (doc) {
      void pinMode;
      void pinnedEditIds;
      applyPinDecorations(doc);
    }
  });

  function startEditing(element: HTMLElement): void {
    if (activeElement === element) return;
    teardownActiveElement();

    activeElement = element;
    activeOriginalText = element.innerText;
    element.contentEditable = 'true';
    element.dataset.editing = 'true';
    element.style.outline = '2px solid rgba(47, 184, 166, 0.65)';
    element.style.outlineOffset = '4px';

    const keydownHandler = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        element.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        element.innerText = activeOriginalText;
        element.blur();
      }
    };

    const blurHandler = () => {
      const editId = element.dataset.editId;
      const nextText = element.innerText.replace(/\r\n/g, '\n');
      teardownActiveElement();

      if (!editId) {
        onerror?.({ message: 'Editable node is missing data-edit-id.' });
        return;
      }
      if (nextText !== activeOriginalText) {
        oncommit?.({ editId, text: nextText });
      }
    };

    element.addEventListener('keydown', keydownHandler);
    element.addEventListener('blur', blurHandler, { once: true });

    queueMicrotask(() => {
      element.focus();
      const selection = element.ownerDocument.getSelection();
      const range = element.ownerDocument.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    cleanupFrame = ((prev) => () => {
      prev?.();
      element.removeEventListener('keydown', keydownHandler);
      element.removeEventListener('blur', blurHandler);
      teardownActiveElement();
    })(cleanupFrame ?? null);
  }

  function teardownActiveElement(): void {
    if (!activeElement) return;
    activeElement.contentEditable = 'false';
    activeElement.style.outline = 'none';
    activeElement.style.outlineOffset = '0';
    delete activeElement.dataset.editing;
    activeElement = null;
    activeOriginalText = '';
  }
</script>

<div class={`canvas-shell ${format === 'slides_16_9' ? 'landscape' : 'portrait'}`} bind:this={containerEl}>
  {#key frameKey}
    <div class="scaled-stage" style="width: {scaledWidth}px; height: {scaledHeight}px;">
      <div class="scale-stage" style="transform: scale({scale}); width: {NATIVE_WIDTH}px; height: {NATIVE_HEIGHT}px;">
        <iframe
          bind:this={iframeEl}
          class="slide-frame"
          srcdoc={html}
          sandbox="allow-same-origin"
          title="Selected slide preview"
          style="width: {NATIVE_WIDTH}px; height: {NATIVE_HEIGHT}px;"
          onload={handleLoad}
        ></iframe>
      </div>
    </div>
  {/key}
</div>

<style>
  .canvas-shell {
    position: relative;
    width: 100%;
    min-height: 280px;
    overflow: hidden;
    border-radius: var(--r-lg);
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle at top, rgba(255, 250, 242, 0.92), rgba(235, 221, 201, 0.72)),
      linear-gradient(180deg, rgba(92, 64, 41, 0.08), rgba(92, 64, 41, 0));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.65),
      inset 0 -1px 0 rgba(92, 64, 41, 0.08);
  }

  .landscape {
    aspect-ratio: 16 / 9;
    max-height: min(68vh, 860px);
  }

  .portrait {
    aspect-ratio: auto;
    max-height: min(80vh, 900px);
  }

  .scale-stage {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: top left;
  }

  .scaled-stage {
    position: relative;
    flex: 0 0 auto;
    max-width: 100%;
    max-height: 100%;
    overflow: hidden;
  }

  .slide-frame {
    border: 0;
    display: block;
    background: white;
    box-shadow:
      0 30px 70px rgba(44, 27, 12, 0.18),
      0 6px 18px rgba(44, 27, 12, 0.12);
  }

  @media (max-width: 860px) {
    .canvas-shell {
      max-height: none;
      min-height: 220px;
    }
  }
</style>
