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
  import AssetPicker from '../lib/AssetPicker.svelte';
  import ChartSpecPicker from '../lib/ChartSpecPicker.svelte';
  import NodeTypePicker from '../lib/NodeTypePicker.svelte';
  import {
    CATALOGUE,
    availableForParent,
    defaultNodePayload,
    kindOfNode,
    morphTargetsFor,
    morphTo,
    type LeafNodeKind,
    type NodeKind,
  } from '../lib/nodeCatalogue';
  import BlockActionBar from '../lib/BlockActionBar.svelte';
  import { Button, Card, Pill } from '../lib/primitives/index';
  import type {
    McpDeckEditorBridge,
    CommentTarget,
    SectionListItem,
    SectionDetail,
    DesignSoul,
  } from '../lib/bridge';
  import { STRUCTURE_BRIDGE_SCRIPT } from '../lib/structureBridge';
  import { decodeIrPath, isPathInside } from '../lib/irPath';
  import { parseRichTextFromHtml } from '../lib/parseRichText';

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

  // v4.9 edit-layout mode for sections: clicking a block in the
  // section iframe selects it; a parent-DOM action bar (BlockActionBar)
  // appears under the canvas with the actions targeting the selected
  // block. Wired to the `*_section_node` MCP tools.
  let structureMode = $state(false);
  let structureStatus = $state('');
  let structureStatusTimer: ReturnType<typeof setTimeout> | null = null;
  let sectionFrameEl = $state<HTMLIFrameElement | null>(null);
  let selectedIrPath = $state<string | null>(null);
  let selectedPreview = $state<string>('');
  let selectedSiblingIndex = $state<number>(-1);
  let selectedSiblingCount = $state<number>(0);
  // True when the selected block has at least one rich-text field
  // descendant — drives canChangeType for the action bar.
  let selectedMorphable = $state<boolean>(false);
  // v4.10: pin-on-block for sections. Mirrors the slide-editor flow —
  // the user toggles pin mode on the section toolbar, clicks a block
  // in the canvas, and submits a comment that targets the specific
  // ir_node instead of the section as a whole.
  let pinMode = $state(false);
  let pinnedIrPath = $state<string | null>(null);
  let pinnedPreview = $state<string>('');
  // String-encoded ir_paths of unresolved ir_node comments on the
  // currently-selected section. Drives the dashed mint outline on
  // pinned blocks via the shared structureBridge CSS.
  let commentedIrPaths = $state<string[]>([]);

  function setStructureStatus(text: string): void {
    structureStatus = text;
    if (structureStatusTimer) clearTimeout(structureStatusTimer);
    if (text) {
      structureStatusTimer = setTimeout(() => {
        structureStatus = '';
        structureStatusTimer = null;
      }, 3500);
    }
  }
  /** No-auto-dismiss variant for in-flight messages like "Loading…". */
  function setStructureStatusSticky(text: string): void {
    structureStatus = text;
    if (structureStatusTimer) {
      clearTimeout(structureStatusTimer);
      structureStatusTimer = null;
    }
  }
  function clearStructureStatus(): void {
    structureStatus = '';
    if (structureStatusTimer) {
      clearTimeout(structureStatusTimer);
      structureStatusTimer = null;
    }
  }

  // Image picker for sections — same component used in the slide editor.
  interface PickerAsset {
    asset_id: string;
    label?: string;
    name?: string;
    filename?: string;
    mime_type: string;
    role: string;
    data_base64?: string;
  }
  let assetPickerOpen = $state(false);
  let assetPickerTargetPath = $state<ReadonlyArray<string | number> | null>(null);
  let assetPickerTargetIndex = $state(0);

  function openAssetPicker(parentPath: ReadonlyArray<string | number>, position: number): void {
    assetPickerTargetPath = parentPath;
    assetPickerTargetIndex = position;
    assetPickerOpen = true;
  }
  function closeAssetPicker(): void {
    assetPickerOpen = false;
    assetPickerTargetPath = null;
  }

  // ── Chart picker (v4.12) ────────────────────────────────────────
  let chartPickerOpen = $state(false);
  let chartPickerTargetPath = $state<ReadonlyArray<string | number> | null>(null);
  let chartPickerTargetIndex = $state(0);

  function openChartPicker(parentPath: ReadonlyArray<string | number>, position: number): void {
    chartPickerTargetPath = parentPath;
    chartPickerTargetIndex = position;
    chartPickerOpen = true;
  }

  function closeChartPicker(): void {
    chartPickerOpen = false;
    chartPickerTargetPath = null;
  }

  async function handleChartPick(payload: Record<string, unknown>): Promise<void> {
    const path = chartPickerTargetPath;
    const pos = chartPickerTargetIndex;
    chartPickerOpen = false;
    chartPickerTargetPath = null;
    if (!path || !selectedId) return;
    try {
      await bridge.insertSectionNode({
        deck_id: deckRef,
        section_id: selectedId,
        parent_path: path,
        position: pos,
        new_node: payload,
      });
      setStructureStatus('Chart added.');
      selectedIrPath = [...path, pos].join(',');
    } catch (err) {
      setStructureStatus(err instanceof Error ? err.message : String(err));
    }
  }
  async function handleAssetPick(a: PickerAsset): Promise<void> {
    const path = assetPickerTargetPath;
    const pos = assetPickerTargetIndex;
    assetPickerOpen = false;
    assetPickerTargetPath = null;
    if (!path || !selectedId) return;
    try {
      await bridge.insertSectionNode({
        deck_id: deckRef,
        section_id: selectedId,
        parent_path: path,
        position: pos,
        new_node: {
          type: 'image',
          asset_id: a.asset_id,
          ...(a.label ? { alt: a.label } : {}),
        },
      });
      setStructureStatus('Image added.');
      // Parity with non-image inserts: select the new block so the
      // user can immediately move / delete / change it.
      selectedIrPath = [...path, pos].join(',');
    } catch (err) {
      setStructureStatus(err instanceof Error ? err.message : String(err));
    }
  }

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

    // Refresh the rail when the agent mutates sections via the MCP tools
    // (add_section / update_section / promote_section_root / wrap_section_root /
    // remove_section / reorder_sections). Without this the list is frozen
    // at whatever it looked like on mount. Heuristic: every section-
    // mutating tool returns `section_id` or `section_count` in its
    // structuredContent.
    const dispose = bridge.onToolResult((result) => {
      const payload = result.structuredContent as
        | { section_id?: unknown; section_count?: unknown }
        | undefined;
      if (!payload || typeof payload !== 'object') return;
      const touchedSection = typeof payload.section_id === 'string';
      const touchedCount = typeof payload.section_count === 'number';
      if (!touchedSection && !touchedCount) return;

      void loadSections();
      // If the currently-selected section was mutated (or may have been),
      // re-fetch its detail so the preview/inspector reflect the new
      // stored HTML/kind/metadata.
      if (touchedSection && selectedId && payload.section_id === selectedId) {
        void selectSection(selectedId);
      } else if (touchedCount && selectedId) {
        // Remove/reorder: selected section may still exist but index-wise
        // could have shifted. Re-fetch to stay in sync.
        void selectSection(selectedId);
      }
    });
    return dispose;
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

  // ── Comments (on sections — v4.10 supports per-block pinning) ──────────
  function togglePinMode(): void {
    pinMode = !pinMode;
    // Mutually exclusive with edit-layout — the iframe affordances
    // (cursor: crosshair vs cursor: grab) are driven from the same
    // dataset flags and would conflict if both were on.
    if (pinMode) {
      structureMode = false;
      selectedIrPath = null;
      selectedPreview = '';
    } else {
      pinnedIrPath = null;
      pinnedPreview = '';
    }
  }

  function handlePinTarget(detail: { irPath: string; preview?: string }): void {
    pinnedIrPath = detail.irPath;
    pinnedPreview = detail.preview?.trim() ?? '';
    pinMode = false;
  }

  async function submitComment(): Promise<void> {
    if (!detail || !commentDraft.trim()) return;
    commentPending = true;
    try {
      const sectionId = detail.id;
      const target: CommentTarget = pinnedIrPath
        ? {
            kind: 'ir_node',
            container_id: sectionId,
            ir_path: decodeIrPath(pinnedIrPath),
            ...(pinnedPreview ? { preview: pinnedPreview } : {}),
          }
        : { kind: 'section', section_id: sectionId };
      await bridge.addCommentFromApp({
        deck_id: deckRef,
        target,
        kind: commentKind,
        body: commentDraft.trim(),
      });
      commentDraft = '';
      pinnedIrPath = null;
      pinnedPreview = '';
      commentDrawerOpen = true;
      await refreshCommentedIrPaths();
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
    } else if (target.kind === 'ir_node') {
      // ir_node comments live on a specific section; navigate to it
      // and let the bridge paint the outline once the iframe loads.
      void selectSection(target.container_id);
      commentDrawerOpen = false;
    }
  }

  /** Refresh the dashed mint outline set for ir_node comments on the
   *  currently-selected section. Mirrors Editor.svelte's flow. */
  async function refreshCommentedIrPaths(): Promise<void> {
    if (!detail) {
      commentedIrPaths = [];
      return;
    }
    try {
      const result = await bridge.listComments(deckRef, {
        resolved: 'unresolved',
        target_kind: 'ir_node',
      });
      const sectionId = detail.id;
      commentedIrPaths = result.comments
        .filter(
          (c) => c.target.kind === 'ir_node' && c.target.container_id === sectionId,
        )
        .map((c) =>
          (c.target as { ir_path: ReadonlyArray<string | number> }).ir_path.join(','),
        );
    } catch {
      commentedIrPaths = [];
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
    </head><body>${html}${STRUCTURE_BRIDGE_SCRIPT}</body></html>`;
  }

  // ── Edit-layout iframe wiring ──────────────────────────────────────
  // Sync the parent's mode flags into the iframe's documentElement
  // dataset on every change, and route the bridge's select-block /
  // structure-reorder / rt-field-commit / selection-info postMessages
  // to the matching `*_section_node` MCP tools and local state.

  function syncStructureModeToFrame(): void {
    const doc = sectionFrameEl?.contentDocument;
    if (!doc) return;
    try {
      doc.documentElement.dataset.penguiStructureMode = String(structureMode);
      // v4.10: pin-mode dataset drives the bridge's cursor:crosshair
      // affordance + the click handler that emits `pintarget`.
      doc.documentElement.dataset.penguiPinMode = String(pinMode);
      // Doc-mode supports image insertion the same way as slide-mode —
      // the AssetPicker is wired below.
      doc.documentElement.dataset.penguiAllowImageInsert = 'true';
      // The section iframe is rendered at native size (no parent CSS
      // scaling), so the bridge's inverse-scale is a no-op. Set the
      // variable explicitly so the bridge has a consistent default.
      doc.documentElement.style.setProperty('--pengui-frame-scale', '1');
    } catch {
      // ignore cross-frame access errors
    }
  }

  /**
   * v4.10: paint dashed mint outlines on every block carrying an
   * unresolved ir_node comment, plus a heavier outline on the in-flight
   * draft pin. Mirrors the slide-editor's applyPinDecorations.
   */
  function applyPinDecorations(): void {
    const doc = sectionFrameEl?.contentDocument;
    if (!doc) return;
    const pinnable = doc.querySelectorAll<HTMLElement>('[data-ir-path]');
    const pinnedSet = new Set(commentedIrPaths);
    pinnable.forEach((el) => {
      const irPath = el.dataset.irPath ?? '';
      const isPinned = irPath ? pinnedSet.has(irPath) : false;
      const isDraft = !!pinnedIrPath && irPath === pinnedIrPath;
      if (isDraft) {
        el.style.outline = '2px solid rgba(47, 184, 166, 0.95)';
        el.style.outlineOffset = '3px';
        el.style.backgroundColor = 'rgba(47, 184, 166, 0.12)';
      } else if (pinMode) {
        // The bridge handles the per-block hover outline + crosshair
        // cursor in pin-mode; the parent only annotates persistent
        // pinned blocks here.
        el.style.outline = isPinned ? '1px dashed rgba(47, 184, 166, 0.55)' : '';
        el.style.outlineOffset = isPinned ? '2px' : '';
        el.style.backgroundColor = '';
      } else {
        el.style.outline = isPinned ? '1px dashed rgba(47, 184, 166, 0.55)' : '';
        el.style.outlineOffset = isPinned ? '2px' : '';
        el.style.backgroundColor = '';
      }
    });
  }

  $effect(() => {
    void structureMode;
    void pinMode;
    void detail;
    syncStructureModeToFrame();
  });

  // Paint pin decorations whenever the set of pinned paths changes,
  // the user starts/stops drafting a new pin, or the section detail
  // re-renders (revisionHash bump after a structural op).
  $effect(() => {
    void commentedIrPaths;
    void pinnedIrPath;
    void pinMode;
    void detail;
    applyPinDecorations();
  });

  // Refresh pinned paths whenever the selected section or its content
  // changes — structural ops bump revisionHash and may have rewritten
  // ir_paths via the server-side migrator.
  $effect(() => {
    if (detail) {
      void detail.id;
      void detail.html;
      void refreshCommentedIrPaths();
    }
  });

  type SectionAction =
    | 'delete'
    | 'duplicate'
    | 'move_up'
    | 'move_down';

  async function runBlockAction(action: SectionAction): Promise<void> {
    if (!detail || !selectedId || !selectedIrPath) return;
    const path = decodeIrPath(selectedIrPath);
    if (path.length < 2) return;
    const parentPath = path.slice(0, -1);
    const lastSeg = path[path.length - 1];
    if (typeof lastSeg !== 'number') return;

    setStructureStatus('');
    try {
      switch (action) {
        case 'delete':
          await bridge.removeSectionNode({
            deck_id: deckRef,
            section_id: selectedId,
            path,
          });
          setStructureStatus('Deleted.');
          selectedIrPath = null;
          selectedPreview = '';
          break;
        case 'duplicate':
          await bridge.duplicateSectionNode({
            deck_id: deckRef,
            section_id: selectedId,
            path,
          });
          setStructureStatus('Duplicated.');
          break;
        case 'move_up':
          if (lastSeg === 0) {
            setStructureStatus('Already at the top.');
            return;
          }
          await bridge.moveSectionNode({
            deck_id: deckRef,
            section_id: selectedId,
            from_path: path,
            to_parent_path: parentPath,
            to_position: lastSeg - 1,
          });
          setStructureStatus('Moved up.');
          selectedIrPath = [...parentPath, lastSeg - 1].join(',');
          break;
        case 'move_down':
          // `to_position` is interpreted PRE-removal in moveNodeAtPath:
          // same-container forward moves decrement by 1 internally to
          // honor "drop after the sibling currently at slot N" semantics.
          // To skip past the immediate-next sibling we need lastSeg+2,
          // not lastSeg+1 (which would land back at lastSeg — a no-op).
          await bridge.moveSectionNode({
            deck_id: deckRef,
            section_id: selectedId,
            from_path: path,
            to_parent_path: parentPath,
            to_position: lastSeg + 2,
          });
          setStructureStatus('Moved down.');
          selectedIrPath = [...parentPath, lastSeg + 1].join(',');
          break;
      }
    } catch (err) {
      setStructureStatus(err instanceof Error ? err.message : String(err));
    }
  }

  // ── v4.9e: + Block ▾ insert + Change ▾ morph ──────────────────────
  let insertPickerOpen = $state(false);
  // v4.11 Track B: see Editor.svelte for rationale.
  let insertAvailableKinds = $state<ReadonlyArray<NodeKind>>([]);
  let morphPickerOpen = $state(false);
  let morphTargets = $state<ReadonlyArray<LeafNodeKind>>([]);
  let morphSourceNode = $state<Record<string, unknown> | null>(null);
  // Pinned path-at-open-time — see Editor.svelte for rationale.
  let morphSourcePath = $state<ReadonlyArray<string | number> | null>(null);

  function openInsertPicker(): void {
    if (!selectedIrPath) return;
    const path = decodeIrPath(selectedIrPath);
    const parentPath = path.length >= 2 ? path.slice(0, -1) : [];
    insertAvailableKinds = availableForParent(parentPath).map((e) => e.kind);
    insertPickerOpen = true;
  }
  function closeInsertPicker(): void {
    insertPickerOpen = false;
  }

  async function handleInsertPick(kind: NodeKind): Promise<void> {
    if (!detail || !selectedId || !selectedIrPath) {
      insertPickerOpen = false;
      return;
    }
    const path = decodeIrPath(selectedIrPath);
    if (path.length < 2) {
      insertPickerOpen = false;
      return;
    }
    const parentPath = path.slice(0, -1);
    const lastSeg = path[path.length - 1];
    if (typeof lastSeg !== 'number') {
      insertPickerOpen = false;
      return;
    }
    const insertIndex = lastSeg + 1;
    insertPickerOpen = false;

    if (kind === 'image') {
      openAssetPicker(parentPath, insertIndex);
      return;
    }

    if (kind === 'chart') {
      openChartPicker(parentPath, insertIndex);
      return;
    }

    const payload = defaultNodePayload(kind);
    if (!payload) {
      setStructureStatus("Couldn't compose that block.");
      return;
    }
    setStructureStatus('');
    try {
      await bridge.insertSectionNode({
        deck_id: deckRef,
        section_id: selectedId,
        parent_path: parentPath,
        position: insertIndex,
        new_node: payload,
      });
      setStructureStatus(`${humanLabel(kind)} added.`);
      selectedIrPath = [...parentPath, insertIndex].join(',');
    } catch (err) {
      setStructureStatus(err instanceof Error ? err.message : String(err));
    }
  }

  async function openMorphPicker(): Promise<void> {
    if (!detail || !selectedId || !selectedIrPath) return;
    const path = decodeIrPath(selectedIrPath);
    if (path.length < 2) return;
    // Snapshot the path so a mid-fetch reselection can't make us
    // read one block's IR and morph another's.
    const requestedIrPath = selectedIrPath;
    setStructureStatusSticky('Loading…');
    try {
      const response = await bridge.getSection(selectedId);
      if (selectedIrPath !== requestedIrPath) {
        // User selected a different block while we were fetching.
        // Bail silently — they didn't ask for THIS morph anymore.
        clearStructureStatus();
        return;
      }
      const ir = response.section.ir as Record<string, unknown> | undefined;
      const node = ir ? walkIrPath(ir, path) : null;
      if (!node || typeof node !== 'object') {
        setStructureStatus("Couldn't read this block — try reselecting.");
        return;
      }
      const sourceKind = kindOfNode(node);
      if (!sourceKind) {
        setStructureStatus("This block can't be changed to a different type.");
        return;
      }
      morphSourceNode = node;
      morphSourcePath = path;
      morphTargets = morphTargetsFor(sourceKind);
      morphPickerOpen = true;
      clearStructureStatus();
    } catch (err) {
      setStructureStatus(err instanceof Error ? err.message : String(err));
    }
  }

  function closeMorphPicker(): void {
    morphPickerOpen = false;
    morphSourceNode = null;
    morphSourcePath = null;
    morphTargets = [];
  }

  async function handleMorphPick(target: LeafNodeKind): Promise<void> {
    if (!detail || !selectedId || !morphSourceNode || !morphSourcePath) {
      closeMorphPicker();
      return;
    }
    const path = morphSourcePath;
    const result = morphTo(morphSourceNode, target);
    closeMorphPicker();
    if (!result) {
      setStructureStatus("Couldn't change this block.");
      return;
    }
    try {
      await bridge.applySectionNodeEdit({
        deck_id: deckRef,
        section_id: selectedId,
        ir_path: path,
        new_node: result.newNode,
      });
      const dropped = result.droppedFields;
      if (dropped.length > 0) {
        setStructureStatus(
          `Changed to ${humanLabel(target)}. ${capitalize(dropped.join(', '))} dropped.`,
        );
      } else {
        setStructureStatus(`Changed to ${humanLabel(target)}.`);
      }
    } catch (err) {
      setStructureStatus(err instanceof Error ? err.message : String(err));
    }
  }

  function humanLabel(kind: NodeKind): string {
    // v4.11: drive labels off the catalogue so adding new entries
    // doesn't require touching humanLabel.
    return CATALOGUE.find((e) => e.kind === kind)?.label ?? kind;
  }
  function capitalize(s: string): string {
    return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
  }
  function walkIrPath(root: unknown, path: ReadonlyArray<string | number>): unknown {
    let cur: unknown = root;
    for (const seg of path) {
      if (cur == null) return null;
      cur = (cur as Record<string | number, unknown>)[seg];
    }
    return cur;
  }

  function deselectBlock(): void {
    selectedIrPath = null;
    selectedPreview = '';
    selectedSiblingIndex = -1;
    selectedSiblingCount = 0;
    selectedMorphable = false;
  }

  function toggleStructureMode(): void {
    structureMode = !structureMode;
    setStructureStatus('');
    if (structureMode) {
      // Mutually exclusive with pin mode.
      pinMode = false;
      pinnedIrPath = null;
      pinnedPreview = '';
    } else {
      selectedIrPath = null;
      selectedPreview = '';
      selectedSiblingIndex = -1;
      selectedSiblingCount = 0;
      selectedMorphable = false;
    }
  }

  // Sync selectedIrPath into the section iframe so the bridge paints
  // the persistent selection outline.
  $effect(() => {
    void selectedIrPath;
    void detail;
    const doc = sectionFrameEl?.contentDocument;
    if (!doc) return;
    try {
      if (selectedIrPath) {
        doc.documentElement.dataset.penguiSelectedPath = selectedIrPath;
      } else {
        delete doc.documentElement.dataset.penguiSelectedPath;
      }
    } catch {
      /* ignore cross-frame access */
    }
  });

  // Rich-text field commit on doc-mode sections: routes through the new
  // `apply_section_field_edit` tool, so every rich-text field on a
  // section IR is editable inline (prose body, hero title/subtitle,
  // heading text, list items, callout body, etc.).
  async function handleSectionRichTextCommit(
    irPath: string,
    field: string,
    body: ReadonlyArray<Record<string, unknown>>,
  ): Promise<void> {
    if (!selectedId) return;
    const path = decodeIrPath(irPath);
    if (path.length < 2) return;
    const safeBody = body.length > 0 ? body : [{ text: '' }];
    try {
      await bridge.callTool('apply_section_field_edit', {
        deck_id: deckRef,
        section_id: selectedId,
        path,
        field,
        value: safeBody,
      });
    } catch (err) {
      setStructureStatus(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSectionStructureReorder(
    srcIrPath: string,
    destIrPath: string,
    position: 'above' | 'below',
  ): Promise<void> {
    if (!detail || !selectedId) return;
    const src = decodeIrPath(srcIrPath);
    const dest = decodeIrPath(destIrPath);
    if (src.length < 2 || dest.length < 2) return;
    if (isPathInside(dest, src)) {
      setStructureStatus("Can't drop a block onto itself.");
      return;
    }
    const destParent = dest.slice(0, -1);
    const destLast = dest[dest.length - 1];
    if (typeof destLast !== 'number') return;
    const toPosition = position === 'above' ? destLast : destLast + 1;

    // No-op detection: same parent + landing on the source's current
    // slot would do nothing. Surface a hint instead of looking broken.
    const srcParent = src.slice(0, -1);
    const srcLast = src[src.length - 1];
    const sameParent =
      srcParent.length === destParent.length &&
      srcParent.every((seg, i) => seg === destParent[i]);
    if (sameParent && typeof srcLast === 'number') {
      const landing = toPosition > srcLast ? toPosition - 1 : toPosition;
      if (landing === srcLast) {
        setStructureStatus(
          'Already in that slot — drop in the lower half to move down.'
        );
        return;
      }
    }

    setStructureStatus('');
    try {
      await bridge.moveSectionNode({
        deck_id: deckRef,
        section_id: selectedId,
        from_path: src,
        to_parent_path: destParent,
        to_position: toPosition,
      });
      setStructureStatus('Moved.');
    } catch (err) {
      setStructureStatus(err instanceof Error ? err.message : String(err));
    }
  }

  onMount(() => {
    function onMessage(event: MessageEvent): void {
      const data = event.data as {
        source?: string;
        type?: string;
        irPath?: string | null;
        preview?: string;
        srcIrPath?: string;
        destIrPath?: string;
        position?: string;
        field?: string;
        html?: string;
        siblingIndex?: number;
        siblingCount?: number;
        morphable?: boolean;
      } | null;
      if (!data || data.source !== 'pengui-slide') return;
      if (sectionFrameEl && event.source !== sectionFrameEl.contentWindow) return;

      if (data.type === 'pintarget' && typeof data.irPath === 'string') {
        handlePinTarget({ irPath: data.irPath, preview: data.preview ?? '' });
        return;
      }

      if (data.type === 'structure-reorder') {
        if (typeof data.srcIrPath === 'string' && typeof data.destIrPath === 'string') {
          const pos: 'above' | 'below' = data.position === 'above' ? 'above' : 'below';
          void handleSectionStructureReorder(data.srcIrPath, data.destIrPath, pos);
        }
        return;
      }

      if (data.type === 'select-block') {
        selectedIrPath = typeof data.irPath === 'string' ? data.irPath : null;
        selectedPreview = typeof data.preview === 'string' ? data.preview : '';
        selectedSiblingIndex =
          typeof data.siblingIndex === 'number' ? data.siblingIndex : -1;
        selectedSiblingCount =
          typeof data.siblingCount === 'number' ? data.siblingCount : 0;
        selectedMorphable =
          typeof data.morphable === 'boolean' ? data.morphable : false;
        return;
      }

      // Bridge re-emits sibling-info every time it (re)applies the
      // selection outline. Refresh the action-bar's edge state
      // without clobbering the previously-clicked preview.
      if (data.type === 'selection-info') {
        if (typeof data.irPath === 'string') selectedIrPath = data.irPath;
        if (typeof data.siblingIndex === 'number') selectedSiblingIndex = data.siblingIndex;
        if (typeof data.siblingCount === 'number') selectedSiblingCount = data.siblingCount;
        if (typeof data.morphable === 'boolean') selectedMorphable = data.morphable;
        return;
      }

      if (data.type === 'rt-field-commit') {
        // The bridge sends raw `html` (the contentEditable's
        // innerHTML on blur). We parse it to TextRun[] here, mirroring
        // SlideCanvas's handling. Pre-fix the section variant was
        // reading data.body — silently dropping every section RT
        // edit because the bridge never sets that field.
        if (
          typeof data.irPath === 'string' &&
          typeof data.field === 'string' &&
          typeof data.html === 'string'
        ) {
          const body = parseRichTextFromHtml(data.html);
          void handleSectionRichTextCommit(
            data.irPath,
            data.field,
            body as ReadonlyArray<Record<string, unknown>>,
          );
        }
        return;
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  });
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
            <Button
              variant={pinMode ? 'primary' : 'ghost'}
              size="sm"
              onclick={togglePinMode}
              title={pinMode
                ? 'Click a block in the section to pin a comment to it.'
                : 'Pin a comment to a specific block in this section.'}
            >
              {pinMode ? 'Pinning…' : 'Pin to a block'}
            </Button>
            <Button
              variant={structureMode ? 'primary' : 'ghost'}
              size="sm"
              onclick={toggleStructureMode}
              title={structureMode
                ? 'Exit edit-layout mode and return to text editing.'
                : 'Rearrange, add, or delete blocks in this section.'}
            >
              {structureMode ? 'Done' : 'Edit layout'}
            </Button>
            {#if structureStatus}
              <span class="structure-status">{structureStatus}</span>
            {/if}
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
            bind:this={sectionFrameEl}
            class="section-frame"
            title="Section preview"
            srcdoc={previewSrcDoc}
            sandbox="allow-same-origin allow-scripts"
            onload={() => syncStructureModeToFrame()}
          ></iframe>
        {/if}
      </div>

      {#if detail && structureMode}
        <BlockActionBar
          selectedIrPath={selectedIrPath}
          selectedPreview={selectedPreview}
          canMoveUp={selectedSiblingIndex > 0}
          canMoveDown={
            selectedSiblingIndex >= 0 &&
            selectedSiblingCount > 0 &&
            selectedSiblingIndex < selectedSiblingCount - 1
          }
          canChangeType={selectedMorphable}
          onMoveUp={() => runBlockAction('move_up')}
          onMoveDown={() => runBlockAction('move_down')}
          onDuplicate={() => runBlockAction('duplicate')}
          onInsertBlock={openInsertPicker}
          onChangeType={() => void openMorphPicker()}
          onDelete={() => runBlockAction('delete')}
          onDeselect={deselectBlock}
        />
      {/if}

      {#if detail}
        <p class="canvas-tip" role="note">
          {#if structureMode}
            {#if selectedIrPath}
              Use the action bar above. Or drag a block to reorder — a mint line
              shows where it will land.
            {:else}
              Click any block to select it. The action bar appears below.
            {/if}
          {:else}
            Tip: click any text to edit it. Select text to format.
            Use <strong>Edit layout</strong> to reorder, add or delete blocks.
          {/if}
        </p>
      {/if}
    </Card>

    <!-- Comment composer (section-scoped by default; per-block when a pin is set) -->
    {#if detail}
      <Card padding="none" elevation="e1" class="doc-comment-card">
        <div class="cc-head">
          <p class="eyebrow">
            {pinnedIrPath ? 'Pin a Comment on this Block' : 'Pin a Comment on this Section'}
          </p>
        </div>
        <div class="cc-body">
          {#if pinnedIrPath}
            <div class="cc-pin-row">
              <span class="cc-pin-chip" title={pinnedPreview ? `${pinnedIrPath} — ${pinnedPreview}` : pinnedIrPath}>
                <span class="cc-pin-dot" aria-hidden="true">●</span>
                <span class="cc-pin-label">{pinnedPreview || pinnedIrPath}</span>
              </span>
              <button
                type="button"
                class="cc-pin-clear"
                onclick={() => { pinnedIrPath = null; pinnedPreview = ''; }}
                title="Clear pin and comment on the whole section instead"
              >Clear</button>
            </div>
          {/if}
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
            placeholder={pinnedIrPath
              ? `Note something for the agent — pinned to this block (${pinnedPreview ? `"${pinnedPreview}"` : pinnedIrPath}).`
              : `Note something for the agent — pinned to this section (kind: ${detail.kind}).`}
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

  <!-- Image picker (opened by Edit-layout → Add image) -->
  <AssetPicker
    {bridge}
    open={assetPickerOpen}
    onPick={handleAssetPick}
    onClose={closeAssetPicker}
  />

  <!-- v4.12 chart sub-flow (opened from + Block ▾ → Chart) -->
  <ChartSpecPicker
    open={chartPickerOpen}
    onPick={(payload) => void handleChartPick(payload)}
    onClose={closeChartPicker}
  />

  <!-- v4.9e: + Block ▾ and Change ▾ pickers -->
  <NodeTypePicker
    open={insertPickerOpen}
    title="Insert a block"
    availableKinds={insertAvailableKinds}
    onPick={(kind) => void handleInsertPick(kind)}
    onClose={closeInsertPicker}
  />
  <NodeTypePicker
    open={morphPickerOpen}
    title="Change to…"
    availableKinds={morphTargets}
    onPick={(kind) => void handleMorphPick(kind)}
    onClose={closeMorphPicker}
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

  .canvas-tip {
    margin: 0;
    padding: var(--s-2) var(--s-4) var(--s-3);
    color: var(--ink-3);
    font-size: 12px;
    line-height: 1.5;
    border-top: 1px solid var(--border-hairline);
  }

  .canvas-tip strong {
    color: var(--ink-2);
    font-weight: 600;
  }

  .structure-status {
    font-size: 11px;
    color: var(--ink-3);
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

  .cc-pin-row {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: 4px 6px;
    background: var(--mint-tint);
    border: 1px solid var(--mint);
    border-radius: var(--r-md);
  }

  .cc-pin-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--mint-hover);
    overflow: hidden;
    flex: 1;
  }

  .cc-pin-dot {
    color: var(--mint);
    font-size: 10px;
    line-height: 1;
  }

  .cc-pin-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cc-pin-clear {
    all: unset;
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    color: var(--ink-3);
    padding: 2px 8px;
    border-radius: var(--r-pill);
    border: 1px solid var(--border-subtle);
    background: var(--surface-1);
  }
  .cc-pin-clear:hover { color: var(--ink-1); border-color: var(--mint); }

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
