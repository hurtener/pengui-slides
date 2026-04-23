// Pengui Slides — Toast notification store (Svelte 5 runes).
//
// Ported from study-audio-mcp/frontend/src/stores/toast.svelte.ts.
// No app-specific imports; no sibling-specific keyboard / player hooks.

export type ToastTone = 'info' | 'success' | 'warn' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  expiresAt: number;
}

interface ToastState {
  items: Toast[];
}

const DEFAULT_TTL = 3_000;

function createToastStore() {
  const state = $state<ToastState>({ items: [] });
  let nextId = 1;

  function push(message: string, tone: ToastTone = 'info', ttl: number = DEFAULT_TTL): number {
    const id = nextId++;
    const expiresAt = Date.now() + ttl;
    state.items = [...state.items, { id, message, tone, expiresAt }];
    if (ttl > 0) {
      setTimeout(() => dismiss(id), ttl);
    }
    return id;
  }

  function dismiss(id: number): void {
    state.items = state.items.filter((t) => t.id !== id);
  }

  function clear(): void {
    state.items = [];
  }

  return {
    get items() {
      return state.items;
    },
    push,
    dismiss,
    clear,
    success: (m: string) => push(m, 'success'),
    error: (m: string) => push(m, 'error', 5_000),
    info: (m: string) => push(m, 'info'),
    warn: (m: string) => push(m, 'warn', 4_000)
  };
}

export const toast = createToastStore();
