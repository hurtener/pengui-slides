<!--
  Editor route — format-aware slide canvas + thumbnail rail + revision composer.

  For slides_16_9: landscape canvas with thumbnail rail on the left.
  For print_* formats: portrait canvas + vertical multi-page preview below.
-->
<script lang="ts">
  import SlideCanvas from '../lib/SlideCanvas.svelte';
  import IssueList from '../lib/IssueList.svelte';
  import FormatBadge from '../lib/FormatBadge.svelte';
  import CommentDrawer from '../lib/CommentDrawer.svelte';
  import AssetPicker from '../lib/AssetPicker.svelte';
  import BlockActionBar from '../lib/BlockActionBar.svelte';
  import NodeTypePicker from '../lib/NodeTypePicker.svelte';
  import {
    defaultNodePayload,
    kindOfNode,
    morphTargetsFor,
    morphTo,
    type LeafNodeKind,
  } from '../lib/nodeCatalogue';
  import { Button, Card, Pill, Tabs, Textarea } from '../lib/primitives/index';
  import { decodeIrPath, isPathInside } from '../lib/irPath';
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

  // ── Comment drawer state (v4.8.5) ────────────────────────────────────────
  let commentDrawerOpen = $state(false);
  let commentDraft = $state('');
  let commentKind = $state<'revision' | 'question' | 'approval' | 'note'>('note');
  let commentStatus = $state('');
  let commentPending = $state(false);
  // Pin-mode: capture the clicked node's `data-ir-path` (the structural
  // pointer the IR compiler emits on every node root). Falls back to the
  // whole slide when null. The agent receives the same `ir_path` array
  // back via `list_comments` and feeds it straight into
  // `apply_slide_node_edit` to patch the targeted node.
  let pinMode = $state(false);
  let pinnedIrPath = $state<string | null>(null);
  let pinnedPreview = $state<string>('');
  // v4.9 edit-layout mode: clicking a block in the canvas selects it;
  // a parent-DOM action bar (BlockActionBar) appears under the canvas
  // with move / duplicate / add / delete buttons targeting the
  // selected block. Mutually exclusive with pin mode.
  let structureMode = $state(false);
  let structureStatus = $state('');
  let structureStatusTimer: ReturnType<typeof setTimeout> | null = null;
  let selectedIrPath = $state<string | null>(null);
  let selectedPreview = $state<string>('');
  let selectedSiblingIndex = $state<number>(-1);
  let selectedSiblingCount = $state<number>(0);

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

  // Asset picker (modal): opens when the user clicks "Add image" on
  // the edit-layout toolbar. The picker remembers where to insert and
  // closes on choice or Escape.
  interface PickerAsset {
    asset_id: string;
    label?: string;
    name?: string;
    filename?: string;
    mime_type: string;
    role: string;
    width?: number;
    height?: number;
    data_base64?: string;
  }
  let assetPickerOpen = $state(false);
  let assetPickerTargetPath = $state<ReadonlyArray<string | number> | null>(null);
  let assetPickerTargetIndex = $state(0);

  function openAssetPicker(parentPath: ReadonlyArray<string | number>, position: number): void {
    if (!bridge) {
      setStructureStatus('The image picker is only available inside the MCP App.');
      return;
    }
    assetPickerTargetPath = parentPath;
    assetPickerTargetIndex = position;
    assetPickerOpen = true;
  }

  async function handleAssetPick(a: PickerAsset): Promise<void> {
    const path = assetPickerTargetPath;
    const pos = assetPickerTargetIndex;
    assetPickerOpen = false;
    assetPickerTargetPath = null;
    if (!path) return;
    try {
      await deck.insertSlideNode(path, pos, {
        type: 'image',
        asset_id: a.asset_id,
        ...(a.label ? { alt: a.label } : {}),
      });
      setStructureStatus('Image added.');
    } catch (err) {
      setStructureStatus(err instanceof Error ? err.message : String(err));
    }
  }

  function closeAssetPicker(): void {
    assetPickerOpen = false;
    assetPickerTargetPath = null;
  }
  // Stringified IR paths of elements that already have (unresolved)
  // comments — drives the dashed mint outline decoration on the canvas.
  let commentedIrPaths = $state<string[]>([]);

  function toggleCommentDrawer(): void {
    commentDrawerOpen = !commentDrawerOpen;
  }

  function togglePinMode(): void {
    pinMode = !pinMode;
    if (pinMode) structureMode = false;
    if (!pinMode) {
      pinnedIrPath = null;
      pinnedPreview = '';
    }
  }

  function toggleStructureMode(): void {
    structureMode = !structureMode;
    setStructureStatus('');
    if (structureMode) {
      pinMode = false;
      pinnedIrPath = null;
      pinnedPreview = '';
    } else {
      selectedIrPath = null;
      selectedPreview = '';
    }
  }

  function handleSelectBlock(detail: {
    irPath: string | null;
    preview?: string;
    siblingIndex?: number;
    siblingCount?: number;
  }): void {
    selectedIrPath = detail.irPath;
    // Preview only updates when explicitly provided (click events).
    // Bridge `selection-info` relays omit preview to keep the
    // previously-clicked label stable across structural reloads.
    if (typeof detail.preview === 'string') {
      selectedPreview = detail.preview.trim();
    } else if (!detail.irPath) {
      selectedPreview = '';
    }
    if (typeof detail.siblingIndex === 'number') selectedSiblingIndex = detail.siblingIndex;
    if (typeof detail.siblingCount === 'number') selectedSiblingCount = detail.siblingCount;
    if (!detail.irPath) {
      selectedSiblingIndex = -1;
      selectedSiblingCount = 0;
    }
  }

  function deselectBlock(): void {
    selectedIrPath = null;
    selectedPreview = '';
    selectedSiblingIndex = -1;
    selectedSiblingCount = 0;
  }

  // Auto-clear the selection when leaving Edit-layout mode or
  // navigating to a slide that doesn't support it.
  $effect(() => {
    if (!structureMode || !canEditLayout) {
      selectedIrPath = null;
      selectedPreview = '';
      selectedSiblingIndex = -1;
      selectedSiblingCount = 0;
    }
  });

  function handlePinTarget(detail: { irPath: string; preview?: string }): void {
    pinnedIrPath = detail.irPath;
    pinnedPreview = detail.preview?.trim() ?? '';
    pinMode = false;
    commentStatus = pinnedPreview
      ? `Pinning to: “${pinnedPreview}”`
      : 'Pinning to the selected block.';
  }

  /**
   * Convert a structure-mode action emitted by the canvas iframe into a
   * deck-store call. Move-up / move-down compute the target position
   * from the addressed sibling index. Insert-after stamps a default
   * prose node at `parentPath / index + 1`. Delete confirms in the
   * iframe before postMessaging.
   */
  /**
   * Compute the move target for a drag-and-drop. The user drops `src`
   * onto `dest`; the iframe bridge tells us whether the cursor was in
   * the upper ('above') or lower ('below') half of the target. We
   * interpret that as "land BEFORE dest" or "land AFTER dest"
   * respectively — matching the visual cue painted on the drop target.
   *
   * Cross-container moves use the dest's parent path; same-container
   * moves let `move_slide_node` handle the post-removal index
   * adjustment internally.
   */
  async function handleStructureReorder(detail: {
    srcIrPath: string;
    destIrPath: string;
    position: 'above' | 'below';
  }): Promise<void> {
    const src = decodeIrPath(detail.srcIrPath);
    const dest = decodeIrPath(detail.destIrPath);
    if (src.length < 2 || dest.length < 2) return;

    if (isPathInside(dest, src)) {
      setStructureStatus("Can't drop a block onto itself.");
      return;
    }

    const destParent = dest.slice(0, -1);
    const destLast = dest[dest.length - 1];
    if (typeof destLast !== 'number') return;
    const toPosition = detail.position === 'above' ? destLast : destLast + 1;

    // No-op detection: same parent + drop slot equals the source's
    // current index would land it back where it started. The most
    // common case is dragging downward and releasing in the upper half
    // of the immediate-next-sibling. Bail with a hint so the move
    // doesn't appear to silently fail.
    const srcParent = src.slice(0, -1);
    const srcLast = src[src.length - 1];
    const sameParent =
      srcParent.length === destParent.length &&
      srcParent.every((seg, i) => seg === destParent[i]);
    if (sameParent && typeof srcLast === 'number') {
      // moveNodeAtPath decrements toPosition by 1 internally for
      // same-container forward moves, so the post-removal landing
      // index is `toPosition - 1` when toPosition > srcLast, else
      // `toPosition`.
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
      await deck.moveSlideNode(src, destParent, toPosition);
      setStructureStatus('Moved.');
    } catch (err) {
      setStructureStatus(err instanceof Error ? err.message : String(err));
    }
  }

  type BlockAction =
    | 'delete'
    | 'duplicate'
    | 'move_up'
    | 'move_down';

  async function runBlockAction(action: BlockAction): Promise<void> {
    if (!selectedIrPath) return;
    const path = decodeIrPath(selectedIrPath);
    if (path.length < 2) return;
    const parentPath = path.slice(0, -1);
    const lastSeg = path[path.length - 1];
    if (typeof lastSeg !== 'number') return;

    setStructureStatus('');
    try {
      switch (action) {
        case 'delete':
          await deck.removeSlideNode(path);
          setStructureStatus('Deleted.');
          // The deleted block can't stay selected. The block-id
          // sequence shifted; safer to clear and let the user pick
          // again from the refreshed canvas.
          selectedIrPath = null;
          selectedPreview = '';
          break;
        case 'duplicate':
          await deck.duplicateSlideNode(path);
          setStructureStatus('Duplicated.');
          break;
        case 'move_up':
          if (lastSeg === 0) {
            setStructureStatus('Already at the top.');
            return;
          }
          await deck.moveSlideNode(path, parentPath, lastSeg - 1);
          setStructureStatus('Moved up.');
          // The moved block now lives at parentPath/lastSeg-1; update
          // the selection so the action bar keeps targeting it.
          selectedIrPath = [...parentPath, lastSeg - 1].join(',');
          break;
        case 'move_down':
          // `to_position` is interpreted PRE-removal in moveNodeAtPath:
          // same-container forward moves decrement by 1 internally to
          // honor "drop after the sibling currently at slot N" semantics.
          // To skip past the immediate-next sibling we need lastSeg+2,
          // not lastSeg+1 (which would land back at lastSeg — a no-op).
          await deck.moveSlideNode(path, parentPath, lastSeg + 2);
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
  let morphPickerOpen = $state(false);
  let morphTargets = $state<ReadonlyArray<LeafNodeKind>>([]);
  // Cached source node for morph — populated when the user opens
  // Change ▾ so the picker can filter and the commit step doesn't
  // re-fetch.
  let morphSourceNode = $state<Record<string, unknown> | null>(null);

  function openInsertPicker(): void {
    if (!selectedIrPath) return;
    insertPickerOpen = true;
  }

  function closeInsertPicker(): void {
    insertPickerOpen = false;
  }

  async function handleInsertPick(kind: LeafNodeKind): Promise<void> {
    if (!selectedIrPath) {
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
      // Asset picker handles the second step + the actual insert.
      openAssetPicker(parentPath, insertIndex);
      return;
    }

    const payload = defaultNodePayload(kind);
    if (!payload) {
      setStructureStatus("Couldn't compose that block.");
      return;
    }
    setStructureStatus('');
    try {
      await deck.insertSlideNode(parentPath, insertIndex, payload);
      setStructureStatus(`${humanLabel(kind)} added.`);
      // Auto-select the newly inserted block so Change ▾ and
      // rich-text edit are immediately reachable. The bridge will
      // re-emit selection-info on iframe reload to refresh
      // sibling-count for canMoveUp / canMoveDown.
      selectedIrPath = [...parentPath, insertIndex].join(',');
    } catch (err) {
      setStructureStatus(err instanceof Error ? err.message : String(err));
    }
  }

  async function openMorphPicker(): Promise<void> {
    if (!selectedIrPath || !bridge || !deck.editorState) return;
    const path = decodeIrPath(selectedIrPath);
    if (path.length < 2) return;
    setStructureStatus('Loading…');
    try {
      const result = await bridge.callTool<{ ir?: unknown }>('get_slide', {
        deck_id: deck.editorState.deck.id,
        slide_id: deck.editorState.selectedSlide.slideId,
      });
      const ir = result.structuredContent?.ir as Record<string, unknown> | undefined;
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
      morphTargets = morphTargetsFor(sourceKind);
      morphPickerOpen = true;
      setStructureStatus('');
    } catch (err) {
      setStructureStatus(err instanceof Error ? err.message : String(err));
    }
  }

  function closeMorphPicker(): void {
    morphPickerOpen = false;
    morphSourceNode = null;
    morphTargets = [];
  }

  async function handleMorphPick(target: LeafNodeKind): Promise<void> {
    if (!selectedIrPath || !morphSourceNode) {
      closeMorphPicker();
      return;
    }
    const path = decodeIrPath(selectedIrPath);
    const result = morphTo(morphSourceNode, target);
    closeMorphPicker();
    if (!result) {
      setStructureStatus("Couldn't change this block.");
      return;
    }
    try {
      await deck.applySlideNodeEdit(path, result.newNode);
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

  function humanLabel(kind: LeafNodeKind): string {
    switch (kind) {
      case 'paragraph': return 'Paragraph';
      case 'heading':   return 'Heading';
      case 'list':      return 'List';
      case 'quote':     return 'Quote';
      case 'callout':   return 'Callout';
      case 'image':     return 'Image';
      case 'divider':   return 'Divider';
    }
  }

  function capitalize(s: string): string {
    return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
  }

  /** Walk an IR root by path. Path segments are alternating field
   *  names (string) and indices (number). Returns null if any segment
   *  is missing. */
  function walkIrPath(root: unknown, path: ReadonlyArray<string | number>): unknown {
    let cur: unknown = root;
    for (const seg of path) {
      if (cur == null) return null;
      cur = (cur as Record<string | number, unknown>)[seg];
    }
    return cur;
  }

  async function submitComment(): Promise<void> {
    if (!bridge || !deck.editorState || !commentDraft.trim()) return;
    commentPending = true;
    commentStatus = '';
    try {
      const slideId = deck.editorState.selectedSlide.slideId;
      const target: CommentTarget = pinnedIrPath
        ? {
            kind: 'ir_node',
            container_id: slideId,
            ir_path: decodeIrPath(pinnedIrPath),
            ...(pinnedPreview ? { preview: pinnedPreview } : {}),
          }
        : { kind: 'slide', slide_id: slideId };
      const body = commentDraft.trim();
      const savedPreview = pinnedPreview;
      const savedIrPath = pinnedIrPath;
      const savedKind = commentKind;
      await bridge.addCommentFromApp({
        deck_id: deck.editorState.deck.id,
        target,
        kind: savedKind,
        body,
      });

      // Fire-and-forget nudge to the chat so the agent knows about the
      // comment on its current turn instead of waiting for the next
      // one. Host may not support sendMessage — returns false in that
      // case and we fall back to a "agent will see on next turn" hint.
      const mcp = bridge as unknown as McpDeckEditorBridge;
      let notified = false;
      if (typeof mcp.notifyAgentOfComment === 'function') {
        const targetLabel = savedIrPath
          ? (savedPreview ? `"${savedPreview}" (ir_path ${savedIrPath})` : `ir_path ${savedIrPath}`)
          : (isPrint ? 'the whole page' : 'the whole slide');
        try {
          notified = await mcp.notifyAgentOfComment({
            deck_title: deck.editorState.deck.title,
            slide_title: deck.editorState.selectedSlide.metadata.title,
            page_hint: isPrint ? `page ${deck.editorState.selectedSlide.position + 1}` : undefined,
            target_label: targetLabel,
            kind: savedKind,
            body,
          });
        } catch {
          notified = false;
        }
      }

      commentDraft = '';
      pinnedIrPath = null;
      pinnedPreview = '';
      commentStatus = notified
        ? 'Saved and sent to the agent in chat.'
        : 'Saved. The agent will pick it up on its next turn — or ask it in chat now.';
      commentDrawerOpen = true;
      await refreshCommentedIrPaths();
    } catch (err) {
      commentStatus = err instanceof Error ? err.message : String(err);
    } finally {
      commentPending = false;
    }
  }

  async function refreshCommentedIrPaths(): Promise<void> {
    if (!bridge || !deck.editorState) return;
    try {
      const result = await bridge.listComments(
        deck.editorState.deck.id,
        { resolved: 'unresolved', target_kind: 'ir_node' },
      );
      const slideId = deck.editorState.selectedSlide.slideId;
      commentedIrPaths = result.comments
        .filter((c) => c.target.kind === 'ir_node' && c.target.container_id === slideId)
        .map((c) => (c.target as { ir_path: ReadonlyArray<string | number> }).ir_path.join(','));
    } catch {
      commentedIrPaths = [];
    }
  }

  // Refresh node-level pin decorations whenever the selected slide, its
  // revision hash, or the bridge changes. v4.9: revision hash bumps
  // after structural ops (insert / delete / duplicate / move) and the
  // server-side comment migrator may have rewritten pinned `ir_path`s,
  // so the decoration set needs to track that.
  $effect(() => {
    if (bridge && deck.editorState) {
      void deck.editorState.selectedSlide.slideId;
      void deck.editorState.selectedSlide.revisionHash;
      void refreshCommentedIrPaths();
    }
  });

  function handleCommentJump(target: CommentTarget): void {
    if (target.kind === 'slide') {
      deck.selectSlide(target.slide_id);
      commentDrawerOpen = false;
    } else if (target.kind === 'ir_node') {
      deck.selectSlide(target.container_id);
      commentDrawerOpen = false;
    }
    // Section targets route via the Document Editor, not this slide Editor.
  }

  let detailsOpen = $state(false);
  let activePanel = $state<'overview' | 'checks' | 'details'>('overview');
  let reviseInstruction = $state('');
  let reviseStatus = $state('');
  let reviseFallbackPayload = $state('');
  let canvasNonce = $state(0);

  const deckFormat = $derived<FormatKind>(deck.editorState?.deck.format ?? 'slides_16_9');
  const isPrint = $derived(deckFormat !== 'slides_16_9');
  // Edit-layout (drag/insert/delete blocks) only works on IR-authored
  // slides. Legacy HTML imports don't carry `data-ir-path` markers, so
  // the toolbar would have no targets to bind to.
  const canEditLayout = $derived(
    deck.editorState?.selectedSlide.sourceKind === 'authored_ir',
  );

  // Auto-exit Edit-layout when navigating to a slide that doesn't
  // support it; otherwise the toggle stays "on" but does nothing.
  $effect(() => {
    if (!canEditLayout && structureMode) {
      structureMode = false;
      setStructureStatus('');
    }
  });
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

  async function handleRichTextCommit(detail: {
    irPath: string;
    field: string;
    body: ReadonlyArray<Record<string, unknown>>;
  }): Promise<void> {
    const path = decodeIrPath(detail.irPath);
    if (path.length < 2) return;
    // If the user wiped all the text, fall back to a single empty run
    // so RichText schema (`TextRun[]`) still validates and the field
    // stays targetable for re-editing.
    const body = detail.body.length > 0 ? detail.body : [{ text: '' }];
    await deck.applyFieldRichTextEdit(path, detail.field, body);
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
            {#if structureMode && structureStatus}
              <span class="canvas-note">{structureStatus}</span>
            {/if}
            {#if canEditLayout}
              <Button
                variant={structureMode ? 'primary' : 'ghost'}
                size="sm"
                onclick={toggleStructureMode}
                title={structureMode
                  ? 'Exit edit-layout mode and return to text editing.'
                  : 'Rearrange, add, or delete blocks on this slide.'}
              >
                {structureMode ? 'Done' : 'Edit layout'}
              </Button>
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
            pinMode={pinMode}
            pinnedIrPaths={commentedIrPaths}
            draftPinnedIrPath={pinnedIrPath}
            structureMode={structureMode}
            selectedIrPath={selectedIrPath}
            oncommit={handleTextCommit}
            oncommitrichtext={handleRichTextCommit}
            onpintarget={handlePinTarget}
            onselectblock={handleSelectBlock}
            onstructurereorder={handleStructureReorder}
            onerror={(d) => console.error(d.message)}
          />
        </div>

        {#if canEditLayout && structureMode}
          <BlockActionBar
            selectedIrPath={selectedIrPath}
            selectedPreview={selectedPreview}
            canMoveUp={selectedSiblingIndex > 0}
            canMoveDown={
              selectedSiblingIndex >= 0 &&
              selectedSiblingCount > 0 &&
              selectedSiblingIndex < selectedSiblingCount - 1
            }
            canChangeType={true}
            onMoveUp={() => runBlockAction('move_up')}
            onMoveDown={() => runBlockAction('move_down')}
            onDuplicate={() => runBlockAction('duplicate')}
            onInsertBlock={openInsertPicker}
            onChangeType={() => void openMorphPicker()}
            onDelete={() => runBlockAction('delete')}
            onDeselect={deselectBlock}
          />
        {/if}

        {#if canEditLayout}
          <p class="canvas-tip" role="note">
            {#if structureMode}
              {#if selectedIrPath}
                Use the action bar above. Or drag a block to reorder — a mint
                line shows where it will land.
              {:else}
                Click any block to select it. The action bar appears below
                the canvas.
              {/if}
            {:else if pinMode}
              Click a block in the slide to pin a comment to it.
            {:else}
              Tip: click any text to edit it. Select text to format.
              Use <strong>Edit layout</strong> to reorder, add or delete blocks.
            {/if}
          </p>
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
            <div class="cc-target-row">
              <span class="cc-target-label">Target:</span>
              {#if pinnedIrPath}
                <span class="cc-pin-chip" title={pinnedPreview ? `${pinnedIrPath} — ${pinnedPreview}` : pinnedIrPath}>
                  <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true" width="10" height="10"><circle cx="6" cy="6" r="4"/></svg>
                  <span class="cc-pin-text">
                    {pinnedPreview || pinnedIrPath}
                  </span>
                </span>
                <button type="button" class="cc-clear" onclick={() => { pinnedIrPath = null; pinnedPreview = ''; commentStatus = ''; }}>clear</button>
              {:else if pinMode}
                <span class="cc-pin-active">Click a block in the slide…</span>
                <button type="button" class="cc-clear" onclick={togglePinMode}>cancel</button>
              {:else}
                <span class="cc-target-note">whole slide</span>
                <button
                  type="button"
                  class={`cc-pin-btn ${pinMode ? 'active' : ''}`}
                  onclick={togglePinMode}
                >
                  Pin to a block
                </button>
              {/if}
            </div>
            <Textarea
              bind:value={commentDraft}
              rows={2}
              placeholder={pinnedIrPath
                ? (pinnedPreview
                    ? `Write a note about “${pinnedPreview}”.`
                    : 'Write a note about the selected block.')
                : 'Write a note about this page for the agent to address.'}
            />
            <div class="cc-actions">
              <Button
                variant="primary"
                size="sm"
                onclick={submitComment}
                disabled={!commentDraft.trim() || commentPending}
              >
                {commentPending ? 'Sending…' : 'Pin & send to agent'}
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

    <!-- v4.9 image picker (opened by Edit-layout → Add image) -->
    {#if bridge}
      <AssetPicker
        bridge={bridge}
        open={assetPickerOpen}
        onPick={handleAssetPick}
        onClose={closeAssetPicker}
      />
    {/if}

    <!-- v4.9e: + Block ▾ and Change ▾ pickers -->
    <NodeTypePicker
      open={insertPickerOpen}
      title="Insert a block"
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
    grid-template-rows: auto minmax(0, 1fr) !important;
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

  .canvas-tip {
    margin: 0;
    padding: var(--s-2) var(--s-5) var(--s-3);
    color: var(--ink-3);
    font-size: 12px;
    line-height: 1.5;
    border-top: 1px solid var(--border-hairline);
  }

  .canvas-tip strong {
    color: var(--ink-2);
    font-weight: 600;
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

  .cc-target-row {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    font-size: 11px;
    color: var(--ink-3);
    flex-wrap: wrap;
  }

  .cc-target-label {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .cc-target-note {
    color: var(--ink-2);
  }

  .cc-pin-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 10px;
    border-radius: var(--r-pill);
    background: var(--mint-tint);
    color: var(--mint-hover);
    font-size: 11px;
    max-width: 320px;
    min-width: 0;
  }

  .cc-pin-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 280px;
  }

  .cc-pin-active {
    padding: 2px 8px;
    border-radius: var(--r-pill);
    background: var(--warning-tint);
    color: var(--warning);
    font-weight: 500;
  }

  .cc-pin-btn {
    font-size: 11px;
    font-weight: 500;
    padding: 2px 10px;
    border-radius: var(--r-pill);
    border: 1px solid var(--border-subtle);
    background: var(--surface-1);
    color: var(--ink-2);
    cursor: pointer;
  }

  .cc-pin-btn:hover,
  .cc-pin-btn.active {
    border-color: var(--mint);
    color: var(--mint-hover);
    background: var(--mint-tint);
  }

  .cc-clear {
    font-size: 11px;
    color: var(--ink-3);
    text-decoration: underline;
    cursor: pointer;
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
    /* In narrow mode we let the whole layout flow vertically. The
       original `height: 100%` + `overflow: hidden` on editor-layout
       traps every row inside a fixed viewport and collapses the
       canvas card to 0 px (because `minmax(0, 1fr)` inside a
       `grid-auto-rows: auto` parent resolves to 0). Using natural
       row heights + internal vertical scroll lets main-col's flex
       children use their own min-heights while still fitting inside
       main-area's fixed-height shell. */
    .editor-layout {
      height: 100%;
      min-height: 0;
      overflow-y: auto;
      grid-auto-rows: min-content;
    }

    .slide-mode,
    .print-mode {
      grid-template-columns: 1fr;
    }

    /* Horizontal scrolling page strip so the rail doesn't eat half
       the viewport with a single full-width portrait thumbnail. */
    .thumb-rail {
      max-height: none;
      grid-template-rows: auto auto;
    }

    .rail-track {
      flex-direction: row;
      overflow-x: auto;
      overflow-y: hidden;
      gap: var(--s-3);
      padding: var(--s-3);
      scroll-snap-type: x proximity;
    }

    .thumb-card {
      flex: 0 0 auto;
      width: 140px;
      scroll-snap-align: start;
    }

    /* In the horizontal strip we want the thumbnail at its natural
       aspect (not cropped to 16:9 or portrait-tall). */
    .thumb-img-landscape,
    .thumb-img-portrait {
      width: 100%;
      object-fit: contain;
      background: var(--surface-2);
    }

    .thumb-img-portrait {
      aspect-ratio: 1240 / 1754;
      max-height: 180px;
      width: auto;
    }

    /* Let main-col grow to its content so the canvas-card can use
       the SlideCanvas's intrinsic min-height instead of collapsing.
       `overflow: visible` lets editor-layout (the scrolling parent)
       handle the scrollbar. */
    .main-col {
      display: flex;
      flex-direction: column;
      gap: var(--s-3);
      overflow: visible;
      min-height: 0;
    }

    :global(.canvas-card) {
      min-height: 360px;
      overflow: visible;
    }

    .canvas-stage {
      min-height: 300px;
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
