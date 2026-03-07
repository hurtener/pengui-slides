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
    ValidationPresentation,
    SlideHealth,
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
  let activePanel: 'overview' | 'checks' | 'details' = 'overview';
  let detailsOpen = false;

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

  function healthLabel(health: SlideHealth): string {
    switch (health) {
      case 'clean':
        return 'Clean';
      case 'blocked':
        return 'Blocked';
      default:
        return 'Review';
    }
  }

  function statusCopy(presentation: ValidationPresentation | null): string {
    switch (presentation?.status) {
      case 'clean':
        return 'No new blockers introduced. Keep iterating or export when the deck is ready.';
      case 'blocking':
        return 'Review the blocking items before export.';
      case 'regression':
        return 'The latest edit introduced issues that should be reviewed.';
      case 'edited_with_preexisting_issues':
        return 'Your latest edit worked, but this slide still carries older issues.';
      default:
        return 'Validation details will appear here after the slide is checked.';
    }
  }

  function technicalIssues(issues: ValidationIssue[] = []): ValidationIssue[] {
    return issues;
  }

  function healthFromPresentation(presentation: ValidationPresentation): SlideHealth {
    switch (presentation.status) {
      case 'clean':
        return 'clean';
      case 'blocking':
        return 'blocked';
      default:
        return 'needs_attention';
    }
  }

  function toggleDetails(force?: boolean): void {
    detailsOpen = typeof force === 'boolean' ? force : !detailsOpen;
  }

  $: selectedPresentation = editorState?.selectedSlide.validationPresentation ?? null;
  $: selectedHealth = selectedPresentation ? healthLabel(healthFromPresentation(selectedPresentation)) : 'Review';
  $: topBlockers = selectedPresentation?.topBlockers ?? [];
  $: topPreExisting = selectedPresentation?.topPreExisting ?? [];
  $: rawIssues = technicalIssues(editorState?.selectedSlide.lastValidation?.issues ?? []);
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
  <div class="app-shell">
    <header class="deck-header shell-card">
      <div class="deck-title-block">
        <p class="eyebrow">Deck</p>
        <h1>{editorState.deck.title}</h1>
      </div>
      <span class={`status-chip ${selectedPresentation?.status ?? 'unvalidated'}`}>{selectedHealth}</span>
    </header>

    <div class="workspace">
      <aside class="slide-sidebar shell-card">
        <div class="sidebar-head">
          <p class="eyebrow">Slides</p>
        </div>

        <div class="sidebar-track">
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
                <span class={`health-pill ${thumbnail.health}`}>{healthLabel(thumbnail.health)}</span>
              </div>
            </button>
          {/each}
        </div>
      </aside>

      <div class="main-column">
        <section class="canvas-panel shell-card">
          <div class="canvas-head">
            <div>
              <p class="eyebrow">Selected Slide</p>
              <h2>{editorState.selectedSlide.metadata.title}</h2>
            </div>

            <div class="canvas-actions">
              {#if saving}
                <span class="canvas-note">Saving edit…</span>
              {/if}
              {#if conflictMessage}
                <span class="canvas-note conflict">{conflictMessage}</span>
              {/if}
              <button type="button" class="ghost-button" on:click={() => toggleDetails()}>
                {detailsOpen ? 'Hide details' : 'Slide details'}
              </button>
            </div>
          </div>

          <div class="canvas-stage">
            <SlideCanvas
              html={editorState.selectedSlide.html}
              revisionHash={editorState.selectedSlide.revisionHash}
              renderNonce={canvasNonce}
              disabled={saving}
              on:commit={handleTextCommit}
              on:error={(event) => errorMessage = event.detail.message}
            />
          </div>
        </section>

        <section class="composer-panel shell-card">
          <div class="composer-head">
            <p class="eyebrow">Ask Agent To Revise</p>
            {#if reviseStatus}
              <p class="muted">{reviseStatus}</p>
            {/if}
          </div>

          <div class="composer-body">
            <textarea
              bind:value={reviseInstruction}
              rows="2"
              placeholder="Remove the CTA and make the closing copy more direct."
            ></textarea>

            <div class="composer-actions">
              <button type="button" class="primary" on:click={handleReviseRequest}>
                Ask agent to revise
              </button>
            </div>
          </div>

          {#if reviseFallbackPayload}
            <details class="technical-fallback">
              <summary>Revision payload</summary>
              <pre>{reviseFallbackPayload}</pre>
            </details>
          {/if}
        </section>
      </div>

      {#if detailsOpen}
        <button
          type="button"
          class="inspector-scrim"
          aria-label="Close details"
          on:click={() => toggleDetails(false)}
        ></button>

        <aside class="inspector shell-card">
          <div class="inspector-head">
            <p class="eyebrow">Slide details</p>
            <button type="button" class="ghost-button" on:click={() => toggleDetails(false)}>Close</button>
          </div>

          <div class="tab-bar">
            <button
              type="button"
              class:active={activePanel === 'overview'}
              on:click={() => activePanel = 'overview'}
            >Overview</button>
            <button
              type="button"
              class:active={activePanel === 'checks'}
              on:click={() => activePanel = 'checks'}
            >Checks</button>
            <button
              type="button"
              class:active={activePanel === 'details'}
              on:click={() => activePanel = 'details'}
            >Details</button>
          </div>

          {#if activePanel === 'overview'}
            <section class="panel-body">
              <p class="eyebrow">Slide Overview</p>
              <h3>{editorState.selectedSlide.metadata.title}</h3>
              <p class="muted">{editorState.selectedSlide.metadata.narrative}</p>

              <dl class="meta-grid">
                <div>
                  <dt>Type</dt>
                  <dd>{editorState.selectedSlide.metadata.type}</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>{selectedHealth}</dd>
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
          {:else if activePanel === 'checks'}
            <section class="panel-body">
              <p class="eyebrow">Checks</p>
              {#if selectedPresentation}
                <h3>{selectedPresentation.headline}</h3>
                <p class="muted">{statusCopy(selectedPresentation)}</p>

                <div class="summary-grid">
                  <div>
                    <strong>{selectedPresentation.blockingCount}</strong>
                    <span>Blocking</span>
                  </div>
                  <div>
                    <strong>{selectedPresentation.preExistingCount}</strong>
                    <span>Older Issues</span>
                  </div>
                  <div>
                    <strong>{selectedPresentation.resolvedCount}</strong>
                    <span>Resolved</span>
                  </div>
                </div>

                {#if topBlockers.length > 0}
                  <IssueList title="Blocking items" tone="error" issues={topBlockers} />
                {/if}
                {#if topPreExisting.length > 0}
                  <IssueList title="Older issues still present" tone="warning" issues={topPreExisting} />
                {/if}
                {#if selectedPresentation.blockingCount === 0 && selectedPresentation.preExistingCount === 0}
                  <p class="muted">No issues introduced by this edit.</p>
                {/if}
              {:else}
                <p class="muted">This slide has not been validated yet.</p>
              {/if}
            </section>
          {:else}
            <section class="panel-body">
              <p class="eyebrow">Technical Details</p>
              <dl class="meta-grid">
                <div>
                  <dt>Revision</dt>
                  <dd>{editorState.selectedSlide.revisionHash.slice(0, 12)}</dd>
                </div>
                <div>
                  <dt>Validated</dt>
                  <dd>{editorState.selectedSlide.lastValidation?.validatedAt ?? 'Not yet'}</dd>
                </div>
              </dl>

              {#if editorState.selectedSlide.lastValidation}
                <div class="summary-grid technical-grid">
                  <div>
                    <strong>{editorState.selectedSlide.lastValidation.errorCount}</strong>
                    <span>Errors</span>
                  </div>
                  <div>
                    <strong>{editorState.selectedSlide.lastValidation.warningCount}</strong>
                    <span>Warnings</span>
                  </div>
                  <div>
                    <strong>{editorState.selectedSlide.lastValidation.infoCount}</strong>
                    <span>Info</span>
                  </div>
                </div>

                {#if rawIssues.length > 0}
                  <IssueList title="Rule-level issues" tone="info" issues={rawIssues} />
                {:else}
                  <p class="muted">No technical validation issues on the selected slide.</p>
                {/if}
              {:else}
                <p class="muted">This slide has not been validated yet.</p>
              {/if}
            </section>
          {/if}
        </aside>
      {/if}
    </div>
  </div>
{/if}

<style>
  :global(html) {
    height: 100%;
  }

  :global(body) {
    margin: 0;
    height: 100%;
    overflow: hidden;
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

  .app-shell {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 14px;
    height: 100vh;
    padding: 16px;
    overflow: hidden;
  }

  .shell-card {
    background: rgba(255, 250, 244, 0.88);
    border: 1px solid rgba(120, 92, 66, 0.16);
    box-shadow: 0 16px 40px rgba(59, 37, 17, 0.08);
    border-radius: 28px;
  }

  .deck-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 22px;
  }

  .deck-title-block {
    min-width: 0;
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

  h1 {
    font-size: clamp(2rem, 2.8vw, 3rem);
    line-height: 1.05;
  }

  .muted {
    margin: 0;
    color: #6f635a;
  }

  .status-chip,
  .health-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    padding: 7px 12px;
    font-size: 12px;
    font-weight: 600;
  }

  .status-chip.clean,
  .health-pill.clean {
    background: rgba(11, 127, 110, 0.12);
    color: #0b7f6e;
  }

  .status-chip.blocking,
  .health-pill.blocked {
    background: rgba(182, 71, 49, 0.14);
    color: #9f412a;
  }

  .status-chip.edited_with_preexisting_issues,
  .status-chip.regression,
  .status-chip.unvalidated,
  .health-pill.needs_attention {
    background: rgba(200, 135, 17, 0.14);
    color: #94610f;
  }

  .workspace {
    position: relative;
    display: grid;
    grid-template-columns: 212px minmax(0, 1fr);
    gap: 14px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .slide-sidebar {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
    max-height: 100%;
    min-height: 0;
    overflow: hidden;
    padding: 12px;
  }

  .sidebar-head {
    margin-bottom: 12px;
  }

  .sidebar-track {
    display: grid;
    gap: 10px;
    min-height: 0;
    overflow-y: auto;
    padding-right: 6px;
    overscroll-behavior: contain;
  }

  .slide-card {
    display: grid;
    gap: 8px;
    padding: 10px;
    border: 1px solid rgba(120, 92, 66, 0.12);
    border-radius: 18px;
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
    gap: 2px;
    color: #6f635a;
    font-size: 13px;
  }

  .slide-copy strong {
    line-height: 1.3;
  }

  .slide-copy span {
    line-height: 1.25;
  }

  .main-column {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: 14px;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }

  .canvas-panel {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }

  .canvas-head,
  .composer-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 20px 14px;
    border-bottom: 1px solid rgba(120, 92, 66, 0.12);
  }

  .canvas-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    flex-wrap: wrap;
  }

  .canvas-note {
    font-size: 13px;
    color: #6f635a;
  }

  .canvas-note.conflict {
    color: #8f4d22;
  }

  .canvas-stage {
    padding: 14px;
    min-height: 0;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .composer-panel {
    overflow: hidden;
  }

  .composer-body {
    padding: 0 20px 18px;
    display: grid;
    gap: 12px;
  }

  .composer-panel textarea,
  .composer-panel pre {
    width: 100%;
    border-radius: 18px;
    border: 1px solid rgba(120, 92, 66, 0.16);
    background: rgba(255, 255, 255, 0.9);
    padding: 14px;
    font: inherit;
  }

  .composer-panel textarea {
    min-height: 92px;
    resize: vertical;
  }

  .composer-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  button.primary {
    border: 0;
    border-radius: 999px;
    background: linear-gradient(135deg, #0d8d77, #177d6e);
    color: white;
    padding: 14px 22px;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .ghost-button {
    border: 1px solid rgba(120, 92, 66, 0.16);
    background: rgba(255, 255, 255, 0.84);
    color: #4b4038;
    border-radius: 999px;
    padding: 10px 14px;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .technical-fallback {
    margin: 0 20px 18px;
  }

  .technical-fallback pre {
    overflow-x: auto;
  }

  .inspector-scrim {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(30, 22, 16, 0.08);
    z-index: 2;
    cursor: pointer;
  }

  .inspector {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(360px, calc(100vw - 120px));
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    min-height: 0;
    overflow: hidden;
    z-index: 3;
  }

  .inspector-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px 12px;
    border-bottom: 1px solid rgba(120, 92, 66, 0.12);
  }

  .tab-bar {
    display: flex;
    gap: 10px;
    padding: 14px 16px 0;
  }

  .tab-bar button {
    border: 0;
    border-radius: 999px;
    padding: 10px 16px;
    background: rgba(130, 114, 96, 0.12);
    color: #5e5147;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .tab-bar button.active {
    background: rgba(11, 127, 110, 0.14);
    color: #0b7f6e;
  }

  .panel-body {
    padding: 16px 18px 18px;
    overflow-y: auto;
  }

  .meta-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
    margin-top: 18px;
  }

  .meta-grid dt {
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #7a6756;
    margin-bottom: 4px;
  }

  .meta-grid dd {
    margin: 0;
    color: #352a24;
    font-weight: 600;
  }

  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 18px;
  }

  .tag-row span {
    border-radius: 999px;
    padding: 6px 10px;
    background: rgba(11, 127, 110, 0.1);
    color: #0b7f6e;
    font-size: 12px;
  }

  .point-list {
    margin: 18px 0 0;
    padding-left: 18px;
    color: #4f4238;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin: 18px 0;
  }

  .summary-grid > div {
    background: rgba(255, 255, 255, 0.76);
    border: 1px solid rgba(120, 92, 66, 0.1);
    border-radius: 18px;
    padding: 12px;
    display: grid;
    gap: 2px;
  }

  .summary-grid strong {
    font-size: 22px;
    color: #2f261f;
  }

  .summary-grid span {
    color: #6f635a;
    font-size: 12px;
  }

  .technical-grid strong {
    font-size: 18px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 1100px) {
    .workspace {
      grid-template-columns: 188px minmax(0, 1fr);
    }
  }

  @media (max-width: 900px) {
    :global(body) {
      overflow: auto;
    }

    .app-shell {
      height: auto;
      min-height: 100vh;
      overflow: visible;
    }

    .deck-header,
    .canvas-head,
    .composer-head {
      flex-direction: column;
    }

    .workspace {
      grid-template-columns: 1fr;
    }

    .slide-sidebar {
      max-height: 320px;
    }

    .summary-grid,
    .meta-grid {
      grid-template-columns: 1fr;
    }

    .inspector-scrim {
      display: none;
    }

    .inspector {
      position: static;
      width: auto;
      margin-top: 14px;
    }
  }
</style>
