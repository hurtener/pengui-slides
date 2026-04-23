<!--
  AssetCard — thumbnail + label + scope/role badges for one asset.
-->
<script lang="ts">
  import type { AssetItem } from './bridge';

  interface Props {
    asset: AssetItem;
    /** Optional override for the small scope label shown under the thumbnail. */
    label?: string;
    onclick?: () => void;
  }

  let { asset, label, onclick }: Props = $props();

  function scopeLabel(): string {
    if (label) return label;
    const s = asset.scope;
    if (s.type === 'global') return 'global';
    if (s.type === 'soul') return `soul:${(s.soulId ?? '').slice(0, 6)}`;
    return `deck:${(s.deckId ?? '').slice(0, 6)}`;
  }

  const isImage = $derived(asset.mime_type.startsWith('image/'));

  function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'short' });
    } catch {
      return iso;
    }
  }
</script>

<button
  type="button"
  class="asset-card"
  {onclick}
  aria-label="Asset: {asset.label ?? asset.asset_id}"
>
  <div class="asset-thumb">
    {#if isImage && asset.data_base64}
      <img
        src="data:{asset.mime_type};base64,{asset.data_base64}"
        alt={asset.label ?? 'Asset'}
        class="thumb-img"
      />
    {:else if isImage}
      <!-- image, no inline data — show placeholder icon -->
      <div class="thumb-placeholder img-placeholder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
    {:else}
      <div class="thumb-placeholder file-placeholder">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke-linecap="round" stroke-linejoin="round" />
          <polyline points="14 2 14 8 20 8" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
    {/if}
  </div>
  <div class="asset-meta">
    <span class="asset-label">{asset.label ?? asset.asset_id}</span>
    <div class="badge-row">
      <span class="badge scope">{scopeLabel()}</span>
      <span class="badge role">{asset.role}</span>
    </div>
    <span class="asset-info">{formatBytes(asset.size_bytes)} · {formatDate(asset.created_at)}</span>
  </div>
</button>

<style>
  .asset-card {
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    overflow: hidden;
    text-align: left;
    display: flex;
    flex-direction: column;
    width: 100%;
    transition:
      box-shadow var(--dur-micro) var(--ease),
      border-color var(--dur-micro) var(--ease),
      transform var(--dur-micro) var(--ease);
    cursor: pointer;
  }

  .asset-card:hover {
    border-color: var(--mint);
    box-shadow: var(--e2);
    transform: translateY(-2px);
  }

  .asset-card:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--mint-tint);
  }

  .asset-thumb {
    background: var(--surface-2);
    border-bottom: 1px solid var(--border-hairline);
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .thumb-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .thumb-placeholder {
    color: var(--ink-3);
    opacity: 0.45;
  }

  .thumb-placeholder svg {
    width: 40px;
    height: 40px;
  }

  .asset-meta {
    padding: var(--s-3) var(--s-3) var(--s-3);
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
  }

  .asset-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .badge-row {
    display: flex;
    gap: var(--s-1);
    flex-wrap: wrap;
  }

  .badge {
    font-size: 10px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: var(--r-pill);
    border: 1px solid var(--border-subtle);
    white-space: nowrap;
  }

  .badge.scope {
    background: var(--slate-tint);
    color: var(--slate);
    border-color: transparent;
  }

  .badge.role {
    background: var(--mint-tint);
    color: var(--mint-hover);
    border-color: transparent;
  }

  .asset-info {
    font-size: 11px;
    color: var(--ink-3);
    margin-top: var(--s-1);
  }
</style>
