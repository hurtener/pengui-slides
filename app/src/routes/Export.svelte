<!--
  Export route — format-aware export panel.

  Slides: PPTX | PDF | HTML buttons.
  Print:  PDF button only (mode toggle: direct | image).
  Live preview via export_html.
  One-click download with toast feedback.
-->
<script lang="ts">
  import Button from '../lib/primitives/Button.svelte';
  import Card from '../lib/primitives/Card.svelte';
  import Pill from '../lib/primitives/Pill.svelte';
  import FormatBadge from '../lib/FormatBadge.svelte';
  import { toast } from '../stores/toast.svelte';
  import type { DeckStore } from '../stores/deck.svelte';
  import type { DeckEditorBridge, ExportResult, FormatKind } from '../lib/types';

  interface Props {
    deck: DeckStore;
    bridge: DeckEditorBridge;
  }

  let { deck, bridge }: Props = $props();

  const state = $derived(deck.editorState);
  const deckFormat = $derived<FormatKind>(state?.deck.format ?? 'slides_16_9');
  const isPrint = $derived(deckFormat !== 'slides_16_9');

  let exportResult = $state<ExportResult | null>(null);
  let exporting = $state(false);
  let previewHtml = $state('');
  let previewLoading = $state(false);
  let pdfMode = $state<'direct' | 'image'>('direct');

  // Load preview HTML when the route is first mounted or deck changes.
  $effect(() => {
    if (state?.deck.id) {
      void loadPreview(state.deck.id);
    }
  });

  async function loadPreview(deckId: string): Promise<void> {
    previewLoading = true;
    try {
      const result = await bridge.callTool<{ html?: string; structuredContent?: { html?: string } }>(
        'export_html',
        { deck_id: deckId },
      );
      const html =
        (result.structuredContent as Record<string, unknown> | undefined)?.html as string
        ?? result.content?.find((b) => b.type === 'text')?.text
        ?? '';
      previewHtml = html;
    } catch {
      previewHtml = '';
    } finally {
      previewLoading = false;
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
      </div>
      <p class="subtitle">{state.deck.slideCount} {isPrint ? 'pages' : 'slides'}</p>
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
      <p class="muted">No deck loaded. Open a deck in the Editor first.</p>
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
  }

  .export-title {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    flex-wrap: wrap;
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

  @media (max-width: 860px) {
    .export-body {
      grid-template-columns: 1fr;
    }
  }
</style>
