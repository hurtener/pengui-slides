/**
 * v4.23 — Slim MCP App client.
 *
 * Hand-rolled replacement for `@modelcontextprotocol/ext-apps`'s `App`
 * class + `PostMessageTransport`, sized for the surface we actually
 * use (connect / tools/call / tool-input + tool-result notifications /
 * sendMessage / host context). The full SDK pulls in a Zod runtime
 * and the entire MCP Protocol class which together account for
 * ~150–200 KB of the bundled HTML the host has to ship to every
 * client. This file is < 8 KB unminified.
 *
 * Protocol (per MCP App spec 2026-01-26):
 * - Transport: `window.postMessage` between iframe and parent.
 * - Framing:   JSON-RPC 2.0 (id-correlated requests + notifications).
 * - App→Host requests we send: `ui/initialize`, `tools/call`,
 *                              `ui/message`.
 * - App→Host notifications we send:
 *                              `ui/notifications/initialized`,
 *                              `ui/notifications/size-changed`.
 * - Host→App notifications we receive:
 *                              `ui/notifications/tool-input`,
 *                              `ui/notifications/tool-result`,
 *                              `ui/notifications/host-context-changed`.
 *
 * No schema validation: we trust the host's message shape. If a host
 * sends malformed JSON-RPC, callers see undefined fields and the app
 * fails gracefully rather than throwing on `safeParse` failures.
 *
 * What is INTENTIONALLY not implemented (added only when actually
 * needed): tools/list handler, message subscription, download-file,
 * open-link, request-display-mode, resource-teardown,
 * update-model-context, tool-input-partial, tool-cancelled,
 * sandbox proxy ready handshake. The bridge.ts surface in this app
 * never calls these — if a future feature needs one, port the
 * corresponding SDK helper.
 */

const PROTOCOL_VERSION = '2026-01-26';

// Method names — pinned to spec strings. Kept as string literals
// rather than enums so they're inlined at minify time.
const M_INIT_REQUEST = 'ui/initialize';
const M_INIT_NOTIFICATION = 'ui/notifications/initialized';
const M_TOOLS_CALL = 'tools/call';
const M_UI_MESSAGE = 'ui/message';
const M_SIZE_CHANGED = 'ui/notifications/size-changed';
const M_TOOL_INPUT = 'ui/notifications/tool-input';
const M_TOOL_RESULT = 'ui/notifications/tool-result';
const M_HOST_CONTEXT_CHANGED = 'ui/notifications/host-context-changed';

// ── Types we expose ─────────────────────────────────────────────

export interface HostInfo {
  name?: string;
  version?: string;
  title?: string;
}

export interface HostCapabilities {
  tools?: unknown;
  message?: unknown;
  // The spec defines more, but bridge.ts only checks `message`.
  [k: string]: unknown;
}

export interface HostContext {
  theme?: 'light' | 'dark' | unknown;
  styles?: {
    variables?: Record<string, string | undefined>;
    css?: {
      fonts?: string;
    };
  };
  // Spec has more fields (locale, timeZone, viewportSize, etc.) —
  // we pass everything through and let consumers inspect what they
  // need.
  [k: string]: unknown;
}

export interface AppInfo {
  name: string;
  version: string;
}

export interface CallToolParams {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface ToolResultLike {
  structuredContent?: unknown;
  content?: Array<{ type: string; text?: string } | unknown>;
  isError?: boolean;
  [k: string]: unknown;
}

export interface SendMessageParams {
  role: 'user' | 'assistant';
  content: Array<{ type: string; text?: string }>;
}

export type ToolInputHandler = (
  params: { name?: string; arguments?: Record<string, unknown> },
) => void;
export type ToolResultHandler = (result: ToolResultLike) => void;
export type HostContextChangedHandler = (partial: Partial<HostContext>) => void;

// ── Implementation ──────────────────────────────────────────────

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

type IncomingMessage = JsonRpcResponse | JsonRpcNotification;

export class SlimMcpApp {
  ontoolinput: ToolInputHandler | null = null;
  ontoolresult: ToolResultHandler | null = null;
  onhostcontextchanged: HostContextChangedHandler | null = null;

  private readonly appInfo: AppInfo;
  private readonly appCapabilities: Record<string, unknown>;
  private readonly autoResize: boolean;

  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  private hostInfo: HostInfo | undefined;
  private hostCapabilities: HostCapabilities | undefined;
  private hostContext: HostContext | undefined;

