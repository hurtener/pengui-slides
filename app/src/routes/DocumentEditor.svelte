<!--
  DocumentEditor — v4 document-mode (continuous-document) editor.

  For decks with authoring_model === 'document'. Shows a section-list rail,
  a fragment preview in the center, and an inspector on the right for
  section kind + break hints + deck-level chrome config.

  All mutations go through app-only bridge methods (applyBlockEdit,
  updateDocumentMeta) so binary/text payloads stay out of the LLM transcript.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import CommentDrawer from '../lib/CommentDrawer.svelte';
  import { Button, Card, Pill } from '../lib/primitives/index';
  import type {
    McpDeckEditorBridge,
    CommentTarget,
    SectionListItem,
    SectionDetail,
    DesignSoul,
  } from '../lib/bridge';

  interface Props {
    bridge: McpDeckEditorBridge;
    deckRef: string;
  }

  let { bridge, deckRef }: Props = $props();

  // Soul whose tokens we inject into the preview iframe so the
  // section fragment renders with real typography/colour instead of
  // a neutral CSS shell. Resolved once on mount via get_deck_summary
  // → get_design_soul.
  let soul = $state<DesignSoul | null>(null);

  // ── All SectionKinds from the spec. Mirrors src/types/section.ts. ───────
  const SECTION_KINDS = [
    'cover',
    'chapter_header',
    'toc',
    'prose',
    'figure',
    'chart',
    'diagram',
    'table',
    'callout',
    'comparison',
    'glossary',
    'bibliography',
    'quote',
    'image',
  ] as const;
  type SectionKind = (typeof SECTION_KINDS)[number];

  // ── State ───────────────────────────────────────────────────────────────
  let sections = $state<SectionListItem[]>([]);
  let selectedId = $state<string | null>(null);
  let detail = $state<SectionDetail | null>(null);
  let loadingList = $state(true);
  let loadingDetail = $state(false);
  let error = $state('');
  let savingKind = $state(false);
  let savingHints = $state(false);
  let savingChrome = $state(false);
  let commentDrawerOpen = $state(false);
  let commentDraft = $state('');
  let commentKind = $state<'revision' | 'question' | 'approval' | 'note'>('note');
  let commentPending = $state(false);

  // Local edit state for break hints (mirrors the server shape).
  let hintBreakBefore = $state<'' | 'auto' | 'page' | 'avoid'>('');
  let hintBreakAfter = $state<'' | 'auto' | 'page' | 'avoid'>('');
  let hintKeepTogether = $state(false);
  let hintFullPage = $state(false);

  // Chrome state — stored at deck level, loaded lazily via deck summary.
  let chromeRunningTitle = $state('');
  let chromePageNumber = $state(true);
  let chromeFooterAlign = $state<'left' | 'center' | 'right'>('right');
  let chromeHide = $state(false);

  onMount(() => {
    void loadSections();
    void loadChromeFromDeck();
    void loadSoul();
  });

  async function loadSoul(): Promise<void> {
    try {
      const summary = await bridge.callTool<{ soul_id?: string; soul_slug?: string }>(
        'get_deck_summary',
        { deck_id: deckRef },
      );
      const soulRef = summary.structuredContent?.soul_id ?? summary.structuredContent?.soul_slug;
      if (!soulRef) return;
      const r = await bridge.getDesignSoul(soulRef);
      soul = r.soul;
    } catch {
      // Soul is optional — preview gracefully degrades to neutral shell.
      soul = null;
    }
  }

  // ── Loaders ─────────────────────────────────────────────────────────────
  async function loadSections(): Promise<void> {
    loadingList = true;
    error = '';
    try {
      const result = await bridge.listSections(deckRef);
      sections = [...result.sections].sort((a, b) => a.position - b.position);
      // Auto-select first section on initial load if none chosen.
      if (!selectedId && sections.length > 0) {
        await selectSection(sections[0].id);
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loadingList = false;
    }
  }

  async function selectSection(id: string): Promise<void> {
    selectedId = id;
    loadingDetail = true;
    try {
      const r = await bridge.getSection(id);
      detail = r.section;
      // Sync local hint state to what's stored
      const h = detail.break_hints ?? {};
      hintBreakBefore = (h.breakBefore ?? '') as typeof hintBreakBefore;
      hintBreakAfter = (h.breakAfter ?? '') as typeof hintBreakAfter;
      hintKeepTogether = h.keepTogether ?? false;
      hintFullPage = h.fullPage ?? false;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loadingDetail = false;
    }
  }

  async function loadChromeFromDeck(): Promise<void> {
    // The deck summary currently does not expose documentMeta; we could
    // extend later. For now the chrome form starts with sensible defaults
    // and writes apply on submit.
  }

  // ── Mutations ───────────────────────────────────────────────────────────
  async function changeKind(newKind: SectionKind): Promise<void> {
    if (!detail) return;
    savingKind = true;
    error = '';
    try {
      await bridge.applyBlockEdit({
        kind: 'section_kind',
        deck_ref: deckRef,
        section_id: detail.id,
        new_kind: newKind,
      });
      await selectSection(detail.id);
      await loadSections();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      savingKind = false;
    }
  }

  async function saveBreakHints(): Promise<void> {
    if (!detail) return;
    savingHints = true;
    error = '';
    try {
      const hints: {
        break_before?: 'auto' | 'page' | 'avoid';
        break_after?: 'auto' | 'page' | 'avoid';
        keep_together?: boolean;
        full_page?: boolean;
      } = {};
      if (hintBreakBefore) hints.break_before = hintBreakBefore;
      if (hintBreakAfter) hints.break_after = hintBreakAfter;
      hints.keep_together = hintKeepTogether;
      hints.full_page = hintFullPage;

      await bridge.applyBlockEdit({
        kind: 'break_hints',
        deck_ref: deckRef,
        section_id: detail.id,
        hints,
      });
      await selectSection(detail.id);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      savingHints = false;
    }
  }

  async function saveChromeConfig(): Promise<void> {
    savingChrome = true;
    error = '';
    try {
      await bridge.applyBlockEdit({
        kind: 'chrome_config',
        deck_ref: deckRef,
        chrome: {
          runningTitle: chromeRunningTitle,
          pageNumber: chromePageNumber,
          footerAlign: chromeFooterAlign,
          hide: chromeHide,
        },
      });
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      savingChrome = false;
    }
  }

  // ── Comments (on sections) ──────────────────────────────────────────────
  async function submitComment(): Promise<void> {
    if (!detail || !commentDraft.trim()) return;
    commentPending = true;
    try {
      const target: CommentTarget = { kind: 'section', section_id: detail.id };
      await bridge.addCommentFromApp({
        deck_id: deckRef,
        target,
        kind: commentKind,
        body: commentDraft.trim(),
      });
      commentDraft = '';
      commentDrawerOpen = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      commentPending = false;
    }
  }

  function handleCommentJump(target: CommentTarget): void {
    if (target.kind === 'section') {
      void selectSection(target.section_id);
      commentDrawerOpen = false;
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────

  // Build the iframe preview document. When a soul is loaded, inject its
  // cssTokens block verbatim so the section fragment renders with the real
  // design tokens (fonts, palette, spacing scale). Falls back to a neutral
  // shell when the soul hasn't resolved yet or the call failed.
  const previewSrcDoc = $derived(
    detail ? buildPreviewDoc(detail.html, soul) : '',
  );

  function buildPreviewDoc(html: string, s: DesignSoul | null): string {
    const soulTokens = s?.cssTokensString ?? '';
    // Neutral fallback values so typography still looks sensible before the
    // soul resolves or when a soul declines to expose specific tokens.
    const fallback = `
      :root {
        --color-canvas: #fafafa;
        --color-text-primary: #1f2328;
        --color-text-secondary: #5a5f66;
        --color-surface: #ffffff;
        --color-border: #e2e2e2;
        --font-body: system-ui, -apple-system, sans-serif;
        --font-display: system-ui, -apple-system, sans-serif;
        --text-body: 15px;
        --leading-body: 1.55;
      }
    `;
    // Shell styles mirror document-composer's universal rules so the
    // preview is visually representative of the final rendered document.
    const shell = `
      html, body {
        background: var(--color-canvas);
        color: var(--color-text-primary);
      }
      body {
        margin: 0;
        padding: 32px;
        font-family: var(--font-body);
        font-size: var(--text-body);
        line-height: var(--leading-body);
      }
      .pengui-section {
        background: var(--color-surface, #fff);
        padding: 24px 32px;
        border-radius: 8px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, .06);
        max-width: 720px;
        margin: 0 auto;
      }
      h1, h2, h3, h4 {
        font-family: var(--font-display, var(--font-body));
        line-height: 1.25;
      }
      table { border-collapse: collapse; width: 100%; }
      th, td { padding: 6px 10px; border: 1px solid var(--color-border, #e2e2e2); }
      figure { margin: 0; }
      figcaption { color: var(--color-text-secondary, #666); font-size: 12px; margin-top: 8px; }
    `;
    return `<!doctype html><html><head><meta charset="utf-8">
      <style>${fallback}</style>
      <style id="pengui-soul-tokens">${soulTokens}</style>
      <style>${shell}</style>
    </head><body>${html}</body></html>`;
  }
</script>

<div class="doc-editor">
  {#if error}
    <div class="error-bar" role="alert">{error}</div>
  {/if}

  <!-- Left rail: section list -->
  <aside class="section-rail">
    <div class="rail-head">
      <p class="eyebrow">Sections</p>
      {#if !loadingList}
        <span class="count">{sections.length}</span>
      {/if}
    </div>

    {#if loadingList}
      <div class="loading-row"><div class="spinner" aria-hidden="true"></div>Loading…</div>
    {:else if sections.length === 0}
      <p class="empty-rail">No sections yet. The agent will add some via <code>add_section</code>.</p>
    {:else}
      <div class="rail-track">
        {#each sections as section (section.id)}
          <button
            type="button"
            class={`section-row ${selectedId === section.id ? 'selected' : ''}`}
            onclick={() => selectSection(section.id)}
          >
            <span class="sec-pos">{section.position + 1}</span>
            <div class="sec-body">
              <span class="sec-title">{section.title || '(untitled)'}</span>
              <span class="sec-kind">{section.kind}</span>
            </div>
            {#if !section.isValid}
              <Pill tone="error" size="sm">!</Pill>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </aside>

  <!-- Center: preview canvas -->
  <div class="main-col">
    <Card padding="none" elevation="e1" class="doc-canvas-card">
      <div class="canvas-head">
        <div class="canvas-head-left">
          <p class="eyebrow">Selected Section</p>
          <h2>{detail?.metadata?.title || '(Pick a section to preview)'}</h2>
        </div>
        <div class="canvas-head-right">
          {#if detail}
            <Pill tone="mint" size="sm">{detail.kind}</Pill>
            <Pill tone={detail.last_validation?.passed ? 'success' : 'warning'} size="sm">
              {detail.last_validation?.passed ? 'Valid' : 'Needs review'}
            </Pill>
            <Button variant="ghost" size="sm" onclick={() => { commentDrawerOpen = !commentDrawerOpen; }}>
              Comments
            </Button>
          {/if}
        </div>
      </div>

      <div class="canvas-stage">
        {#if loadingDetail}
          <div class="canvas-empty"><div class="spinner" aria-hidden="true"></div>Loading section…</div>
        {:else if !detail}
          <div class="canvas-empty muted">Select a section from the left rail.</div>
        {:else}
          <iframe
            class="section-frame"
            title="Section preview"
            srcdoc={previewSrcDoc}
            sandbox="allow-same-origin"
          ></iframe>
        {/if}
      </div>
    </Card>

    <!-- Comment composer (section-scoped by default) -->
    {#if detail}
      <Card padding="none" elevation="e1" class="doc-comment-card">
        <div class="cc-head">
          <p class="eyebrow">Pin a Comment on this Section</p>
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
          <textarea
            class="cc-textarea"
            bind:value={commentDraft}
            rows="2"
            placeholder="Note something for the agent — pinned to this section (kind: {detail.kind})."
          ></textarea>
          <div class="cc-actions">
            <Button
              variant="primary"
              size="sm"
              onclick={submitComment}
              disabled={!commentDraft.trim() || commentPending}
            >
              {commentPending ? 'Pinning…' : 'Pin comment'}
            </Button>
          </div>
        </div>
      </Card>
    {/if}
  </div>

  <!-- Right: Inspector -->
  <aside class="inspector-pane">
    <Card padding="md" elevation="e1">
      <p class="eyebrow">Section Kind</p>
      <p class="muted small">Changing the kind re-tags break defaults: figures/charts/diagrams stay-together, cover/chapter_header are full-page, tables split with repeating headers.</p>
      <div class="kind-grid">
        {#each SECTION_KINDS as k}
          <button
            type="button"
            class={`kind-btn ${detail?.kind === k ? 'active' : ''}`}
            disabled={!detail || savingKind || detail.kind === k}
            onclick={() => changeKind(k)}
          >
            {k}
          </button>
        {/each}
      </div>
      {#if savingKind}<p class="status-line">Updating kind…</p>{/if}
    </Card>

    <Card padding="md" elevation="e1">
      <p class="eyebrow">Break Hints</p>
      <p class="muted small">Override the kind's default pagination behaviour.</p>

      <label class="hint-row">
        <span>Break before</span>
        <select bind:value={hintBreakBefore} disabled={!detail}>
          <option value="">(default)</option>
          <option value="auto">auto</option>
          <option value="page">page</option>
          <option value="avoid">avoid</option>
        </select>
      </label>

      <label class="hint-row">
        <span>Break after</span>
        <select bind:value={hintBreakAfter} disabled={!detail}>
          <option value="">(default)</option>
          <option value="auto">auto</option>
          <option value="page">page</option>
          <option value="avoid">avoid</option>
        </select>
      </label>

      <label class="hint-check">
        <input type="checkbox" bind:checked={hintKeepTogether} disabled={!detail} />
        <span>Keep together (no mid-section break)</span>
      </label>

      <label class="hint-check">
        <input type="checkbox" bind:checked={hintFullPage} disabled={!detail} />
        <span>Full page (section fills an entire page)</span>
      </label>

      <Button
        variant="primary"
        size="sm"
        onclick={saveBreakHints}
        disabled={!detail || savingHints}
      >
        {savingHints ? 'Saving…' : 'Save break hints'}
      </Button>
    </Card>

    <Card padding="md" elevation="e1">
      <p class="eyebrow">Deck Chrome</p>
      <p class="muted small">Running header/footer shown on every non-full-page section.</p>

      <label class="hint-row">
        <span>Running title</span>
        <input type="text" bind:value={chromeRunningTitle} placeholder="My Handbook" />
      </label>

      <label class="hint-row">
        <span>Footer align</span>
        <select bind:value={chromeFooterAlign}>
          <option value="left">left</option>
          <option value="center">center</option>
          <option value="right">right</option>
        </select>
      </label>

      <label class="hint-check">
        <input type="checkbox" bind:checked={chromePageNumber} />
        <span>Show page number</span>
      </label>

      <label class="hint-check">
        <input type="checkbox" bind:checked={chromeHide} />
        <span>Hide chrome entirely</span>
      </label>

      <Button
        variant="primary"
        size="sm"
        onclick={saveChromeConfig}
        disabled={savingChrome}
      >
        {savingChrome ? 'Saving…' : 'Save chrome config'}
      </Button>
    </Card>
  </aside>

  <!-- Overlay: Comment drawer (same as Editor.svelte) -->
  <CommentDrawer
    {bridge}
    deckId={deckRef}
    open={commentDrawerOpen}
    onClose={() => { commentDrawerOpen = false; }}
    onJump={handleCommentJump}
  />
</div>

<style>
  .doc-editor {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr) 300px;
    gap: var(--s-3);
    height: 100%;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }

  .error-bar {
    grid-column: 1 / -1;
    background: var(--error-tint);
    border: 1px solid var(--error);
    border-radius: var(--r-md);
    padding: var(--s-2) var(--s-4);
    font-size: 13px;
    color: var(--error);
  }

  /* ── Section rail ─────────────────────────────────────────── */
  .section-rail {
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    box-shadow: var(--e1);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
  }

  .rail-head {
    padding: var(--s-3) var(--s-4);
    border-bottom: 1px solid var(--border-hairline);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .eyebrow {
    margin: 0 0 var(--s-2);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 11px;
    color: var(--ink-3);
    font-weight: 500;
  }

  .rail-head .eyebrow {
    margin: 0;
  }

  .count {
    font-size: 11px;
    color: var(--ink-3);
    background: var(--surface-2);
    padding: 2px 8px;
    border-radius: var(--r-pill);
  }

  .rail-track {
    overflow-y: auto;
    padding: var(--s-2);
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
  }

  .section-row {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-md);
    border: 1px solid transparent;
    text-align: left;
    background: transparent;
    cursor: pointer;
    transition: background-color var(--dur-micro) var(--ease);
  }

  .section-row:hover {
    background: var(--surface-2);
  }

  .section-row.selected {
    background: var(--mint-tint);
    border-color: var(--mint);
  }

  .sec-pos {
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-3);
    width: 20px;
    text-align: right;
  }

  .sec-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .sec-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--ink-1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sec-kind {
    font-size: 10px;
    color: var(--ink-3);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .empty-rail,
  .loading-row {
    padding: var(--s-3) var(--s-4);
    font-size: 12px;
    color: var(--ink-3);
  }

  .loading-row {
    display: flex;
    align-items: center;
    gap: var(--s-2);
  }

  .spinner {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid var(--border-subtle);
    border-top-color: var(--mint);
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Main column ──────────────────────────────────────────── */
  .main-col {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    gap: var(--s-3);
    min-height: 0;
    min-width: 0;
    overflow: hidden;
  }

  :global(.doc-canvas-card) {
    display: grid !important;
    grid-template-rows: auto minmax(0, 1fr) !important;
    min-height: 0;
    overflow: hidden;
  }

  .canvas-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-5);
    border-bottom: 1px solid var(--border-hairline);
    flex-wrap: wrap;
  }

  .canvas-head-right {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    flex-wrap: wrap;
  }

  .canvas-stage {
    overflow: auto;
    background: var(--canvas);
    min-height: 0;
  }

  .canvas-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--s-3);
    height: 100%;
    min-height: 280px;
    color: var(--ink-3);
    font-size: 14px;
  }

  .section-frame {
    width: 100%;
    height: 100%;
    border: none;
    min-height: 480px;
    background: #fafafa;
    display: block;
  }

  /* ── Comment composer (doc) ───────────────────────────────── */
  :global(.doc-comment-card) {
    display: grid !important;
    grid-template-rows: auto auto !important;
    overflow: hidden;
  }

  .cc-head {
    padding: var(--s-3) var(--s-5) var(--s-2);
    border-bottom: 1px solid var(--border-hairline);
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

  .cc-textarea {
    font-size: 13px;
    font-family: var(--font-body);
    color: var(--ink-1);
    padding: var(--s-2) var(--s-3);
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-md);
    resize: vertical;
    width: 100%;
  }

  .cc-textarea:focus {
    outline: none;
    border-color: var(--mint);
  }

  .cc-actions {
    display: flex;
    justify-content: flex-end;
  }

  /* ── Inspector ────────────────────────────────────────────── */
  .inspector-pane {
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    overflow-y: auto;
    padding-right: var(--s-1);
    min-height: 0;
  }

  .kind-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-1);
    margin-top: var(--s-2);
  }

  .kind-btn {
    font-size: 11px;
    font-weight: 500;
    padding: 4px 8px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-sm);
    background: var(--surface-1);
    color: var(--ink-2);
    cursor: pointer;
    text-transform: capitalize;
  }

  .kind-btn:hover:not(:disabled):not(.active) {
    border-color: var(--mint);
    color: var(--mint-hover);
  }

  .kind-btn.active {
    background: var(--mint-tint);
    border-color: var(--mint);
    color: var(--mint-hover);
    cursor: default;
  }

  .kind-btn:disabled:not(.active) {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .hint-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
    margin-top: var(--s-2);
    font-size: 12px;
    color: var(--ink-2);
  }

  .hint-row select,
  .hint-row input[type='text'] {
    font-size: 12px;
    padding: 3px 8px;
    border-radius: var(--r-sm);
    border: 1px solid var(--border-subtle);
    background: var(--surface-1);
    min-width: 120px;
  }

  .hint-check {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    margin-top: var(--s-2);
    font-size: 12px;
    color: var(--ink-2);
  }

  .status-line {
    font-size: 11px;
    color: var(--ink-3);
    margin-top: var(--s-2);
  }

  .muted {
    color: var(--ink-3);
  }

  .muted.small {
    font-size: 11px;
    line-height: 1.4;
    margin: var(--s-1) 0 var(--s-2);
  }

  h2 {
    font-size: 16px;
    font-weight: 600;
    color: var(--ink-1);
    margin: 0;
  }

  /* ── Responsive ───────────────────────────────────────────── */
  @media (max-width: 1200px) {
    .doc-editor {
      grid-template-columns: 220px minmax(0, 1fr) 280px;
    }
  }

  @media (max-width: 960px) {
    .doc-editor {
      grid-template-columns: 200px minmax(0, 1fr);
    }
    .inspector-pane {
      display: none;
    }
  }
</style>
