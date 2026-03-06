<script lang="ts">
  import { onMount } from 'svelte';
  import SlideCanvas from './lib/SlideCanvas.svelte';
  import IssueList from './lib/IssueList.svelte';
  import type {
    DeckEditorBridge,
    EditorState,
    RevisionPayload,
    ToolCallResult,
    ValidationIssue,
  } from './lib/types';
  import { buildRevisionFallback } from './lib/revise';

  export let bridge: DeckEditorBridge;

  let editorState: EditorState | null = null;
  let loading = true;
  let loadingLabel = 'Connecting to deck editor…';
  let saving = false;
  let errorMessage = '';
  let conflictMessage = '';
  let reviseInstruction = '';
  let reviseFallbackPayload = '';
  let reviseStatus = '';
  let canvasNonce = 0;
  onMount(() => {
    const disposeInput = bridge.onToolInput((args) => {
      const deckId = stringOrEmpty(args.deck_id);
      const slideId = stringOrEmpty(args.slide_id);
      if (!deckId) {
        return;
      }

      if (!editorState) {
        void loadEditorState(deckId, slideId || undefined);
      }
    });

    const disposeResult = bridge.onToolResult((result) => {
      const nextState = extractEditorState(result);
      if (nextState) {
        editorState = nextState;
        loading = false;
        errorMessage = '';
      }
    });

    void connectBridge();

    return () => {
      disposeInput();
      disposeResult();
    };
  });

  async function connectBridge(): Promise<void> {
    try {
      await bridge.connect();
      loadingLabel = 'Waiting for editor data…';
    } catch (error) {
      loading = false;
      errorMessage = formatError(error);
    }
  }

  async function loadEditorState(deckId: string, slideId?: string): Promise<void> {
    loading = true;
    loadingLabel = slideId ? 'Loading slide…' : 'Loading deck…';
    errorMessage = '';

    const result = await bridge.callTool<{ editor_state?: EditorState }>('get_editor_state', {
      deck_id: deckId,
      ...(slideId ? { slide_id: slideId } : {}),
    });

    applyToolStateResult(result);
    loading = false;
  }

  async function handleSlideSelect(slideId: string): Promise<void> {
    if (!editorState || saving || slideId === editorState.selectedSlide.slideId) {
      return;
    }

    await loadEditorState(editorState.deck.id, slideId);
  }

  async function handleTextCommit(event: CustomEvent<{ editId: string; text: string }>): Promise<void> {
    if (!editorState || saving) {
      return;
    }

    saving = true;
    conflictMessage = '';
    reviseStatus = '';

    const result = await bridge.callTool<{
      conflict?: boolean;
      editor_state?: EditorState;
    }>('apply_text_edit', {
      deck_id: editorState.deck.id,
      slide_id: editorState.selectedSlide.slideId,
      edit_id: event.detail.editId,
      text: event.detail.text,
      expected_revision_hash: editorState.selectedSlide.revisionHash,
    });

    if (result.isError) {
      const nextState = extractEditorState(result);
      if (nextState) {
        editorState = nextState;
        canvasNonce += 1;
      }

      conflictMessage = result.structuredContent?.conflict
        ? 'The slide changed elsewhere. The editor reloaded the latest server state.'
        : extractErrorText(result) || 'Text edit failed.';
    } else {
      applyToolStateResult(result);
    }

    saving = false;
  }

  async function handleReviseRequest(): Promise<void> {
    if (!editorState || !reviseInstruction.trim()) {
      return;
    }

    reviseStatus = '';
    reviseFallbackPayload = '';

    const payload: RevisionPayload = {
      deck_id: editorState.deck.id,
      deck_title: editorState.deck.title,
      slide_id: editorState.selectedSlide.slideId,
      slide_title: editorState.selectedSlide.metadata.title,
      instruction: reviseInstruction.trim(),
      html: editorState.selectedSlide.html,
      metadata: editorState.selectedSlide.metadata,
      validation: editorState.selectedSlide.lastValidation,
      revision_hash: editorState.selectedSlide.revisionHash,
    };

    try {
      await bridge.sendRevisionRequest(payload);
      reviseStatus = 'Revision request sent to the host agent.';
      reviseInstruction = '';
    } catch (error) {
      reviseFallbackPayload = buildRevisionFallback(payload);
      reviseStatus = formatError(error);
    }
  }

  function applyToolStateResult(result: ToolCallResult<{ editor_state?: EditorState }>): void {
    const nextState = extractEditorState(result);
    if (!nextState) {
      errorMessage = extractErrorText(result) || 'The editor returned no state.';
      return;
    }

    editorState = nextState;
    errorMessage = '';
  }

  function issuesBySeverity(issues: ValidationIssue[] = [], severity: ValidationIssue['severity']): ValidationIssue[] {
    return issues.filter((issue) => issue.severity === severity);
  }

  function extractEditorState(result: ToolCallResult<Record<string, unknown>>): EditorState | null {
    const payload = result.structuredContent;
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    if ('editor_state' in payload && payload.editor_state && typeof payload.editor_state === 'object') {
      return payload.editor_state as EditorState;
    }

    return null;
  }

  function extractErrorText(result: ToolCallResult<Record<string, unknown>>): string {
    const textBlock = result.content?.find((block) => block.type === 'text' && typeof block.text === 'string');
    if (!textBlock?.text) {
      return '';
    }

    try {
      const parsed = JSON.parse(textBlock.text) as { message?: string };
      return parsed.message ?? textBlock.text;
    } catch {
      return textBlock.text;
    }
  }

  function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function stringOrEmpty(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  $: selectedValidation = editorState?.selectedSlide.lastValidation ?? null;
  $: errorIssues = issuesBySeverity(selectedValidation?.issues, 'error');
  $: warningIssues = issuesBySeverity(selectedValidation?.issues, 'warning');
  $: infoIssues = issuesBySeverity(selectedValidation?.issues, 'info');
</script>

<svelte:head>
  <title>Pengui Slides Deck Editor</title>
</svelte:head>

{#if loading && !editorState}
  <div class="screen-state">
    <div class="status-card">
      <div class="spinner"></div>
      <p>{loadingLabel}</p>
    </div>
  </div>
{:else if errorMessage && !editorState}
  <div class="screen-state">
    <div class="status-card error">
      <h1>Editor failed to load</h1>
      <p>{errorMessage}</p>
    </div>
  </div>
{:else if editorState}
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-head">
        <p class="eyebrow">Deck</p>
        <h1>{editorState.deck.title}</h1>
        <p class="deck-meta">
          {editorState.deck.slideCount} slides
          {#if editorState.deck.author}
            · {editorState.deck.author}
          {/if}
        </p>
      </div>

      <div class="slide-list">
        {#each editorState.thumbnails as thumbnail}
          <button
            type="button"
            class:selected={thumbnail.slideId === editorState.selectedSlide.slideId}
            class="slide-card"
            on:click={() => handleSlideSelect(thumbnail.slideId)}
            disabled={saving}
          >
            <img
              alt={`Slide ${thumbnail.position + 1} thumbnail`}
              src={`data:image/png;base64,${thumbnail.imageBase64}`}
            />
            <div class="slide-copy">
              <strong>{thumbnail.position + 1}. {thumbnail.title}</strong>
              <span>{thumbnail.type}</span>
              <span class:valid={thumbnail.isValid}>
                {thumbnail.isValid ? 'Valid' : 'Needs fixes'}
              </span>
            </div>
          </button>
        {/each}
      </div>
    </aside>

    <main class="canvas-panel">
      <div class="canvas-head">
        <div>
          <p class="eyebrow">Selected Slide</p>
          <h2>{editorState.selectedSlide.metadata.title}</h2>
        </div>
        <div class="canvas-status">
          {#if saving}
            <span>Saving edit…</span>
          {/if}
          {#if conflictMessage}
            <span class="conflict">{conflictMessage}</span>
          {/if}
        </div>
      </div>

      <SlideCanvas
        html={editorState.selectedSlide.html}
        revisionHash={editorState.selectedSlide.revisionHash}
        renderNonce={canvasNonce}
        disabled={saving}
        on:commit={handleTextCommit}
        on:error={(event) => errorMessage = event.detail.message}
      />
    </main>

    <aside class="details">
      <section class="panel">
        <p class="eyebrow">Metadata</p>
        <h3>{editorState.selectedSlide.metadata.title}</h3>
        <p class="muted">{editorState.selectedSlide.metadata.narrative}</p>
        <dl class="meta-grid">
          <div>
            <dt>Type</dt>
            <dd>{editorState.selectedSlide.metadata.type}</dd>
          </div>
          <div>
            <dt>Revision</dt>
            <dd>{editorState.selectedSlide.revisionHash.slice(0, 12)}</dd>
          </div>
        </dl>

        {#if editorState.selectedSlide.metadata.tags.length > 0}
          <div class="tag-row">
            {#each editorState.selectedSlide.metadata.tags as tag}
              <span>{tag}</span>
            {/each}
          </div>
        {/if}

        {#if editorState.selectedSlide.metadata.keyPoints.length > 0}
          <ul class="point-list">
            {#each editorState.selectedSlide.metadata.keyPoints as point}
              <li>{point}</li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="panel">
        <p class="eyebrow">Validation</p>
        {#if selectedValidation}
          <div class="validation-stats">
            <div>
              <strong>{selectedValidation.errorCount}</strong>
              <span>errors</span>
            </div>
            <div>
              <strong>{selectedValidation.warningCount}</strong>
              <span>warnings</span>
            </div>
            <div>
              <strong>{selectedValidation.infoCount}</strong>
              <span>info</span>
            </div>
          </div>

          {#if errorIssues.length > 0}
            <IssueList title="Errors" tone="error" issues={errorIssues} />
          {/if}
          {#if warningIssues.length > 0}
            <IssueList title="Warnings" tone="warning" issues={warningIssues} />
          {/if}
          {#if infoIssues.length > 0}
            <IssueList title="Info" tone="info" issues={infoIssues} />
          {/if}
          {#if selectedValidation.issues.length === 0}
            <p class="muted">No validation issues on the selected slide.</p>
          {/if}
        {:else}
          <p class="muted">This slide has not been validated yet.</p>
        {/if}
      </section>

      <section class="panel">
        <p class="eyebrow">Ask Agent To Revise</p>
        <textarea
          bind:value={reviseInstruction}
          rows="5"
          placeholder="Example: tighten the headline, shorten the bullet list, and make the CTA more direct."
        ></textarea>
        <button type="button" class="primary" on:click={handleReviseRequest}>
          Send revision request
        </button>
        {#if reviseStatus}
          <p class="muted">{reviseStatus}</p>
        {/if}
        {#if reviseFallbackPayload}
          <pre>{reviseFallbackPayload}</pre>
        {/if}
      </section>
    </aside>
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    min-height: 100vh;
    font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    color: #271f1a;
    background:
      radial-gradient(circle at top left, rgba(255, 245, 232, 0.96), rgba(245, 235, 222, 0.94)),
      linear-gradient(180deg, #f5efe7, #efe5d7);
  }

  :global(*) {
    box-sizing: border-box;
  }

  .screen-state {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
  }

  .status-card {
    max-width: 420px;
    text-align: center;
    background: rgba(255, 251, 246, 0.92);
    border: 1px solid rgba(133, 99, 66, 0.18);
    border-radius: 24px;
    padding: 28px;
    box-shadow: 0 24px 60px rgba(61, 40, 20, 0.14);
  }

  .status-card.error {
    text-align: left;
  }

  .spinner {
    width: 48px;
    height: 48px;
    margin: 0 auto 18px;
    border-radius: 999px;
    border: 3px solid rgba(39, 31, 26, 0.16);
    border-top-color: #0b7f6e;
    animation: spin 0.8s linear infinite;
  }

  .layout {
    display: grid;
    grid-template-columns: 300px minmax(0, 1fr) 360px;
    gap: 18px;
    min-height: 100vh;
    padding: 18px;
  }

  .sidebar,
  .details,
  .panel,
  .canvas-panel {
    background: rgba(255, 250, 244, 0.88);
    border: 1px solid rgba(120, 92, 66, 0.16);
    box-shadow: 0 16px 40px rgba(59, 37, 17, 0.08);
  }

  .sidebar,
  .details,
  .canvas-panel {
    border-radius: 28px;
    overflow: hidden;
  }

  .sidebar {
    display: flex;
    flex-direction: column;
  }

  .sidebar-head,
  .canvas-head {
    padding: 24px;
    border-bottom: 1px solid rgba(120, 92, 66, 0.12);
  }

  .eyebrow {
    margin: 0 0 8px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 11px;
    color: #7a6756;
  }

  h1,
  h2,
  h3 {
    margin: 0;
    font-family: "Iowan Old Style", "Palatino Linotype", serif;
    font-weight: 600;
  }

  .deck-meta,
  .muted {
    color: #6f635a;
  }

  .slide-list {
    display: grid;
    gap: 12px;
    padding: 18px;
    overflow: auto;
  }

  .slide-card {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid rgba(120, 92, 66, 0.12);
    border-radius: 20px;
    background: rgba(255, 255, 255, 0.74);
    text-align: left;
    cursor: pointer;
  }

  .slide-card.selected {
    border-color: rgba(11, 127, 110, 0.48);
    box-shadow: 0 0 0 3px rgba(11, 127, 110, 0.14);
  }

  .slide-card img {
    width: 100%;
    border-radius: 14px;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border: 1px solid rgba(39, 31, 26, 0.08);
  }

  .slide-copy {
    display: grid;
    gap: 4px;
    font-size: 13px;
    color: #6f635a;
  }

  .slide-copy .valid {
    color: #0b7f6e;
  }

  .canvas-panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-height: 0;
    padding-bottom: 18px;
  }

  .canvas-status {
    display: grid;
    gap: 6px;
    justify-items: end;
    font-size: 13px;
    color: #6f635a;
  }

  .canvas-status .conflict {
    color: #8f4d22;
  }

  .details {
    display: grid;
    gap: 12px;
    padding: 12px;
    overflow: auto;
  }

  .panel {
    border-radius: 22px;
    padding: 18px;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 16px 0;
  }

  .meta-grid dt {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: #7a6756;
  }

  .meta-grid dd {
    margin: 4px 0 0;
    font-size: 14px;
  }

  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
  }

  .tag-row span {
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(11, 127, 110, 0.12);
    color: #0b7f6e;
    font-size: 12px;
  }

  .point-list {
    margin: 0;
    padding-left: 18px;
    color: #463a32;
  }

  .validation-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 14px;
  }

  .validation-stats div {
    padding: 10px 12px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.74);
  }

  .validation-stats strong {
    display: block;
    font-size: 20px;
  }

  textarea,
  pre {
    width: 100%;
    border-radius: 18px;
    border: 1px solid rgba(120, 92, 66, 0.16);
    background: rgba(255, 255, 255, 0.9);
    padding: 14px;
    font: inherit;
  }

  pre {
    overflow: auto;
    font-size: 12px;
    line-height: 1.5;
  }

  .primary {
    margin-top: 12px;
    border: 0;
    border-radius: 999px;
    background: linear-gradient(135deg, #0b7f6e, #176e62);
    color: white;
    font: inherit;
    font-weight: 600;
    padding: 12px 18px;
    cursor: pointer;
  }

  @media (max-width: 1200px) {
    .layout {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(420px, 1fr) auto;
    }

    .sidebar,
    .details {
      min-height: 0;
    }

    .slide-list {
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
