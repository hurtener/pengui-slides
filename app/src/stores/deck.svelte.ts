// Pengui Slides — Deck editor store (Svelte 5 runes).
//
// Centralises all bridge-to-state logic that was previously inline in
// DeckEditorApp.svelte. Route components (Editor, Export, Decks) consume
// this store and call its action methods.

import { toast } from './toast.svelte';
import type { DeckEditorBridge, EditorState, ToolCallResult } from '../lib/types';
import type { McpDeckEditorBridge } from '../lib/bridge';

export type IrPathArray = ReadonlyArray<string | number>;

interface DeckStoreState {
  currentDeckId: string | null;
  editorState: EditorState | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  conflictMessage: string;
}

function extractEditorState(result: ToolCallResult<Record<string, unknown>>): EditorState | null {
  const payload = result.structuredContent;
  if (!payload || typeof payload !== 'object') return null;
  if ('editor_state' in payload && payload.editor_state && typeof payload.editor_state === 'object') {
    return payload.editor_state as EditorState;
  }
  return null;
}

function extractErrorText(result: ToolCallResult<Record<string, unknown>>): string {
  const textBlock = result.content?.find((b) => b.type === 'text' && typeof b.text === 'string');
  if (!textBlock?.text) return '';
  try {
    const parsed = JSON.parse(textBlock.text) as { message?: string };
    return parsed.message ?? textBlock.text;
  } catch {
    return textBlock.text;
  }
}

