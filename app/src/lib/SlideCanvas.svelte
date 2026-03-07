<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';

  export let html = '';
  export let revisionHash = '';
  export let renderNonce = 0;
  export let disabled = false;

  const dispatch = createEventDispatcher<{
    commit: { editId: string; text: string };
    error: { message: string };
  }>();

  const NATIVE_WIDTH = 1920;
  const NATIVE_HEIGHT = 1080;

  let containerEl: HTMLDivElement | null = null;
  let iframeEl: HTMLIFrameElement | null = null;
  let scale = 1;
  let cleanupFrame: (() => void) | null = null;
  let activeElement: HTMLElement | null = null;
  let activeOriginalText = '';

  $: frameKey = `${revisionHash}:${renderNonce}`;
  $: scaledWidth = NATIVE_WIDTH * scale;
  $: scaledHeight = NATIVE_HEIGHT * scale;

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
    if (!containerEl) {
      return;
    }

    const widthScale = containerEl.clientWidth / NATIVE_WIDTH;
    const heightScale = containerEl.clientHeight / NATIVE_HEIGHT;
    scale = Math.min(widthScale, heightScale, 1);
  }

  function handleLoad(): void {
    cleanupFrame?.();
    updateScale();

    const doc = iframeEl?.contentDocument;
    if (!doc) {
      return;
    }

    const clickHandler = (event: MouseEvent) => {
      if (disabled) {
        return;
      }

      const target = event.target instanceof HTMLElement
        ? event.target.closest<HTMLElement>('[data-edit-id]')
        : null;

      if (!target) {
        return;
      }

      event.preventDefault();
      startEditing(target);
    };

    doc.addEventListener('click', clickHandler);
    doc.querySelectorAll<HTMLElement>('[data-edit-id]').forEach((element) => {
      element.style.cursor = disabled ? 'default' : 'text';
    });

    cleanupFrame = () => {
      doc.removeEventListener('click', clickHandler);
      teardownActiveElement();
    };
  }

  function startEditing(element: HTMLElement): void {
    if (activeElement === element) {
      return;
    }

    teardownActiveElement();

    activeElement = element;
    activeOriginalText = element.innerText;
    element.contentEditable = 'true';
    element.dataset.editing = 'true';
    element.style.outline = '2px solid rgba(11, 127, 110, 0.65)';
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
        dispatch('error', { message: 'Editable node is missing data-edit-id.' });
        return;
      }

      if (nextText !== activeOriginalText) {
        dispatch('commit', { editId, text: nextText });
      }
    };

    element.addEventListener('keydown', keydownHandler);
    element.addEventListener('blur', blurHandler, { once: true });
    element.dataset.keydownBound = 'true';
    element.dataset.blurBound = 'true';

    queueMicrotask(() => {
      element.focus();
      const selection = element.ownerDocument.getSelection();
      const range = element.ownerDocument.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
    });

    cleanupFrame = ((previousCleanup) => () => {
      previousCleanup?.();
      element.removeEventListener('keydown', keydownHandler);
      element.removeEventListener('blur', blurHandler);
      teardownActiveElement();
    })(cleanupFrame ?? null);
  }

  function teardownActiveElement(): void {
    if (!activeElement) {
      return;
    }

    activeElement.contentEditable = 'false';
    activeElement.style.outline = 'none';
    activeElement.style.outlineOffset = '0';
    delete activeElement.dataset.editing;
    activeElement = null;
    activeOriginalText = '';
  }
</script>

<div class="canvas-shell" bind:this={containerEl}>
  {#key frameKey}
    <div class="scaled-stage" style={`width: ${scaledWidth}px; height: ${scaledHeight}px;`}>
      <div class="scale-stage" style={`transform: scale(${scale}); width: ${NATIVE_WIDTH}px; height: ${NATIVE_HEIGHT}px;`}>
        <iframe
          bind:this={iframeEl}
          class="slide-frame"
          srcdoc={html}
          sandbox="allow-same-origin"
          title="Selected slide preview"
          on:load={handleLoad}
        ></iframe>
      </div>
    </div>
  {/key}
</div>

<style>
  .canvas-shell {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    min-height: 280px;
    max-height: min(68vh, 860px);
    overflow: hidden;
    border-radius: 24px;
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle at top, rgba(255, 250, 242, 0.92), rgba(235, 221, 201, 0.72)),
      linear-gradient(180deg, rgba(92, 64, 41, 0.08), rgba(92, 64, 41, 0));
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.65),
      inset 0 -1px 0 rgba(92, 64, 41, 0.08);
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
    width: 1920px;
    height: 1080px;
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
