<!--
  AssetUploader — file picker that reads the chosen file, encodes to base64,
  and calls upload_asset_from_app via the bridge. Enforces a 5 MB client-side cap.
-->
<script lang="ts">
  import type { McpDeckEditorBridge } from './bridge';

  interface Props {
    bridge: McpDeckEditorBridge;
    scope?: string;
    role?: string;
    onUploaded?: (assetId: string) => void;
  }

  let { bridge, scope = 'global', role = 'content', onUploaded }: Props = $props();

  const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

  let uploading = $state(false);
  let error = $state('');
  let inputEl = $state<HTMLInputElement | null>(null);

  async function handleChange(e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    error = '';

    if (file.size > MAX_BYTES) {
      error = `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB. Maximum is 5 MB.`;
      if (inputEl) inputEl.value = '';
      return;
    }

    uploading = true;
    try {
      const data_base64 = await fileToBase64(file);
      const label = file.name;
      const result = await bridge.uploadAssetFromApp({
        data_base64,
        mime_type: file.type || 'application/octet-stream',
        scope,
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
</script>

<div class="uploader">
  <input
    bind:this={inputEl}
    type="file"
    accept="image/*,application/pdf,.svg,.png,.jpg,.jpeg,.gif,.webp"
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
      Upload asset
    {/if}
  </button>
  {#if error}
    <p class="error-msg" role="alert">{error}</p>
  {/if}
</div>

<style>
  .uploader {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--s-2);
  }

  .file-input {
    display: none;
  }

  .upload-btn {
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

  .error-msg {
    font-size: 12px;
    color: var(--error);
    margin: 0;
    max-width: 340px;
  }
</style>
