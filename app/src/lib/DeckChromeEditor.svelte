<!--
  DeckChromeEditor — modal editor for slide-mode deck chrome
  (header / footer regions with up to 3 slots each).

  v4.18 — closes the agent-only gap where Deck.chrome could only be set
  via the MCP tool. Surface in the slide-mode editor toolbar, opens a
  modal that lets the user pick header.{left,center,right} and
  footer.{left,center,right} slots, each one of:
    - logo       (asset_id picker from listAssets logos + height)
    - text       (plain string content)
    - page_number (format: 1 / 1/N / 01)
  Plus showOnCover toggle and "Clear chrome" action.

  Wired from Editor.svelte. Calls bridge.setDeckChrome on Save.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Button } from './primitives/index';
  import type {
    McpDeckEditorBridge,
  } from './bridge';
  import type {
    DeckChromeConfig,
    DeckChromeSlot,
    DeckChromeRegion,
    DeckChromeLogoHeight,
    DeckChromePageNumberFormat,
  } from './types';

  interface LogoAsset {
    asset_id: string;
    label?: string;
    name?: string;
    filename?: string;
    mime_type: string;
    role: string;
    data_base64?: string;
  }

  interface Props {
    bridge: McpDeckEditorBridge;
    deckId: string;
    open: boolean;
    initial: DeckChromeConfig | null;
    onSaved: (chrome: DeckChromeConfig | null) => void;
    onClose: () => void;
  }

  let { bridge, deckId, open, initial, onSaved, onClose }: Props = $props();

  type SlotKind = 'none' | 'logo' | 'text' | 'page_number';
  type Region = 'header' | 'footer';
  type Slot = 'left' | 'center' | 'right';

  interface SlotState {
    kind: SlotKind;
    asset_id?: string;
    height?: DeckChromeLogoHeight;
    text?: string;
    pageFormat?: DeckChromePageNumberFormat;
  }

  function emptySlot(): SlotState {
    return { kind: 'none' };
  }

  // Local edit state — flat dictionary keyed by `${region}.${slot}`.
  let slots = $state<Record<string, SlotState>>({
    'header.left': emptySlot(),
    'header.center': emptySlot(),
    'header.right': emptySlot(),
    'footer.left': emptySlot(),
    'footer.center': emptySlot(),
    'footer.right': emptySlot(),
  });
  let showOnCover = $state(false);
  let logos = $state<LogoAsset[]>([]);
  let logosLoaded = $state(false);
  let saving = $state(false);
  let error = $state('');

  function richTextToPlain(rt: unknown): string {
    if (typeof rt === 'string') return rt;
    if (Array.isArray(rt)) {
      return rt
        .map((r) => {
          if (typeof r === 'string') return r;
          if (r && typeof r === 'object' && 'text' in r && typeof r.text === 'string') {
            return r.text;
          }
          return '';
        })
        .join('');
    }
    return '';
  }

  function loadFromInitial(): void {
    const fresh: Record<string, SlotState> = {
      'header.left': emptySlot(),
      'header.center': emptySlot(),
      'header.right': emptySlot(),
      'footer.left': emptySlot(),
      'footer.center': emptySlot(),
      'footer.right': emptySlot(),
    };
    if (initial) {
      for (const region of ['header', 'footer'] as const) {
        const r = initial[region];
        if (!r) continue;
        for (const slot of ['left', 'center', 'right'] as const) {
          const s: DeckChromeSlot | undefined = r[slot];
          if (!s) continue;
          const key = `${region}.${slot}`;
          if (s.kind === 'logo') {
            fresh[key] = { kind: 'logo', asset_id: s.asset_id, height: s.height ?? 'md' };
          } else if (s.kind === 'text') {
            fresh[key] = { kind: 'text', text: richTextToPlain(s.content) };
          } else if (s.kind === 'page_number') {
            fresh[key] = { kind: 'page_number', pageFormat: s.format ?? '1/N' };
          }
        }
      }
      showOnCover = initial.showOnCover === true;
    } else {
      showOnCover = false;
    }
    slots = fresh;
    error = '';
  }

  $effect(() => {
    if (open) {
      loadFromInitial();
      if (!logosLoaded) void loadLogos();
    }
  });

  async function loadLogos(): Promise<void> {
    try {
      const list = await bridge.listAssets();
      const all = list.assets ?? [];
      logos = all.filter((a: LogoAsset) =>
        typeof a.mime_type === 'string'
        && a.mime_type.startsWith('image/')
        && a.role === 'logo',
      );
      logosLoaded = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  function setKind(region: Region, slot: Slot, kind: SlotKind): void {
    const key = `${region}.${slot}`;
    if (kind === 'logo') {
      slots[key] = { kind, asset_id: logos[0]?.asset_id ?? '', height: 'md' };
    } else if (kind === 'text') {
      slots[key] = { kind, text: '' };
    } else if (kind === 'page_number') {
      slots[key] = { kind, pageFormat: '1/N' };
    } else {
      slots[key] = emptySlot();
    }
  }

  function buildSlot(s: SlotState): DeckChromeSlot | undefined {
    if (s.kind === 'logo') {
      if (!s.asset_id) return undefined;
      const out: DeckChromeSlot = { kind: 'logo', asset_id: s.asset_id };
      if (s.height) (out as { height?: DeckChromeLogoHeight }).height = s.height;
      return out;
    }
    if (s.kind === 'text') {
      const text = (s.text ?? '').trim();
      if (!text) return undefined;
      return { kind: 'text', content: [{ text }] };
    }
    if (s.kind === 'page_number') {
      const out: DeckChromeSlot = { kind: 'page_number' };
      if (s.pageFormat) (out as { format?: DeckChromePageNumberFormat }).format = s.pageFormat;
      return out;
    }
    return undefined;
  }

  function buildChrome(): DeckChromeConfig | null {
    const buildRegion = (region: Region): DeckChromeRegion | undefined => {
      const r: DeckChromeRegion = {};
      const l = buildSlot(slots[`${region}.left`]);
      const c = buildSlot(slots[`${region}.center`]);
      const ri = buildSlot(slots[`${region}.right`]);
      if (l) r.left = l;
      if (c) r.center = c;
      if (ri) r.right = ri;
      return Object.keys(r).length > 0 ? r : undefined;
    };
    const header = buildRegion('header');
    const footer = buildRegion('footer');
    // showOnCover alone with no regions is a no-op chrome — clear instead
    // of persisting an empty wrapper.
    if (!header && !footer) return null;
    const out: DeckChromeConfig = {};
    if (header) out.header = header;
    if (footer) out.footer = footer;
    if (showOnCover) out.showOnCover = true;
    return out;
  }

  async function save(): Promise<void> {
    saving = true;
    error = '';
    try {
      const chrome = buildChrome();
      const result = await bridge.setDeckChrome({ deck_id: deckId, chrome });
      onSaved(result.chrome ?? null);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      saving = false;
    }
  }

  async function clear(): Promise<void> {
    saving = true;
    error = '';
    try {
      const result = await bridge.setDeckChrome({ deck_id: deckId, chrome: null });
      onSaved(result.chrome ?? null);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      saving = false;
    }
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      onClose();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });

  function logoLabel(a: LogoAsset): string {
    return a.label || a.name || a.filename || a.asset_id.slice(0, 8);
  }
</script>

{#if open}
  <button
    type="button"
    class="dc-scrim"
    aria-label="Close"
    onclick={onClose}
  ></button>
  <div class="dc-modal" role="dialog" aria-label="Deck chrome">
    <div class="dc-head">
      <p class="eyebrow">Deck chrome</p>
      <Button variant="ghost" size="sm" onclick={onClose}>Close</Button>
    </div>
    <div class="dc-body">
      <p class="muted">
        Header / footer regions render on every slide. Cover slide
        (position 0) is suppressed by default — toggle "Show on cover"
        below to include it.
      </p>

      {#each ['header', 'footer'] as region (region)}
        <section class="dc-region">
          <h3 class="dc-region-title">{region === 'header' ? 'Header' : 'Footer'}</h3>
          <div class="dc-slots">
            {#each ['left', 'center', 'right'] as slot (slot)}
              {@const key = `${region}.${slot}`}
              {@const s = slots[key]}
              <div class="dc-slot">
                <span class="dc-slot-label">{slot}</span>
                <select
                  aria-label={`${region} ${slot} slot kind`}
                  value={s.kind}
                  onchange={(e) => setKind(region as Region, slot as Slot, (e.currentTarget as HTMLSelectElement).value as SlotKind)}
                >
                  <option value="none">— empty —</option>
                  <option value="logo">Logo</option>
                  <option value="text">Text</option>
                  <option value="page_number">Page number</option>
                </select>

                {#if s.kind === 'logo'}
                  {#if logos.length === 0}
                    <p class="muted small">
                      No logo assets uploaded. Upload one with role "logo"
                      in the Assets panel first.
                    </p>
                  {:else}
                    <select
                      value={s.asset_id ?? ''}
                      onchange={(e) => slots[key] = { ...s, asset_id: (e.currentTarget as HTMLSelectElement).value }}
                    >
                      {#each logos as l (l.asset_id)}
                        <option value={l.asset_id}>{logoLabel(l)}</option>
                      {/each}
                    </select>
                    <select
                      value={s.height ?? 'md'}
                      onchange={(e) => slots[key] = { ...s, height: (e.currentTarget as HTMLSelectElement).value as DeckChromeLogoHeight }}
                    >
                      <option value="sm">Small</option>
                      <option value="md">Medium</option>
                      <option value="lg">Large</option>
                    </select>
                  {/if}
                {:else if s.kind === 'text'}
                  <input
                    type="text"
                    placeholder="Text content"
                    value={s.text ?? ''}
                    oninput={(e) => slots[key] = { ...s, text: (e.currentTarget as HTMLInputElement).value }}
                  />
                {:else if s.kind === 'page_number'}
                  <select
                    value={s.pageFormat ?? '1/N'}
                    onchange={(e) => slots[key] = { ...s, pageFormat: (e.currentTarget as HTMLSelectElement).value as DeckChromePageNumberFormat }}
                  >
                    <option value="1">1</option>
                    <option value="1/N">1 / N</option>
                    <option value="01">01</option>
                  </select>
                {/if}
              </div>
            {/each}
          </div>
        </section>
      {/each}

      <label class="dc-cover">
        <input
          type="checkbox"
          checked={showOnCover}
          onchange={(e) => showOnCover = (e.currentTarget as HTMLInputElement).checked}
        />
        Show chrome on cover (position 0)
      </label>

      {#if error}
        <p class="error">{error}</p>
      {/if}
    </div>
    <div class="dc-foot">
      <Button variant="ghost" size="sm" onclick={clear} disabled={saving}>
        Clear chrome
      </Button>
      <div class="dc-foot-right">
        <Button variant="ghost" size="sm" onclick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onclick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dc-scrim {
    position: fixed;
    inset: 0;
    border: 0;
    background: rgba(31, 35, 40, 0.18);
    z-index: 50;
    cursor: pointer;
  }

  .dc-modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(720px, calc(100vw - 80px));
    max-height: min(80vh, 640px);
    z-index: 51;
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    box-shadow: var(--e3);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: hidden;
  }

  .dc-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--s-3) var(--s-4);
    border-bottom: 1px solid var(--border-hairline);
  }

  .dc-body {
    padding: var(--s-3) var(--s-4) var(--s-4);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }

  .dc-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
    padding: var(--s-3) var(--s-4);
    border-top: 1px solid var(--border-hairline);
  }

  .dc-foot-right {
    display: flex;
    gap: var(--s-2);
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

  .muted.small {
    font-size: 11px;
  }

  .error {
    color: var(--terracotta);
    font-size: 13px;
    margin: 0;
  }

  .dc-region {
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-md);
    padding: var(--s-3);
  }

  .dc-region-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-1);
    margin: 0 0 var(--s-2);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .dc-slots {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-3);
  }

  .dc-slot {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
  }

  .dc-slot-label {
    font-size: 11px;
    color: var(--ink-3);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .dc-slot select,
  .dc-slot input[type='text'] {
    font-size: 12px;
    padding: var(--s-1) var(--s-2);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-sm);
    background: var(--surface-1);
    color: var(--ink-1);
    width: 100%;
  }

  .dc-cover {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    font-size: 13px;
    color: var(--ink-1);
  }
</style>
