<!--
  Export route — format-aware export panel.

  Slides: PPTX | PDF | HTML buttons.
  Print:  PDF button only (mode toggle: direct | image).
  Live preview via export_html.
  One-click download with toast feedback.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Button from '../lib/primitives/Button.svelte';
  import Card from '../lib/primitives/Card.svelte';
  import Pill from '../lib/primitives/Pill.svelte';
  import FormatBadge from '../lib/FormatBadge.svelte';
  import { toast } from '../stores/toast.svelte';
  import type { DeckStore } from '../stores/deck.svelte';
  import type { DeckEditorBridge, ExportResult, FormatKind } from '../lib/types';
  import type { McpDeckEditorBridge, DeckListItem } from '../lib/bridge';

  interface Props {
    deck: DeckStore;
    bridge: DeckEditorBridge;
    onSwitchDeck?: (deckId: string) => void;
  }

  let { deck, bridge, onSwitchDeck }: Props = $props();

  const state = $derived(deck.editorState);
  const deckFormat = $derived<FormatKind>(state?.deck.format ?? 'slides_16_9');
  const isPrint = $derived(deckFormat !== 'slides_16_9');

  let exportResult = $state<ExportResult | null>(null);
  let exporting = $state(false);
  let previewHtml = $state('');
  let previewLoading = $state(false);
  let previewError = $state<PreviewError | null>(null);
  let pdfMode = $state<'direct' | 'image'>('direct');

  // Deck picker — populated from list_decks so the user can retarget
  // export from this route without going back to Workspace.
  let availableDecks = $state<DeckListItem[]>([]);
  let loadingDecks = $state(false);
  let showDeckPicker = $state(false);

  onMount(() => {
    void loadAvailableDecks();
  });

  async function loadAvailableDecks(): Promise<void> {
    loadingDecks = true;
    try {
      const mcp = bridge as unknown as McpDeckEditorBridge;
      if (typeof mcp.listDecks !== 'function') return;
      const r = await mcp.listDecks();
      availableDecks = [...r.decks].sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      );
    } catch {
      availableDecks = [];
    } finally {
      loadingDecks = false;
    }
  }

  function switchDeck(deckId: string): void {
    showDeckPicker = false;
    if (onSwitchDeck) onSwitchDeck(deckId);
    else void deck.loadEditor(deckId);
  }

  interface FailedSlide {
    slide_id: string;
    title: string;
    error_count: number;
    warning_count: number;
  }

  interface PreviewError {
    message: string;
    code?: string;
    failed_slides?: FailedSlide[];
  }

  // Load preview HTML when the route is first mounted or deck changes.
  $effect(() => {
    if (state?.deck.id) {
      void loadPreview(state.deck.id);
    }
  });

  async function loadPreview(deckId: string): Promise<void> {
    previewLoading = true;
    previewError = null;
    previewHtml = '';
    try {
      const result = await bridge.callTool<{ html?: string }>(
        'export_html',
        { deck_id: deckId },
      );

      // export_html returns {html} in structuredContent on success.
      const structured = result.structuredContent as Record<string, unknown> | undefined;
      if (typeof structured?.html === 'string' && structured.html.length > 0) {
        previewHtml = structured.html;
        return;
      }

      // On error the server surfaces a JSON error object in the text
      // content block. Parse it so we can render a friendly message
      // instead of dumping raw JSON into the preview iframe.
      const textBlock = result.content?.find((b) => b.type === 'text')?.text ?? '';
      previewError = parsePreviewError(textBlock);
    } catch (err) {
      previewError = {
        message: err instanceof Error ? err.message : String(err),
      };
    } finally {
      previewLoading = false;
    }
  }

  function parsePreviewError(raw: string): PreviewError {
    if (!raw) return { message: 'Preview unavailable.' };
    try {
      const parsed = JSON.parse(raw) as {
        message?: string;
        code?: string;
        details?: { failed_slides?: FailedSlide[] };
      };
      return {
        message: parsed.message ?? 'Preview unavailable.',
        code: parsed.code,
        failed_slides: parsed.details?.failed_slides,
      };
    } catch {
      return { message: raw };
    }
  }

  async function handleExport(format: 'pdf' | 'pptx' | 'html'): Promise<void> {
    if (!state || exporting) return;
    exporting = true;
    exportResult = null;

    try {
      let toolName: string;
      let toolArgs: Record<string, unknown>;

      if (format === 'pdf') {
        toolName = 'export_pdf';
        toolArgs = { deck_id: state.deck.id, include_data: true, ...(isPrint ? { mode: pdfMode } : {}) };
      } else if (format === 'pptx') {
        toolName = 'export_pptx';
        toolArgs = { deck_id: state.deck.id };
      } else {
        toolName = 'export_html';
        toolArgs = { deck_id: state.deck.id };
      }

      const result = await bridge.callTool<Record<string, unknown>>(toolName, toolArgs);

      if (result.isError) {
        const errText = result.content?.find((b) => b.type === 'text')?.text ?? 'Export failed.';
        toast.error(errText);
        return;
      }

      const sc = result.structuredContent as Record<string, unknown> | undefined;
      if (!sc) {
        toast.error('Export returned no result.');
        return;
      }

      const parsed: ExportResult = {
        file_path: String(sc.file_path ?? ''),
        filename: String(sc.filename ?? 'export'),
        file_size_bytes: Number(sc.file_size_bytes ?? 0),
        slide_count: Number(sc.slide_count ?? 0),
        mime_type: String(sc.mime_type ?? 'application/octet-stream'),
        resource: sc.resource as ExportResult['resource'],
      };

      exportResult = parsed;

      // Trigger browser download if we have a blob.
      const blob64 = parsed.resource?.blob;
      if (blob64) {
        try {
          const binary = atob(blob64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const fileBlob = new Blob([bytes], { type: parsed.mime_type });
          const url = URL.createObjectURL(fileBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = parsed.filename;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
          toast.success(`Downloaded ${parsed.filename}`);
        } catch {
          toast.warn('Export succeeded but download failed. Use "Copy path" to locate the file.');
        }
      } else {
        toast.success(`Export complete: ${parsed.filename}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      exporting = false;
    }
  }

  async function copyPath(): Promise<void> {
    if (!exportResult?.file_path) return;
    try {
      await navigator.clipboard.writeText(exportResult.file_path);
      toast.info('Path copied to clipboard.');
    } catch {
      toast.error('Failed to copy path.');
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
</script>

<div class="export-route">
  {#if state}
    <!-- Header -->
    <div class="export-header">
      <div class="export-title">
        <h1>{state.deck.title}</h1>
        <FormatBadge format={deckFormat} size="md" />
        {#if availableDecks.length > 1}
          <button
            type="button"
            class="switch-deck-btn"
            onclick={() => { showDeckPicker = !showDeckPicker; }}
            aria-expanded={showDeckPicker}
            aria-haspopup="listbox"
          >
            Switch deck
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
              <path d="M3 5l3 3 3-3" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        {/if}
      </div>
      <p class="subtitle">{state.deck.slideCount} {isPrint ? 'pages' : 'slides'}</p>

      {#if showDeckPicker}
        <div class="deck-picker" role="listbox" aria-label="Choose a different deck">
          {#if loadingDecks}
            <p class="picker-hint">Loading decks…</p>
          {:else if availableDecks.length === 0}
            <p class="picker-hint">No other decks available.</p>
          {:else}
            {#each availableDecks as d (d.id)}
              <button
                type="button"
                class={`picker-row ${d.id === state.deck.id ? 'current' : ''}`}
                onclick={() => switchDeck(d.id)}
                role="option"
                aria-selected={d.id === state.deck.id}
              >
                <span class="picker-title">{d.title}</span>
                <span class="picker-meta">
                  {d.authoring_model === 'slides' ? `${d.slide_count} slides` : `${d.section_count} sections`}
                  · {d.format.replace('_', ' ')}
                </span>
              </button>
            {/each}
          {/if}
        </div>
      {/if}
    </div>

    <div class="export-body">
      <!-- Action panel -->
      <Card padding="md" elevation="e1" class="action-card">
        <div class="action-inner">
          <p class="eyebrow">Export</p>

          {#if isPrint}
            <!-- Print: PDF only -->
            <div class="format-note">
              <Pill tone="terracotta" size="sm">PDF only</Pill>
              <span class="format-hint">Print decks export as PDF. PPTX is not available.</span>
            </div>

            <div class="mode-toggle">
              <button
                type="button"
                class={`mode-btn ${pdfMode === 'direct' ? 'active' : ''}`}
                onclick={() => pdfMode = 'direct'}
              >
                Direct render
              </button>
              <button
                type="button"
                class={`mode-btn ${pdfMode === 'image' ? 'active' : ''}`}
                onclick={() => pdfMode = 'image'}
              >
                Image-based
              </button>
            </div>

            <Button
              variant="primary"
              size="lg"
              loading={exporting}
              onclick={() => handleExport('pdf')}
            >
              Export PDF
            </Button>

          {:else}
            <!-- Slides: PPTX + PDF + HTML -->
            <div class="export-buttons">
              <Button
                variant="primary"
                size="md"
                loading={exporting}
                onclick={() => handleExport('pptx')}
              >
                Export PPTX
              </Button>
              <Button
                variant="secondary"
                size="md"
                loading={exporting}
                onclick={() => handleExport('pdf')}
              >
                Export PDF
              </Button>
              <Button
                variant="ghost"
                size="md"
                loading={exporting}
                onclick={() => handleExport('html')}
              >
                Export HTML
              </Button>
            </div>
          {/if}

          <!-- Post-export metadata -->
          {#if exportResult}
            <div class="export-result">
              <div class="result-row">
                <span class="result-label">Filename</span>
                <span class="result-value">{exportResult.filename}</span>
              </div>
              <div class="result-row">
                <span class="result-label">Size</span>
                <span class="result-value">{formatBytes(exportResult.file_size_bytes)}</span>
              </div>
              <div class="result-row">
                <span class="result-label">{isPrint ? 'Pages' : 'Slides'}</span>
                <span class="result-value">{exportResult.slide_count}</span>
              </div>
              {#if exportResult.file_path}
                <div class="result-row">
                  <span class="result-label">Path</span>
                  <span class="result-path" title={exportResult.file_path}>{exportResult.file_path}</span>
                </div>
              {/if}
              <Button variant="ghost" size="sm" onclick={copyPath}>
                Copy file path
              </Button>
            </div>
          {/if}
        </div>
      </Card>

      <!-- Live preview -->
      <Card padding="none" elevation="e1" class="preview-card">
        <div class="preview-head">
          <p class="eyebrow">Preview</p>
        </div>
        {#if previewLoading}
          <div class="preview-loading">
            <div class="spinner"></div>
            <span>Loading preview…</span>
          </div>
        {:else if previewHtml}
          <iframe
            class={`preview-frame ${isPrint ? 'portrait' : 'landscape'}`}
            srcdoc={previewHtml}
            sandbox="allow-same-origin"
            title="Export preview"
          ></iframe>
        {:else if previewError}
          <div class="preview-error" role="alert">
            <div class="err-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5" stroke-linecap="round" />
                <circle cx="12" cy="16" r="0.9" fill="currentColor" />
              </svg>
            </div>
            <div class="err-body">
              <p class="err-title">{previewError.message}</p>
              {#if previewError.code}
                <p class="err-code">{previewError.code}</p>
              {/if}
              {#if previewError.failed_slides && previewError.failed_slides.length > 0}
                <ul class="err-slides">
                  {#each previewError.failed_slides as fs (fs.slide_id)}
                    <li>
                      <span class="fs-title">{fs.title || fs.slide_id}</span>
                      <span class="fs-meta">
                        {fs.error_count} error{fs.error_count === 1 ? '' : 's'}
                        {#if fs.warning_count > 0} · {fs.warning_count} warn{/if}
                      </span>
                    </li>
                  {/each}
                </ul>
                <p class="err-hint">
                  Open the Editor, resolve the issues, then return here to export.
                </p>
              {/if}
            </div>
          </div>
        {:else}
          <div class="preview-empty">
            <p class="muted">Preview not available.</p>
          </div>
        {/if}
      </Card>
    </div>

  {:else if deck.loading}
    <div class="empty-state">
      <div class="spinner"></div>
      <p>Loading…</p>
    </div>
  {:else}
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">
        <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.3">
          <path d="M12 8h18l6 6v26H12z"/>
          <path d="M30 8v6h6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <p class="muted">Pick a deck to export.</p>
      {#if loadingDecks}
        <div class="spinner"></div>
      {:else if availableDecks.length === 0}
        <p class="muted small">No decks yet — ask the agent to create one.</p>
      {:else}
        <div class="empty-picker" role="listbox" aria-label="Choose deck to export">
          {#each availableDecks.slice(0, 6) as d (d.id)}
            <button
              type="button"
              class="picker-row"
              onclick={() => switchDeck(d.id)}
              role="option"
              aria-selected="false"
            >
              <span class="picker-title">{d.title}</span>
              <span class="picker-meta">
                {d.authoring_model === 'slides' ? `${d.slide_count} slides` : `${d.section_count} sections`}
                · {d.format.replace('_', ' ')}
              </span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .export-route {
    padding: var(--s-5);
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
    overflow-y: auto;
    max-height: 100%;
  }

  .export-header {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    position: relative;
  }

  .export-title {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    flex-wrap: wrap;
  }

  .switch-deck-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--s-1);
    padding: 4px var(--s-3);
    border-radius: var(--r-pill);
    font-size: 12px;
    font-weight: 500;
    color: var(--ink-2);
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    cursor: pointer;
    transition:
      background-color var(--dur-micro) var(--ease),
      color var(--dur-micro) var(--ease);
  }

  .switch-deck-btn:hover {
    background: var(--mint-tint);
    border-color: var(--mint);
    color: var(--mint-hover);
  }

  .switch-deck-btn svg {
    width: 10px;
    height: 10px;
  }

  .deck-picker {
    position: absolute;
    top: calc(100% + var(--s-2));
    left: 0;
    right: 0;
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    box-shadow: var(--e2);
    max-height: 280px;
    overflow-y: auto;
    z-index: 5;
    padding: var(--s-1);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .picker-row {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-md);
    text-align: left;
    transition: background-color var(--dur-micro) var(--ease);
  }

  .picker-row:hover {
    background: var(--surface-2);
  }

  .picker-row.current {
    background: var(--mint-tint);
  }

  .picker-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--ink-1);
  }

  .picker-meta {
    font-size: 11px;
    color: var(--ink-3);
  }

  .picker-hint {
    padding: var(--s-3);
    font-size: 12px;
    color: var(--ink-3);
    margin: 0;
  }

  h1 {
    font-size: 20px;
    font-weight: 600;
    color: var(--ink-1);
  }

  .subtitle {
    font-size: 13px;
    color: var(--ink-3);
  }

  .export-body {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    gap: var(--s-4);
    min-height: 0;
    flex: 1;
  }

  :global(.action-card) {
    height: fit-content;
  }

  .action-inner {
    display: flex;
    flex-direction: column;
    gap: var(--s-4);
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 11px;
    color: var(--ink-3);
    font-weight: 500;
    margin: 0;
  }

  .format-note {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    flex-wrap: wrap;
  }

  .format-hint {
    font-size: 12px;
    color: var(--ink-3);
  }

  .mode-toggle {
    display: flex;
    background: var(--surface-2);
    border-radius: var(--r-md);
    padding: var(--s-1);
    gap: var(--s-1);
  }

  .mode-btn {
    flex: 1;
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-sm);
    font-size: 13px;
    font-weight: 500;
    color: var(--ink-2);
    border: 1px solid transparent;
    transition:
      background-color var(--dur-micro) var(--ease),
      color var(--dur-micro) var(--ease);
  }

  .mode-btn.active {
    background: var(--surface-1);
    color: var(--ink-1);
    border-color: var(--border-subtle);
    box-shadow: var(--e1);
  }

  .mode-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--mint-tint);
  }

  .export-buttons {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }

  .export-result {
    border-top: 1px solid var(--border-hairline);
    padding-top: var(--s-3);
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }

  .result-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--s-3);
    font-size: 13px;
  }

  .result-label {
    color: var(--ink-3);
    flex-shrink: 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .result-value {
    color: var(--ink-1);
    font-weight: 500;
    text-align: right;
  }

  .result-path {
    color: var(--link);
    font-family: var(--font-mono);
    font-size: 11px;
    text-align: right;
    word-break: break-all;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
  }

  /* Preview panel */
  :global(.preview-card) {
    display: grid !important;
    grid-template-rows: auto minmax(0, 1fr) !important;
    min-height: 0;
    overflow: hidden;
  }

  .preview-head {
    padding: var(--s-3) var(--s-4);
    border-bottom: 1px solid var(--border-hairline);
  }

  .preview-frame {
    border: 0;
    display: block;
    width: 100%;
  }

  .preview-frame.landscape {
    aspect-ratio: 16 / 9;
    height: auto;
  }

  .preview-frame.portrait {
    aspect-ratio: 1240 / 1754;
    height: auto;
    max-height: 70vh;
  }

  .preview-loading,
  .preview-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--s-3);
    padding: var(--s-8);
    color: var(--ink-3);
    font-size: 13px;
  }

  /* ── Friendly preview error ─────────────────────────────────── */
  .preview-error {
    display: flex;
    gap: var(--s-4);
    padding: var(--s-6) var(--s-5);
    align-items: flex-start;
    background: var(--error-tint, var(--surface-1));
    min-height: 240px;
  }

  .err-icon {
    flex-shrink: 0;
    color: var(--error);
  }

  .err-icon svg {
    width: 28px;
    height: 28px;
  }

  .err-body {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    min-width: 0;
    flex: 1;
  }

  .err-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink-1);
    margin: 0;
    line-height: 1.4;
  }

  .err-code {
    font-size: 11px;
    color: var(--ink-3);
    font-family: var(--font-mono);
    margin: 0;
  }

  .err-slides {
    list-style: none;
    margin: var(--s-2) 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    border-top: 1px solid var(--border-subtle);
    padding-top: var(--s-3);
  }

  .err-slides li {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--s-3);
    font-size: 12px;
  }

  .fs-title {
    color: var(--ink-1);
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fs-meta {
    color: var(--error);
    font-size: 11px;
    flex-shrink: 0;
  }

  .err-hint {
    font-size: 12px;
    color: var(--ink-3);
    margin: var(--s-2) 0 0;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border-radius: var(--r-pill);
    border: 3px solid var(--border-subtle);
    border-top-color: var(--mint);
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .muted {
    color: var(--ink-3);
    font-size: 13px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-4);
    padding: var(--s-9) var(--s-5);
    text-align: center;
  }

  .empty-icon {
    color: var(--border-subtle);
  }

  .empty-icon svg {
    width: 56px;
    height: 56px;
  }

  .muted.small {
    font-size: 12px;
  }

  .empty-picker {
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    padding: var(--s-1);
    width: 100%;
    max-width: 420px;
    text-align: left;
  }

  @media (max-width: 860px) {
    .export-body {
      grid-template-columns: 1fr;
    }
  }
</style>
