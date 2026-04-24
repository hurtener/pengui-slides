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
    /**
     * When non-null, the element with this editId is considered "about
     * to receive a pin" and is drawn with a persistent highlight so the
     * user doesn't forget what they picked while writing their note.
     */
    draftPinnedEditId?: string | null;
    oncommit?: (detail: { editId: string; text: string }) => void;
    onpintarget?: (detail: { editId: string; preview?: string }) => void;
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
    draftPinnedEditId = null,
    oncommit,
    onpintarget,
    onerror,
  }: Props = $props();

  const dims = $derived(FORMAT_DIMS[format] ?? FORMAT_DIMS.slides_16_9);
  const NATIVE_WIDTH = $derived(dims.width);
  const NATIVE_HEIGHT = $derived(dims.height);

  // ── In-iframe click bridge ──────────────────────────────────────────────
  // The iframe runs this bridge script (via `allow-scripts` + srcdoc) so
  // click detection happens inside the iframe's own JS context, which
  // sidesteps every parent-attached-listener / reactivity-in-closure risk.
  // The bridge postMessages editIds back to the parent, which routes them
  // to onpintarget.
  const BRIDGE_SCRIPT = `<script>(function(){
  var root = document.documentElement;
  function resolve(e){
    var t = e.target && e.target.closest ? e.target.closest('[data-edit-id]') : null;
    if (t) return t;
    var stack = document.elementsFromPoint(e.clientX, e.clientY) || [];
    for (var i = 0; i < stack.length; i++) {
      if (stack[i].dataset && stack[i].dataset.editId) return stack[i];
    }
    return null;
  }
  function preview(t){
    if (!t) return '';
    var raw = (t.innerText || t.textContent || '').replace(/\\s+/g, ' ').trim();
    return raw.length > 80 ? raw.slice(0, 77) + '…' : raw;
  }
  document.addEventListener('click', function(e){
    var t = resolve(e);
    var editId = t ? t.dataset.editId : null;
    var text = preview(t);
    var pinMode = root.dataset.penguiPinMode === 'true';
    window.parent.postMessage({
      source: 'pengui-slide',
      type: 'click-debug',
      pinMode: pinMode,
      editId: editId,
      preview: text,
      targetTag: e.target ? (e.target.tagName || '') : '',
      clientX: e.clientX, clientY: e.clientY,
      ts: Date.now()
    }, '*');
    if (pinMode && editId) {
      e.preventDefault();
      e.stopPropagation();
      window.parent.postMessage({
        source: 'pengui-slide',
        type: 'pintarget',
        editId: editId,
        preview: text
      }, '*');
    }
  }, true);
})();<\/script>`;

  function enrichHtml(raw: string): string {
    if (!raw) return raw;
    return raw.includes('</body>')
      ? raw.replace('</body>', BRIDGE_SCRIPT + '</body>')
      : raw + BRIDGE_SCRIPT;
  }

  // ── State ───────────────────────────────────────────────────────────────
  let containerEl: HTMLDivElement | null = $state(null);
  let iframeEl: HTMLIFrameElement | null = $state(null);
  let iframeReady = $state(0); // bumps on each onload
  let scale = $state(1);

  // $state mirrors of the props the click paths consume. Defense against
  // Svelte 5 destructured-prop closure staleness inside DOM event handlers
  // attached from $effects. An $effect syncs them below.
  let pinModeState = $state(false);
  let disabledState = $state(false);
  let onpintargetRef = $state<Props['onpintarget']>(undefined);

  // Debug panel state — opt-in via `localStorage.setItem('pengui-pin-debug', '1')`
  // so we can re-enable it the next time pin-mode behaves oddly without
  // shipping the panel to end users.
  interface DebugEvent {
    ts: number;
    editId: string | null;
    preview: string;
    targetTag: string;
    pinMode: boolean;
    clientX: number;
    clientY: number;
  }
  let debugEvents = $state<DebugEvent[]>([]);
  let debugEnabled = $state(false);
  if (typeof window !== 'undefined') {
    try {
      debugEnabled = window.localStorage.getItem('pengui-pin-debug') === '1';
    } catch {
      debugEnabled = false;
    }
  }

  let activeClickHandler: ((e: MouseEvent) => void) | null = null;
  let activeElement: HTMLElement | null = null;
  let activeOriginalText = '';
  let activeKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  let activeBlurHandler: (() => void) | null = null;

  const frameKey = $derived(`${revisionHash}:${renderNonce}`);
  const scaledWidth = $derived(NATIVE_WIDTH * scale);
  const scaledHeight = $derived(NATIVE_HEIGHT * scale);
  const enrichedHtml = $derived(enrichHtml(html));

  // editableCount is recomputed when iframeReady bumps. Used by the debug
  // panel to confirm the iframe actually has elements with data-edit-id.
  const editableCount = $derived.by(() => {
    void iframeReady;
    try {
      return iframeEl?.contentDocument?.querySelectorAll('[data-edit-id]').length ?? 0;
    } catch {
      return 0;
    }
  });

  // ── Lifecycle ───────────────────────────────────────────────────────────
  onMount(() => {
    const resizeObserver = new ResizeObserver(() => updateScale());
    if (containerEl) {
      resizeObserver.observe(containerEl);
    }
    window.addEventListener('message', handleIframeMessage);

    return () => {
      window.removeEventListener('message', handleIframeMessage);
      detachClickHandler();
      teardownActiveElement();
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
    updateScale();
    iframeReady += 1;
  }

  // ── Prop → $state syncs ─────────────────────────────────────────────────
  $effect(() => { pinModeState = pinMode; });
  $effect(() => { disabledState = disabled; });
  $effect(() => { onpintargetRef = onpintarget; });

  // Sync pin-mode into the iframe's documentElement dataset so the
  // in-iframe bridge script can read the current mode on every click.
  $effect(() => {
    void iframeReady;
    void pinModeState;
    const doc = iframeEl?.contentDocument;
    if (!doc) return;
    try {
      doc.documentElement.dataset.penguiPinMode = String(pinModeState);
    } catch {
      // ignore cross-frame access failures
    }
  });

  // ── postMessage listener (iframe → parent) ──────────────────────────────
  function handleIframeMessage(event: MessageEvent): void {
    const data = event.data as {
      source?: string;
      type?: string;
      editId?: string | null;
      preview?: string;
      targetTag?: string;
      pinMode?: boolean;
      clientX?: number;
      clientY?: number;
      ts?: number;
    } | null;
    if (!data || data.source !== 'pengui-slide') return;
    // Validate origin is our iframe, not some other frame in the page.
    if (iframeEl && event.source !== iframeEl.contentWindow) return;

    if (data.type === 'pintarget' && typeof data.editId === 'string') {
      onpintargetRef?.({ editId: data.editId, preview: data.preview ?? '' });
      return;
    }

    if (data.type === 'click-debug') {
      const ev: DebugEvent = {
        ts: data.ts ?? Date.now(),
        editId: data.editId ?? null,
        preview: data.preview ?? '',
        targetTag: data.targetTag ?? '',
        pinMode: !!data.pinMode,
        clientX: data.clientX ?? 0,
        clientY: data.clientY ?? 0,
      };
      debugEvents = [ev, ...debugEvents].slice(0, 10);
    }
  }

  // ── Parent-side click handler (TEXT EDIT PATH ONLY) ─────────────────────
  // Kept for inline text editing, which needs live DOM access to toggle
  // contentEditable on the clicked element. Bails in pin mode — the
  // iframe bridge owns that path.
  function detachClickHandler(): void {
    const doc = iframeEl?.contentDocument;
    if (doc && activeClickHandler) {
      doc.removeEventListener('click', activeClickHandler);
    }
    activeClickHandler = null;
  }

  $effect(() => {
    void iframeReady;
    void disabledState;
    void pinModeState;

    const doc = iframeEl?.contentDocument;
    if (!doc) return;

    detachClickHandler();

    const handler = (event: MouseEvent) => {
      // Pin-mode clicks are handled by the in-iframe bridge; skip here.
      if (pinModeState) return;
      if (disabledState) return;
      const target = resolveEditableTarget(event, doc);
      if (!target) return;
      event.preventDefault();
      startEditing(target);
    };

    doc.addEventListener('click', handler);
    activeClickHandler = handler;

    return () => {
      doc.removeEventListener('click', handler);
      if (activeClickHandler === handler) activeClickHandler = null;
    };
  });

  // ── Decorations (outlines + crosshair) ──────────────────────────────────
  $effect(() => {
    void iframeReady;
    void pinModeState;
    void pinnedEditIds;
    void draftPinnedEditId;
    const doc = iframeEl?.contentDocument;
    if (doc) applyPinDecorations(doc);
  });

  /**
   * Resolve a click inside the slide iframe to a specific `[data-edit-id]`
   * element. Text elements often sit behind shapes in z-order, so
   * closest() alone can miss them — fall back to elementsFromPoint.
   */
  function resolveEditableTarget(event: MouseEvent, doc: Document): HTMLElement | null {
    if (event.target instanceof Element) {
      const direct = event.target.closest<HTMLElement>('[data-edit-id]');
      if (direct) return direct;
    }
    if (typeof doc.elementsFromPoint !== 'function') return null;
    const stack = doc.elementsFromPoint(event.clientX, event.clientY);
    for (const el of stack) {
      if (el instanceof HTMLElement && el.dataset.editId) return el;
    }
    return null;
  }

  function applyPinDecorations(doc: Document): void {
    const editables = doc.querySelectorAll<HTMLElement>('[data-edit-id]');
    const pinnedSet = new Set(pinnedEditIds);
    editables.forEach((el) => {
      const editId = el.dataset.editId ?? '';
      const isPinned = editId ? pinnedSet.has(editId) : false;
      const isDraft = !!draftPinnedEditId && editId === draftPinnedEditId;

      if (isDraft) {
        // In-flight pin — the user just picked this, their note is
        // being composed. Visible, opaque highlight so they don't
        // forget the selection while typing.
        el.style.cursor = pinModeState ? 'crosshair' : 'text';
        el.style.outline = '2px solid rgba(47, 184, 166, 0.95)';
        el.style.outlineOffset = '3px';
        el.style.backgroundColor = 'rgba(47, 184, 166, 0.12)';
      } else if (pinModeState) {
        el.style.cursor = 'crosshair';
        el.style.outline = '1px dashed rgba(92, 64, 41, 0.4)';
        el.style.outlineOffset = '2px';
        el.style.backgroundColor = '';
      } else {
        el.style.cursor = disabledState ? 'default' : 'text';
        el.style.outline = isPinned ? '1px dashed rgba(47, 184, 166, 0.55)' : 'none';
        el.style.outlineOffset = isPinned ? '2px' : '0';
        el.style.backgroundColor = '';
      }
    });

    // In pin mode, the whole slide should feel clickable — shapes and
    // backgrounds without data-edit-id sit on top of text in z-order,
    // and users shouldn't see a default cursor over them.
    const STYLE_ID = 'pengui-pin-mode-cursor';
    const existing = doc.getElementById(STYLE_ID);
    if (pinModeState) {
      if (!existing) {
        const style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = '.slide, .slide * { cursor: crosshair !important; }';
        doc.head.appendChild(style);
      }
    } else {
      existing?.remove();
    }
  }

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

    activeKeyHandler = keydownHandler;
    activeBlurHandler = blurHandler;
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
  }

  function teardownActiveElement(): void {
    if (!activeElement) return;
    if (activeKeyHandler) activeElement.removeEventListener('keydown', activeKeyHandler);
    if (activeBlurHandler) activeElement.removeEventListener('blur', activeBlurHandler);
    activeKeyHandler = null;
    activeBlurHandler = null;
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
          srcdoc={enrichedHtml}
          sandbox="allow-same-origin allow-scripts"
          title="Selected slide preview"
          style="width: {NATIVE_WIDTH}px; height: {NATIVE_HEIGHT}px;"
          onload={handleLoad}
        ></iframe>
      </div>
    </div>
  {/key}

  {#if debugEnabled && (pinModeState || debugEvents.length > 0)}
    <div class="pin-debug" role="log" aria-label="Pin-mode debug panel">
      <div class="pin-debug-head">
        <span>pin-mode debug</span>
        <button
          type="button"
          class="pin-debug-clear"
          onclick={() => { debugEvents = []; }}
          aria-label="Clear debug events"
        >clear</button>
      </div>
      <div class="pin-debug-state">
        pinMode={pinModeState} · disabled={disabledState} · editables={editableCount}
      </div>
      {#if debugEvents.length === 0}
        <div class="pin-debug-empty">No clicks yet. Click inside the slide.</div>
      {:else}
        {#each debugEvents as ev (ev.ts)}
          <div class={`pin-debug-row ${ev.editId ? 'hit' : 'miss'}`}>
            <span class="pin-debug-id">{ev.editId ?? '—'}</span>
            <span class="pin-debug-tag">{ev.targetTag}</span>
            <span class="pin-debug-coords">{ev.clientX},{ev.clientY}</span>
          </div>
        {/each}
      {/if}
    </div>
  {/if}
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

  /* ── Debug panel (removable after pinning is confirmed stable) ──── */
  .pin-debug {
    position: absolute;
    bottom: 8px;
    right: 8px;
    max-width: 320px;
    min-width: 220px;
    font-family: var(--font-mono, ui-monospace, Menlo, monospace);
    font-size: 10px;
    line-height: 1.4;
    background: rgba(18, 18, 18, 0.88);
    color: #f5f5f5;
    border-radius: 6px;
    padding: 6px 8px;
    z-index: 10;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .pin-debug-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
    color: #a5f3d4;
  }

  .pin-debug-clear {
    font-size: 10px;
    font-family: inherit;
    color: #f5f5f5;
    background: rgba(255, 255, 255, 0.12);
    border: 0;
    border-radius: 3px;
    padding: 1px 6px;
    cursor: pointer;
  }

  .pin-debug-clear:hover {
    background: rgba(255, 255, 255, 0.22);
  }

  .pin-debug-state {
    color: #d0d0d0;
  }

  .pin-debug-empty {
    color: #888;
    font-style: italic;
  }

  .pin-debug-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 6px;
    padding: 1px 0;
    border-top: 1px dashed rgba(255, 255, 255, 0.08);
  }

  .pin-debug-row.hit .pin-debug-id {
    color: #6ee7b7;
  }

  .pin-debug-row.miss .pin-debug-id {
    color: #f87171;
  }

  .pin-debug-tag,
  .pin-debug-coords {
    color: #9ca3af;
  }

  @media (max-width: 860px) {
    .canvas-shell {
      max-height: none;
      min-height: 220px;
    }

    .pin-debug {
      max-width: calc(100% - 16px);
      font-size: 9px;
    }
  }
</style>