function createDeckStore(bridge: DeckEditorBridge) {
  const state = $state<DeckStoreState>({
    currentDeckId: null,
    editorState: null,
    loading: true,
    error: null,
    saving: false,
    conflictMessage: '',
  });

  async function loadEditor(deckId: string, slideId?: string): Promise<void> {
    state.loading = true;
    state.error = null;

    const result = await bridge.callTool<{ editor_state?: EditorState }>('get_editor_state', {
      deck_id: deckId,
      ...(slideId ? { slide_id: slideId } : {}),
    });

    const next = extractEditorState(result);
    if (next) {
      state.currentDeckId = deckId;
      state.editorState = next;
      state.error = null;
    } else {
      state.error = extractErrorText(result) || 'The editor returned no state.';
      toast.error(state.error);
    }
    state.loading = false;
  }

  async function selectSlide(slideId: string): Promise<void> {
    const deckId = state.currentDeckId ?? state.editorState?.deck.id;
    if (!deckId || state.saving) return;
    if (state.editorState?.selectedSlide.slideId === slideId) return;
    await loadEditor(deckId, slideId);
  }

  async function applyTextEdit(editId: string, text: string): Promise<void> {
    if (!state.editorState || state.saving) return;

    state.saving = true;
    state.conflictMessage = '';

    const result = await bridge.callTool<{ conflict?: boolean; editor_state?: EditorState }>(
      'apply_text_edit',
      {
        deck_id: state.editorState.deck.id,
        slide_id: state.editorState.selectedSlide.slideId,
        edit_id: editId,
        text,
        expected_revision_hash: state.editorState.selectedSlide.revisionHash,
      },
    );

    if (result.isError) {
      const next = extractEditorState(result);
      if (next) state.editorState = next;
      state.conflictMessage = result.structuredContent?.conflict
        ? 'The slide changed elsewhere. The editor reloaded the latest server state.'
        : extractErrorText(result) || 'Text edit failed.';
    } else {
      const next = extractEditorState(result);
      if (next) {
        state.editorState = next;
        state.error = null;
      } else {
        state.error = extractErrorText(result) || 'The editor returned no state.';
      }
    }

    state.saving = false;
  }

  async function refresh(): Promise<void> {
    const deckId = state.currentDeckId ?? state.editorState?.deck.id;
    const slideId = state.editorState?.selectedSlide.slideId;
    if (!deckId) return;
    await loadEditor(deckId, slideId);
  }

  // ── Structural ops (v4.9) ──────────────────────────────────────────────
  // Each wrapper sets `saving`, calls the raw bridge method, then reloads
  // editor state so HTML / validation / pin decorations all refresh.
  // Errors surface via toast and leave the editor state untouched.

  function structuralBridge(): McpDeckEditorBridge | null {
    return (bridge as unknown as McpDeckEditorBridge | null) ?? null;
  }

  async function withStructuralSave<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
    if (!state.editorState || state.saving) return null;
    state.saving = true;
    state.conflictMessage = '';
    try {
      const result = await fn();
      await refresh();
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`${label}: ${msg}`);
      state.conflictMessage = msg;
      return null;
    } finally {
      state.saving = false;
    }
  }

  async function removeSlideNode(path: IrPathArray): Promise<void> {
    const b = structuralBridge();
    const es = state.editorState;
    if (!b || !es) return;
    await withStructuralSave('Delete failed', () =>
      b.removeSlideNode({
        deck_id: es.deck.id,
        slide_id: es.selectedSlide.slideId,
        path,
      }),
    );
  }

  async function duplicateSlideNode(path: IrPathArray, position?: number): Promise<void> {
    const b = structuralBridge();
    const es = state.editorState;
    if (!b || !es) return;
    await withStructuralSave('Duplicate failed', () =>
      b.duplicateSlideNode({
        deck_id: es.deck.id,
        slide_id: es.selectedSlide.slideId,
        path,
        ...(typeof position === 'number' ? { position } : {}),
      }),
    );
  }

  async function moveSlideNode(
    fromPath: IrPathArray,
    toParentPath: IrPathArray,
    toPosition: number,
  ): Promise<void> {
    const b = structuralBridge();
    const es = state.editorState;
    if (!b || !es) return;
    await withStructuralSave('Move failed', () =>
      b.moveSlideNode({
        deck_id: es.deck.id,
        slide_id: es.selectedSlide.slideId,
        from_path: fromPath,
        to_parent_path: toParentPath,
        to_position: toPosition,
      }),
    );
  }

  async function insertSlideNode(
    parentPath: IrPathArray,
    position: number,
    newNode: Record<string, unknown>,
  ): Promise<void> {
    const b = structuralBridge();
    const es = state.editorState;
    if (!b || !es) return;
    await withStructuralSave('Insert failed', () =>
      b.insertSlideNode({
        deck_id: es.deck.id,
        slide_id: es.selectedSlide.slideId,
        parent_path: parentPath,
        position,
        new_node: newNode,
      }),
    );
  }

  /**
   * Commit a rich-text edit on one named field of an IR node (v4.9c).
   * Routes through the new `apply_slide_field_edit` tool — only the
   * addressed field is rewritten, every sibling field stays put.
   * Works for prose body, hero title/subtitle/eyebrow, heading text,
   * list items, callout title/body, quote body/attribution, image
   * caption.
   */
  async function applyFieldRichTextEdit(
    path: IrPathArray,
    field: string,
    body: ReadonlyArray<Record<string, unknown>>,
  ): Promise<void> {
    const b = structuralBridge();
    const es = state.editorState;
    if (!b || !es) return;
    await withStructuralSave('Edit failed', () =>
      b.callTool('apply_slide_field_edit', {
        deck_id: es.deck.id,
        slide_id: es.selectedSlide.slideId,
        path,
        field,
        value: body,
      }),
    );
  }

  function applyIncomingState(result: ToolCallResult<Record<string, unknown>>): void {
    const next = extractEditorState(result);
    if (next) {
      state.editorState = next;
      state.currentDeckId = next.deck.id;
      state.loading = false;
      state.error = null;
    }
  }

  return {
    get currentDeckId() { return state.currentDeckId; },
    get editorState() { return state.editorState; },
    get loading() { return state.loading; },
    get error() { return state.error; },
    get saving() { return state.saving; },
    get conflictMessage() { return state.conflictMessage; },
    set loading(v: boolean) { state.loading = v; },
    loadEditor,
    selectSlide,
    applyTextEdit,
    refresh,
    applyIncomingState,
    removeSlideNode,
    duplicateSlideNode,
    moveSlideNode,
    insertSlideNode,
    applyFieldRichTextEdit,
  };
}

// The store is created with a bridge at runtime; components receive it as a prop or via context.
export { createDeckStore };
export type DeckStore = ReturnType<typeof createDeckStore>;
