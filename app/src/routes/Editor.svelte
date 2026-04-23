<!--
  Editor route — format-aware slide canvas + thumbnail rail + revision composer.

  For slides_16_9: landscape canvas with thumbnail rail on the left.
  For print_* formats: portrait canvas + vertical multi-page preview below.
-->
<script lang="ts">
  import SlideCanvas from '../lib/SlideCanvas.svelte';
  import IssueList from '../lib/IssueList.svelte';
  import PagePreview from '../lib/PagePreview.svelte';
  import FormatBadge from '../lib/FormatBadge.svelte';
  import CommentDrawer from '../lib/CommentDrawer.svelte';
  import { Button, Card, Pill, Tabs, Textarea } from '../lib/primitives/index';
  import { buildRevisionFallback } from '../lib/revise';
  import type { DeckStore } from '../stores/deck.svelte';
  import type { ValidationPresentation, ValidationIssue, ValidationIssueSummary, SlideHealth, FormatKind } from '../lib/types';
  import type { McpDeckEditorBridge, CommentTarget } from '../lib/bridge';

  interface Props {
    deck: DeckStore;
    bridge?: McpDeckEditorBridge;
    onRevisionRequest?: (payload: unknown) => Promise<void>;
  }

  let { deck, bridge, onRevisionRequest }: Props = $props();

  // ── Comment drawer state (v4) ────────────────────────────────────────────
  let commentDrawerOpen = $state(false);
  let commentDraft = $state('');
  let commentKind = $state<'revision' | 'question' | 'approval' | 'note'>('note');
  let commentStatus = $state('');
  let commentPending = $state(false);

  function toggleCommentDrawer(): void {
    commentDrawerOpen = !commentDrawerOpen;
  }

  async function submitComment(): Promise<void> {
    if (!bridge || !deck.editorState || !commentDraft.trim()) return;
    commentPending = true;
    commentStatus = '';
    try {
      const target: CommentTarget = {
        kind: 'slide',
        slide_id: deck.editorState.selectedSlide.slideId,
      };
      await bridge.addCommentFromApp({
        deck_id: deck.editorState.deck.id,
        target,
        kind: commentKind,
        body: commentDraft.trim(),
      });
      commentDraft = '';
      commentStatus = 'Pinned.';
      commentDrawerOpen = true;
    } catch (err) {
      commentStatus = err instanceof Error ? err.message : String(err);
    } finally {
      commentPending = false;
    }
  }

  function handleCommentJump(target: CommentTarget): void {
    if (target.kind === 'slide') {
      deck.selectSlide(target.slideId as unknown as string);
      commentDrawerOpen = false;
    } else if (target.kind === 'element') {
      deck.selectSlide(target.containerId);
      commentDrawerOpen = false;
    }
    // Section targets are not yet routable in the slide editor; Wave 5 will
    // cover document-mode Editor.
  }

  let detailsOpen = $state(false);
  let activePanel = $state<'overview' | 'checks' | 'details'>('overview');
  let reviseInstruction = $state('');
  let reviseStatus = $state('');
  let reviseFallbackPayload = $state('');
  let canvasNonce = $state(0);

  const deckFormat = $derived<FormatKind>(deck.editorState?.deck.format ?? 'slides_16_9');
  const isPrint = $derived(deckFormat !== 'slides_16_9');
  const selectedSlide = $derived(deck.editorState?.selectedSlide);
  const thumbnails = $derived(deck.editorState?.thumbnails ?? []);
  const selectedPresentation = $derived(selectedSlide?.validationPresentation ?? null);
  const topBlockers = $derived(selectedPresentation?.topBlockers ?? []);
  const topPreExisting = $derived(selectedPresentation?.topPreExisting ?? []);
  const rawIssues = $derived(selectedSlide?.lastValidation?.issues ?? []);
  const selectedHealth = $derived(
    selectedPresentation ? healthLabel(healthFromPresentation(selectedPresentation)) : 'Review',
  );
  const healthPillTone = $derived(
    selectedPresentation?.status === 'clean' ? 'success'
    : selectedPresentation?.status === 'blocking' ? 'error'
    : 'warning',
  );

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'checks', label: 'Checks' },
    { key: 'details', label: 'Details' },
  ];

  function healthLabel(health: SlideHealth): string {
    switch (health) {
      case 'clean': return 'Clean';
      case 'blocked': return 'Blocked';
      default: return 'Review';
    }
  }

  function healthFromPresentation(p: ValidationPresentation): SlideHealth {
    switch (p.status) {
      case 'clean': return 'clean';
      case 'blocking': return 'blocked';
      default: return 'needs_attention';
    }
  }

  function statusCopy(p: ValidationPresentation | null): string {
    switch (p?.status) {
      case 'clean': return 'No new blockers introduced. Keep iterating or export when the deck is ready.';
      case 'blocking': return 'Review the blocking items before export.';
      case 'regression': return 'The latest edit introduced issues that should be reviewed.';
      case 'edited_with_preexisting_issues': return 'Your latest edit worked, but this slide still carries older issues.';
      default: return 'Validation details will appear here after the slide is checked.';
    }
  }

  function thumbnailHealthTone(h: SlideHealth): 'success' | 'warning' | 'error' | 'muted' {
    switch (h) {
      case 'clean': return 'success';
      case 'blocked': return 'error';
      default: return 'warning';
    }
  }

  async function handleTextCommit(detail: { editId: string; text: string }): Promise<void> {
    await deck.applyTextEdit(detail.editId, detail.text);
    if (deck.conflictMessage) {
      canvasNonce += 1;
    }
  }

  async function handleRevise(): Promise<void> {
    if (!deck.editorState || !reviseInstruction.trim()) return;
    reviseStatus = '';
    reviseFallbackPayload = '';

    const payload = {
      deck_id: deck.editorState.deck.id,
      deck_title: deck.editorState.deck.title,
      slide_id: deck.editorState.selectedSlide.slideId,
      slide_title: deck.editorState.selectedSlide.metadata.title,
      instruction: reviseInstruction.trim(),
      html: deck.editorState.selectedSlide.html,
      metadata: deck.editorState.selectedSlide.metadata,
      validation: deck.editorState.selectedSlide.lastValidation,
      revision_hash: deck.editorState.selectedSlide.revisionHash,
    };

    try {
      if (onRevisionRequest) {
        await onRevisionRequest(payload);
      }
      reviseStatus = 'Revision request sent to the host agent.';
      reviseInstruction = '';
    } catch (error) {
      reviseFallbackPayload = buildRevisionFallback(payload);
      reviseStatus = error instanceof Error ? error.message : String(error);
    }
  }
