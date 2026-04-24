<!--
  AssetUploader — inline form for selecting scope + role, reading the
  chosen file, encoding to base64, and calling upload_asset_from_app.

  Scope options are context-aware: deck/soul only appear when an
  active deck/soul is known, so the user never picks a scope that
  the uploader can't satisfy. Role is a simple logo / content toggle
  matching the server's `UploadRole`.

  Enforces a 5 MB client-side cap mirroring the server validation.
-->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { McpDeckEditorBridge } from './bridge';

  type UploadScope = 'soul' | 'deck' | 'global';
  type UploadRole = 'logo' | 'content';
  type UploadMime = 'image/png' | 'image/jpeg' | 'image/svg+xml' | 'image/webp';

  interface Props {
    bridge: McpDeckEditorBridge;
    activeDeckRef?: string;
    activeSoulRef?: string;
    activeDeckTitle?: string;
    activeSoulName?: string;
    onUploaded?: (assetId: string) => void;
  }

  let {
    bridge,
    activeDeckRef,
    activeSoulRef,
    activeDeckTitle,
    activeSoulName,
    onUploaded,
  }: Props = $props();

  const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
  const ALLOWED_MIMES: readonly UploadMime[] = [
    'image/png',
    'image/jpeg',
    'image/svg+xml',
    'image/webp',
  ];

  // Default scope preference: deck > soul > global, based on context.
  // Starts at 'global' until onMount picks a better default — avoids
  // capturing prop values outside a reactive scope.
  let scope = $state<UploadScope>('global');
  let role = $state<UploadRole>('content');
  let uploading = $state(false);
  let error = $state('');
  let inputEl = $state<HTMLInputElement | null>(null);

  onMount(() => {
    untrack(() => {
      if (activeDeckRef) scope = 'deck';
      else if (activeSoulRef) scope = 'soul';
    });
  });

  // If the active context changes and the current scope becomes
  // unavailable (e.g. user switched away from the deck), fall back.
  $effect(() => {
    if (scope === 'deck' && !activeDeckRef) scope = activeSoulRef ? 'soul' : 'global';
    if (scope === 'soul' && !activeSoulRef) scope = activeDeckRef ? 'deck' : 'global';
  });

  function normaliseMime(t: string): UploadMime | null {
    const lower = t.toLowerCase();
    return (ALLOWED_MIMES as readonly string[]).includes(lower) ? (lower as UploadMime) : null;
  }

  async function handleChange(e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    error = '';

    if (file.size > MAX_BYTES) {
      error = `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum is 5 MB.`;
      if (inputEl) inputEl.value = '';
      return;
    }

    const mime = normaliseMime(file.type || '');
    if (!mime) {
      error = `Unsupported file type: ${file.type || 'unknown'}. Allowed: PNG, JPEG, SVG, WebP.`;
      if (inputEl) inputEl.value = '';
      return;
    }

    // Build the structured scope expected by upload_asset_from_app.
    let resolvedScope:
      | { type: 'soul'; soul_ref: string }
      | { type: 'deck'; deck_ref: string }
      | { type: 'global' };
    if (scope === 'soul') {
      if (!activeSoulRef) {
        error = 'Pick a soul first — the Souls route lets you select one.';
        if (inputEl) inputEl.value = '';
        return;
      }
      resolvedScope = { type: 'soul', soul_ref: activeSoulRef };
    } else if (scope === 'deck') {
      if (!activeDeckRef) {
        error = 'Open a deck first — the Workspace lists your decks.';
        if (inputEl) inputEl.value = '';
        return;
      }
      resolvedScope = { type: 'deck', deck_ref: activeDeckRef };
    } else {
      resolvedScope = { type: 'global' };
    }

    uploading = true;
    try {
      const data_base64 = await fileToBase64(file);
      const label = file.name;
      const result = await bridge.uploadAssetFromApp({
        data_base64,
        mime_type: mime,
        scope: resolvedScope,
        role,
        label,
      });
      onUploaded?.(result.asset.asset_id);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      uploading = false;
      if (inputEl) inputEl.value = '';
    }
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip the data URL prefix (data:...;base64,)
        const comma = result.indexOf(',');
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  function triggerPicker(): void {
    inputEl?.click();
  }

  function scopeLabel(s: UploadScope): string {
    if (s === 'deck') return activeDeckTitle ? `This deck · ${activeDeckTitle}` : 'This deck';
    if (s === 'soul') return activeSoulName ? `This soul · ${activeSoulName}` : 'This soul';
    return 'Global (any deck)';
  }
</script>

<div class="uploader">
  <div class="row" role="group" aria-label="Upload destination">
    <fieldset class="seg">
      <legend class="seg-label">Save to</legend>
      <div class="seg-options">
        <label class={`seg-opt ${scope === 'deck' ? 'active' : ''} ${!activeDeckRef ? 'disabled' : ''}`}>
          <input
            type="radio"
            name="upload-scope"
            value="deck"
            bind:group={scope}
            disabled={!activeDeckRef}
          />
          <span>{scopeLabel('deck')}</span>
        </label>
        <label class={`seg-opt ${scope === 'soul' ? 'active' : ''} ${!activeSoulRef ? 'disabled' : ''}`}>
          <input
            type="radio"
            name="upload-scope"
            value="soul"
            bind:group={scope}
            disabled={!activeSoulRef}
          />
          <span>{scopeLabel('soul')}</span>
        </label>
        <label class={`seg-opt ${scope === 'global' ? 'active' : ''}`}>
          <input
            type="radio"
            name="upload-scope"
            value="global"
            bind:group={scope}
          />
          <span>{scopeLabel('global')}</span>
        </label>
      </div>
    </fieldset>

    <fieldset class="seg">
      <legend class="seg-label">Use as</legend>
      <div class="seg-options">
        <label class={`seg-opt ${role === 'content' ? 'active' : ''}`}>
          <input type="radio" name="upload-role" value="content" bind:group={role} />
          <span>Content</span>
        </label>
        <label class={`seg-opt ${role === 'logo' ? 'active' : ''}`}>
          <input type="radio" name="upload-role" value="logo" bind:group={role} />
          <span>Logo</span>
        </label>
      </div>
    </fieldset>
  </div>

  <input
    bind:this={inputEl}
    type="file"
    accept="image/png,image/jpeg,image/svg+xml,image/webp"
    onchange={handleChange}
    aria-label="Choose file to upload"
    class="file-input"
    disabled={uploading}
  />
  <button
    type="button"
    class="upload-btn"
    onclick={triggerPicker}
    disabled={uploading}
    aria-busy={uploading}
  >
    {#if uploading}
      <span class="btn-spinner" aria-hidden="true"></span>
      Uploading…
    {:else}
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        <path d="M10 13V4M6 8l4-4 4 4" stroke-linecap="round" stroke-linejoin="round" />
        <path d="M3 14v1a2 2 0 002 2h10a2 2 0 002-2v-1" stroke-linecap="round" />
      </svg>
      Choose file…
    {/if}
  </button>

  <p class="hint">PNG, JPEG, SVG, or WebP — up to 5 MB.</p>

  {#if error}
    <p class="error-msg" role="alert">{error}</p>
  {/if}
</div>

<style>
  .uploader {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    padding: var(--s-3) var(--s-4);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-4);
    align-items: flex-start;
  }

  .seg {
    border: 0;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    min-width: 0;
  }

  .seg-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-3);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    padding: 0;
  }

  .seg-options {
    display: inline-flex;
    background: var(--surface-2);
    border-radius: var(--r-pill);
    padding: 2px;
    gap: 2px;
    flex-wrap: wrap;
  }

  .seg-opt {
    display: inline-flex;
    align-items: center;
    padding: 4px var(--s-3);
    font-size: 12px;
    color: var(--ink-2);
    border-radius: var(--r-pill);
    cursor: pointer;
    transition:
      background-color var(--dur-micro) var(--ease),
      color var(--dur-micro) var(--ease);
  }

  .seg-opt input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .seg-opt:hover:not(.disabled) {
    color: var(--ink-1);
  }

  .seg-opt.active {
    background: var(--surface-1);
    color: var(--mint-hover);
    box-shadow: var(--e1);
  }

  .seg-opt.disabled {
    color: var(--ink-3);
    opacity: 0.45;
    cursor: not-allowed;
  }

  .file-input {
    display: none;
  }

  .upload-btn {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-2) var(--s-4);
    border: 1.5px solid var(--mint);
    border-radius: var(--r-md);
    background: var(--mint-tint);
    color: var(--mint-hover);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background-color var(--dur-micro) var(--ease),
      box-shadow var(--dur-micro) var(--ease);
  }

  .upload-btn:hover:not(:disabled) {
    background: var(--mint);
    color: #fff;
  }

  .upload-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--mint-tint);
  }

  .upload-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .upload-btn svg {
    width: 16px;
    height: 16px;
  }

  .btn-spinner {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid currentColor;
    border-top-color: transparent;
    animation: spin 0.7s linear infinite;
    display: inline-block;
    flex-shrink: 0;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .hint {
    font-size: 11px;
    color: var(--ink-3);
    margin: 0;
  }

  .error-msg {
    font-size: 12px;
    color: var(--error);
    margin: 0;
    max-width: 340px;
  }
</style>