  private listener: ((e: MessageEvent) => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastReportedSize: { width: number; height: number } = { width: 0, height: 0 };

  constructor(
    appInfo: AppInfo,
    appCapabilities: Record<string, unknown> = {},
    options: { autoResize?: boolean } = { autoResize: true },
  ) {
    this.appInfo = appInfo;
    this.appCapabilities = appCapabilities;
    this.autoResize = options.autoResize ?? true;
  }

  getHostInfo(): HostInfo | undefined { return this.hostInfo; }
  getHostCapabilities(): HostCapabilities | undefined { return this.hostCapabilities; }
  getHostContext(): HostContext | undefined { return this.hostContext; }

  async connect(): Promise<void> {
    if (this.listener) {
      throw new Error('SlimMcpApp is already connected.');
    }
    this.listener = (event: MessageEvent) => {
      // The MCP App spec allows the host to send messages from window.parent.
      // We accept any message shaped like JSON-RPC; sender identity is
      // already constrained by the sandboxed iframe boundary.
      const data = event.data;
      if (!data || typeof data !== 'object' || (data as { jsonrpc?: string }).jsonrpc !== '2.0') {
        return;
      }
      this.handleIncoming(data as IncomingMessage);
    };
    window.addEventListener('message', this.listener);

    const initResult = (await this.request(M_INIT_REQUEST, {
      appInfo: this.appInfo,
      appCapabilities: this.appCapabilities,
      protocolVersion: PROTOCOL_VERSION,
    })) as {
      hostInfo?: HostInfo;
      hostCapabilities?: HostCapabilities;
      hostContext?: HostContext;
    } | undefined;

    this.hostInfo = initResult?.hostInfo;
    this.hostCapabilities = initResult?.hostCapabilities;
    this.hostContext = initResult?.hostContext;

    this.notify(M_INIT_NOTIFICATION, undefined);

    if (this.autoResize) {
      this.setupAutoResize();
    }
  }

  close(): void {
    if (this.listener) {
      window.removeEventListener('message', this.listener);
      this.listener = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    for (const [, pending] of this.pending) {
      pending.reject(new Error('SlimMcpApp closed before response arrived.'));
    }
    this.pending.clear();
  }

  async callServerTool(params: CallToolParams): Promise<ToolResultLike> {
    if (typeof params !== 'object' || params === null || typeof (params as CallToolParams).name !== 'string') {
      throw new Error('callServerTool({ name, arguments }) requires a `name` string.');
    }
    const result = (await this.request(M_TOOLS_CALL, params)) as ToolResultLike;
    return result ?? {};
  }

  async sendMessage(params: SendMessageParams): Promise<void> {
    await this.request(M_UI_MESSAGE, params);
  }

  // ── private ────────────────────────────────────────────────

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const msg: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    };
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        window.parent.postMessage(msg, '*');
      } catch (err) {
        this.pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private notify(method: string, params: unknown): void {
    const msg: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {}),
    };
    window.parent.postMessage(msg, '*');
  }

  private handleIncoming(msg: IncomingMessage): void {
    if ('id' in msg && msg.id !== undefined && msg.id !== null) {
      // Response — correlate against pending requests.
      const pending = this.pending.get(msg.id as number);
      if (!pending) return;
      this.pending.delete(msg.id as number);
      const err = (msg as JsonRpcResponse).error;
      if (err) {
        const e = new Error(err.message ?? 'Host returned an error');
        (e as { code?: number; data?: unknown }).code = err.code;
        (e as { code?: number; data?: unknown }).data = err.data;
        pending.reject(e);
      } else {
        pending.resolve((msg as JsonRpcResponse).result);
      }
      return;
    }
    // Notification.
    const note = msg as JsonRpcNotification;
    if (note.method === M_TOOL_INPUT) {
      this.ontoolinput?.((note.params ?? {}) as Parameters<ToolInputHandler>[0]);
    } else if (note.method === M_TOOL_RESULT) {
      this.ontoolresult?.((note.params ?? {}) as ToolResultLike);
    } else if (note.method === M_HOST_CONTEXT_CHANGED) {
      const partial = (note.params ?? {}) as Partial<HostContext>;
      this.hostContext = { ...(this.hostContext ?? {}), ...partial };
      this.onhostcontextchanged?.(partial);
    }
    // Unknown notifications: ignore. The full SDK validates, then
    // ignores; we just skip the validation step.
  }

  private setupAutoResize(): void {
    const measureAndReport = (): void => {
      const root = document.documentElement;
      const prevW = root.style.width;
      const prevH = root.style.height;
      // Temporarily shrink-to-fit to measure intrinsic size, mirroring
      // what the SDK's reference implementation does.
      root.style.width = 'fit-content';
      root.style.height = 'fit-content';
      const rect = root.getBoundingClientRect();
      root.style.width = prevW;
      root.style.height = prevH;
      const sbOffset = window.innerWidth - root.clientWidth;
      const width = Math.ceil(rect.width + sbOffset);
      const height = Math.ceil(rect.height);
      if (width !== this.lastReportedSize.width || height !== this.lastReportedSize.height) {
        this.lastReportedSize = { width, height };
        this.notify(M_SIZE_CHANGED, { width, height });
      }
    };
    let pending = false;
    const schedule = (): void => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        measureAndReport();
      });
    };
    schedule();
    this.resizeObserver = new ResizeObserver(schedule);
    this.resizeObserver.observe(document.documentElement);
    this.resizeObserver.observe(document.body);
  }
}

// ── Style helpers (replacements for ext-apps' applyDocumentTheme et al) ────

export function applyDocumentTheme(theme: 'light' | 'dark' | unknown): void {
  if (theme !== 'dark' && theme !== 'light') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
}

export function applyHostStyleVariables(
  vars: Record<string, string | undefined> | undefined,
  target: HTMLElement = document.documentElement,
): void {
  if (!vars) return;
  for (const [name, value] of Object.entries(vars)) {
    if (value !== undefined) target.style.setProperty(name, value);
  }
}

export function applyHostFonts(css: string | undefined): void {
  if (!css) return;
  const existing = document.getElementById('__mcp-host-fonts');
  if (existing) return; // idempotent
  const el = document.createElement('style');
  el.id = '__mcp-host-fonts';
  el.textContent = css;
  document.head.appendChild(el);
}