</script>

{#if deck.editorState}
  {@const state = deck.editorState}
  <div class={`editor-layout ${isPrint ? 'print-mode' : 'slide-mode'}`}>

    <!-- Left sidebar: thumbnail rail -->
    <aside class="thumb-rail">
      <div class="rail-head">
        <p class="eyebrow">{isPrint ? 'Pages' : 'Slides'}</p>
      </div>
      <div class="rail-track">
        {#each thumbnails as thumb (thumb.slideId)}
          <button
            type="button"
            class={`thumb-card ${thumb.slideId === state.selectedSlide.slideId ? 'selected' : ''}`}
            onclick={() => deck.selectSlide(thumb.slideId)}
            disabled={deck.saving}
            aria-label="{thumb.position + 1}. {thumb.title}"
          >
            <img
              alt="{isPrint ? 'Page' : 'Slide'} {thumb.position + 1} thumbnail"
              src="data:image/png;base64,{thumb.imageBase64}"
              class={isPrint ? 'thumb-img-portrait' : 'thumb-img-landscape'}
            />
            <div class="thumb-copy">
              <strong>{thumb.position + 1}. {thumb.title}</strong>
              <Pill tone={thumbnailHealthTone(thumb.health)} size="sm">{healthLabel(thumb.health)}</Pill>
            </div>
          </button>
        {/each}
      </div>
    </aside>

    <!-- Main column -->
    <div class="main-col">

      <!-- Canvas section -->
      <Card padding="none" elevation="e1" class="canvas-card">
        <div class="canvas-head">
          <div class="canvas-head-left">
            <p class="eyebrow">Selected {isPrint ? 'Page' : 'Slide'}</p>
            <h2>{selectedSlide?.metadata.title ?? ''}</h2>
          </div>
          <div class="canvas-head-right">
            <FormatBadge format={deckFormat} />
            {#if selectedPresentation}
              <Pill tone={healthPillTone} size="sm">{selectedHealth}</Pill>
            {/if}
            {#if deck.saving}
              <span class="canvas-note">Saving…</span>
            {/if}
            {#if deck.conflictMessage}
              <span class="canvas-note conflict">{deck.conflictMessage}</span>
            {/if}
            <Button variant="ghost" size="sm" onclick={() => detailsOpen = !detailsOpen}>
              {detailsOpen ? 'Hide details' : 'Slide details'}
            </Button>
            {#if bridge}
              <Button variant="ghost" size="sm" onclick={toggleCommentDrawer}>
                Comments
              </Button>
            {/if}
          </div>
        </div>

        <div class="canvas-stage">
          <SlideCanvas
            html={selectedSlide?.html ?? ''}
            revisionHash={selectedSlide?.revisionHash ?? ''}
            renderNonce={canvasNonce}
            disabled={deck.saving}
            format={deckFormat}
            oncommit={handleTextCommit}
            onerror={(d) => console.error(d.message)}
          />
        </div>

        <!-- Print: multi-page preview below the active canvas -->
        {#if isPrint && thumbnails.length > 1}
          <div class="page-preview-section">
            <p class="eyebrow section-label">All Pages</p>
            <PagePreview
              {thumbnails}
              activeSlideId={state.selectedSlide.slideId}
              format={deckFormat}
              onSelect={(id) => deck.selectSlide(id)}
            />
          </div>
        {/if}
      </Card>

      <!-- v4: Drop a comment on the selected slide -->
      {#if bridge}
        <Card padding="none" elevation="e1" class="comment-composer-card">
          <div class="cc-head">
            <p class="eyebrow">Pin a Comment</p>
            {#if commentStatus}
              <p class="cc-status">{commentStatus}</p>
            {/if}
          </div>
          <div class="cc-body">
            <div class="cc-kind-row">
              {#each (['revision', 'question', 'approval', 'note'] as const) as k}
                <button
                  type="button"
                  class={`cc-kind ${commentKind === k ? 'active' : ''}`}
                  onclick={() => { commentKind = k; }}
                >{k}</button>
              {/each}
            </div>
            <Textarea
              bind:value={commentDraft}
              rows={2}
              placeholder="Note something to discuss with the agent here (pinned to this slide)."
            />
            <div class="cc-actions">
              <Button
                variant="primary"
                size="sm"
                onclick={submitComment}
                disabled={!commentDraft.trim() || commentPending}
              >
                {commentPending ? 'Pinning…' : 'Pin comment'}
              </Button>
              <Button variant="ghost" size="sm" onclick={toggleCommentDrawer}>
                See all comments
              </Button>
            </div>
          </div>
        </Card>
      {/if}

      <!-- Revision composer -->
      <Card padding="none" elevation="e1" class="composer-card">
        <div class="composer-head">
          <p class="eyebrow">Ask Agent To Revise</p>
          {#if reviseStatus}
            <p class="revise-status">{reviseStatus}</p>
          {/if}
        </div>
        <div class="composer-body">
          <Textarea
            bind:value={reviseInstruction}
            rows={2}
            placeholder="Remove the CTA and make the closing copy more direct."
          />
          <div class="composer-actions">
            <Button
              variant="primary"
              size="md"
              onclick={handleRevise}
              disabled={!reviseInstruction.trim() || deck.saving}
            >
              Ask agent to revise
            </Button>
          </div>
        </div>
        {#if reviseFallbackPayload}
          <details class="fallback-details">
            <summary>Revision payload</summary>
            <pre class="fallback-pre">{reviseFallbackPayload}</pre>
          </details>
        {/if}
      </Card>
    </div>

    <!-- Inspector panel (slides only on desktop; print keeps it as overlay too) -->
    {#if detailsOpen}
      <button
        type="button"
        class="inspector-scrim"
        aria-label="Close details"
        onclick={() => detailsOpen = false}
      ></button>

      <aside class="inspector">
        <div class="inspector-head">
          <p class="eyebrow">Slide details</p>
          <Button variant="ghost" size="sm" onclick={() => detailsOpen = false}>Close</Button>
        </div>

        <Tabs
          tabs={tabs}
          active={activePanel}
          onSelect={(k) => activePanel = k as typeof activePanel}
        />

        {#if activePanel === 'overview'}
          <section class="panel-body">
            <p class="eyebrow">Overview</p>
            <h3>{selectedSlide?.metadata.title}</h3>
            <p class="muted">{selectedSlide?.metadata.narrative}</p>

            <dl class="meta-grid">
              <div><dt>Type</dt><dd>{selectedSlide?.metadata.type}</dd></div>
              <div><dt>Status</dt><dd>{selectedHealth}</dd></div>
            </dl>

            {#if (selectedSlide?.metadata.tags.length ?? 0) > 0}
              <div class="tag-row">
                {#each selectedSlide?.metadata.tags ?? [] as tag}
                  <Pill tone="mint" size="sm">{tag}</Pill>
                {/each}
              </div>
            {/if}

            {#if (selectedSlide?.metadata.keyPoints.length ?? 0) > 0}
              <ul class="point-list">
                {#each selectedSlide?.metadata.keyPoints ?? [] as point}
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
                <div class="summary-cell">
                  <strong>{selectedPresentation.blockingCount}</strong>
                  <span>Blocking</span>
                </div>
                <div class="summary-cell">
                  <strong>{selectedPresentation.preExistingCount}</strong>
                  <span>Older Issues</span>
                </div>
                <div class="summary-cell">
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
                <dd>{selectedSlide?.revisionHash.slice(0, 12)}</dd>
              </div>
              <div>
                <dt>Validated</dt>
                <dd>{selectedSlide?.lastValidation?.validatedAt ?? 'Not yet'}</dd>
              </div>
            </dl>

            {#if selectedSlide?.lastValidation}
              <div class="summary-grid">
                <div class="summary-cell">
                  <strong>{selectedSlide.lastValidation.errorCount}</strong>
                  <span>Errors</span>
                </div>
                <div class="summary-cell">
                  <strong>{selectedSlide.lastValidation.warningCount}</strong>
                  <span>Warnings</span>
                </div>
                <div class="summary-cell">
                  <strong>{selectedSlide.lastValidation.infoCount}</strong>
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

    <!-- v4 Comment drawer (overlay) -->
    {#if bridge && deck.editorState}
      <CommentDrawer
        bridge={bridge}
        deckId={deck.editorState.deck.id}
        open={commentDrawerOpen}
        onClose={() => { commentDrawerOpen = false; }}
        onJump={handleCommentJump}
      />
    {/if}

  </div>
{/if}

<style>
  /* ── Layouts ──────────────────────────────────────────────── */
  .editor-layout {
    display: grid;
    gap: var(--s-3);
    height: 100%;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  .slide-mode {
    grid-template-columns: 212px minmax(0, 1fr);
  }

  .print-mode {
    grid-template-columns: 200px minmax(0, 1fr);
  }

  /* ── Thumbnail rail ───────────────────────────────────────── */
  .thumb-rail {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
    overflow: hidden;
    min-height: 0;
  }

  .rail-head {
    padding: var(--s-3) var(--s-3) 0;
    border-bottom: 1px solid var(--border-hairline);
    padding-bottom: var(--s-3);
  }

  .rail-track {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    overflow-y: auto;
    padding: var(--s-3);
    overscroll-behavior: contain;
  }

  .thumb-card {
    padding: var(--s-2);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-md);
    background: var(--surface-1);
    text-align: left;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    transition:
      border-color var(--dur-micro) var(--ease),
      box-shadow var(--dur-micro) var(--ease);
  }

  .thumb-card:hover {
    border-color: var(--mint);
  }

  .thumb-card.selected {
    border-color: var(--mint);
    box-shadow: 0 0 0 3px var(--mint-tint);
  }

  .thumb-card:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--mint-tint);
  }

  .thumb-img-landscape {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: var(--r-sm);
    border: 1px solid var(--border-hairline);
    display: block;
  }

  .thumb-img-portrait {
    width: 100%;
    aspect-ratio: 1240 / 1754;
    object-fit: cover;
    border-radius: var(--r-sm);
    border: 1px solid var(--border-hairline);
    display: block;
  }

  .thumb-copy {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    font-size: 12px;
    color: var(--ink-2);
    min-width: 0;
  }

  .thumb-copy strong {
    font-size: 12px;
    color: var(--ink-1);
    font-weight: 600;
    line-height: 1.3;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Main column ──────────────────────────────────────────── */
  .main-col {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: var(--s-3);
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }

  /* Force Card children to participate in grid */
  :global(.canvas-card) {
    display: grid !important;
    grid-template-rows: auto minmax(0, 1fr) auto !important;
    min-height: 0;
    overflow: hidden;
  }

  /* ── Canvas card internals ────────────────────────────────── */
  .canvas-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--s-4);
    padding: var(--s-4) var(--s-5) var(--s-3);
    border-bottom: 1px solid var(--border-hairline);
    flex-wrap: wrap;
  }

  .canvas-head-left {
    min-width: 0;
  }

  .canvas-head-right {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .canvas-note {
    font-size: 12px;
    color: var(--ink-3);
  }

  .canvas-note.conflict {
    color: var(--terracotta);
  }

  .canvas-stage {
    padding: var(--s-3);
    min-height: 0;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .page-preview-section {
    border-top: 1px solid var(--border-hairline);
    max-height: 340px;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .section-label {
    padding: var(--s-3) var(--s-5) 0;
  }

  /* ── Comment composer (v4) ────────────────────────────────── */
  :global(.comment-composer-card) {
    display: grid !important;
    grid-template-rows: auto auto !important;
    overflow: hidden;
  }

  .cc-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-5) var(--s-2);
    border-bottom: 1px solid var(--border-hairline);
  }

  .cc-status {
    font-size: 11px;
    color: var(--ink-3);
  }

  .cc-body {
    padding: var(--s-3) var(--s-5) var(--s-3);
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }

  .cc-kind-row {
    display: flex;
    gap: var(--s-1);
    flex-wrap: wrap;
  }

  .cc-kind {
    font-size: 11px;
    font-weight: 500;
    padding: 2px 10px;
    border-radius: var(--r-pill);
    border: 1px solid var(--border-subtle);
    color: var(--ink-2);
    background: var(--surface-1);
    cursor: pointer;
    text-transform: capitalize;
  }

  .cc-kind:hover {
    border-color: var(--mint);
    color: var(--mint-hover);
  }

  .cc-kind.active {
    background: var(--mint-tint);
    border-color: var(--mint);
    color: var(--mint-hover);
  }

  .cc-actions {
    display: flex;
    gap: var(--s-2);
    align-items: center;
    padding-top: var(--s-1);
  }

  /* ── Composer card internals ──────────────────────────────── */
  :global(.composer-card) {
    display: grid !important;
    grid-template-rows: auto 1fr auto !important;
    overflow: hidden;
  }

  .composer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-4);
    padding: var(--s-4) var(--s-5) var(--s-3);
    border-bottom: 1px solid var(--border-hairline);
  }

  .revise-status {
    font-size: 12px;
    color: var(--ink-3);
  }

  .composer-body {
    padding: var(--s-3) var(--s-5) var(--s-4);
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }

  .composer-actions {
    display: flex;
    align-items: center;
    gap: var(--s-3);
  }

  .fallback-details {
    margin: 0 var(--s-5) var(--s-4);
    font-size: 12px;
  }

  .fallback-pre {
    overflow-x: auto;
    background: var(--surface-2);
    border-radius: var(--r-sm);
    padding: var(--s-3);
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--ink-2);
  }

  /* ── Inspector ────────────────────────────────────────────── */
  .inspector-scrim {
    position: absolute;
    inset: 0;
    border: 0;
    background: rgba(31, 35, 40, 0.08);
    z-index: 10;
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
    z-index: 11;
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    box-shadow: var(--e3);
  }

  .inspector-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    padding: var(--s-4) var(--s-4) var(--s-3);
    border-bottom: 1px solid var(--border-hairline);
  }

  .panel-body {
    padding: var(--s-4) var(--s-4) var(--s-5);
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
  }

  .meta-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-3);
    margin-top: var(--s-3);
  }

  .meta-grid dt {
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin-bottom: var(--s-1);
  }

  .meta-grid dd {
    margin: 0;
    color: var(--ink-1);
    font-weight: 600;
    font-size: 13px;
  }

  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    margin-top: var(--s-1);
  }

  .point-list {
    margin: var(--s-1) 0 0;
    padding-left: var(--s-5);
    color: var(--ink-2);
    font-size: 13px;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-3);
    margin-top: var(--s-2);
  }

  .summary-cell {
    background: var(--surface-2);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-md);
    padding: var(--s-3);
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
  }

  .summary-cell strong {
    font-size: 20px;
    color: var(--ink-1);
  }

  .summary-cell span {
    color: var(--ink-3);
    font-size: 11px;
  }

  /* ── Shared ───────────────────────────────────────────────── */
  .eyebrow {
    margin: 0 0 var(--s-2);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 11px;
    color: var(--ink-3);
    font-weight: 500;
  }

  .muted {
    color: var(--ink-3);
    font-size: 13px;
  }

  h2 {
    font-size: 18px;
    font-weight: 600;
    color: var(--ink-1);
  }

  h3 {
    font-size: 15px;
    font-weight: 600;
    color: var(--ink-1);
  }

  /* ── Responsive ───────────────────────────────────────────── */
  @media (max-width: 1100px) {
    .slide-mode { grid-template-columns: 188px minmax(0, 1fr); }
    .print-mode { grid-template-columns: 180px minmax(0, 1fr); }
  }

  @media (max-width: 860px) {
    .slide-mode,
    .print-mode {
      grid-template-columns: 1fr;
    }

    .thumb-rail {
      max-height: 260px;
    }

    .inspector-scrim {
      display: none;
    }

    .inspector {
      position: static;
      width: auto;
      margin-top: var(--s-3);
    }
  }
</style>
