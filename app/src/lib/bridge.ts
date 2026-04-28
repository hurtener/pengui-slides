import {
  App,
  PostMessageTransport,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
} from '@modelcontextprotocol/ext-apps';
import { buildRevisionPrompt } from './revise';
import type { DeckEditorBridge, RevisionPayload, ToolCallResult } from './types';

// ── v4 Wave 2 typed responses ───────────────────────────────────────────────

export interface DeckListItem {
  id: string;
  slug: string;
  soul_id: string;
  soul_slug: string;
  title: string;
  author: string;
  format: string;
  authoring_model: string;
  slide_count: number;
  section_count: number;
  created_at: string;
  updated_at: string;
}

export interface ListDecksResponse {
  deck_count: number;
  decks: DeckListItem[];
}

export interface SoulListItem {
  soul_id: string;
  slug: string;
  name: string;
  status: string;
  token_count: number;
  recipe_count: number;
}

export interface ListDesignSoulsResponse {
  souls: SoulListItem[];
}

export interface SoulLayer {
  name: string;
  tokens: Record<string, string>;
}

export interface LayoutRecipe {
  id: string;
  type?: string;
  name: string;
  description?: string;
  tags?: string[];
  source?: string;
  medium?: string;
  html: string;
}

export interface DesignSoul {
  soul_id: string;
  id: string;
  slug: string;
  name: string;
  description?: string;
  status: string;
  layers: SoulLayer[];
  cssTokens: Record<string, string>;
  cssTokensString?: string;
  recipes: LayoutRecipe[];
  allowed_fonts?: string[];
  styleGuide?: string;
}

export interface GetDesignSoulResponse {
  soul: DesignSoul;
}

/**
 * v4.8.5: element-target comments now reference an IR node by structural
 * `ir_path` — same shape that `apply_slide_node_edit` /
 * `apply_section_node_edit` accept. The compiler emits matching
 * `data-ir-path` attributes on every node root for the App's pin bridge
 * to read.
 */
export type CommentTarget =
  | { kind: 'slide'; slide_id: string }
  | { kind: 'section'; section_id: string }
  | {
      kind: 'ir_node';
      container_id: string;
      ir_path: ReadonlyArray<string | number>;
      preview?: string;
    };

export interface CommentItem {
  id: string;
  deck_id: string;
  target: CommentTarget;
  author: 'user' | 'agent';
  kind: 'revision' | 'question' | 'approval' | 'note';
  body: string;
  created_at: string;
  resolved_at?: string;
  resolved_by?: 'user' | 'agent';
  resolution_note?: string;
}

export interface ListCommentsResponse {
  deck_id: string;
  comment_count: number;
  comments: CommentItem[];
}

export interface AddCommentResponse {
  comment: CommentItem;
}

export interface ResolveCommentResponse {
  comment: CommentItem;
}

export type AssetScopeWire =
  | { type: 'soul'; soulId: string }
  | { type: 'deck'; deckId: string }
  | { type: 'global' };

export interface AssetItem {
  asset_id: string;
  name?: string;
  label?: string;
  ref?: string;
  filename?: string;
  mime_type: string;
  scope: AssetScopeWire;
  role: 'logo' | 'content';
  size_bytes: number;
  width?: number;
  height?: number;
  created_at: string;
  data_base64?: string;
}

export interface ListAssetsResponse {
  asset_count: number;
  assets: AssetItem[];
}

export interface GetAssetResponse {
  asset: AssetItem;
}

export interface UploadAssetResponse {
  asset: AssetItem;
}

export interface SessionActiveDeck {
  id: string;
  deck_id: string;
  slug: string;
  title: string;
  format: string;
  authoring_model: string;
}

export interface SessionActiveSoul {
  id: string;
  soul_id: string;
  slug: string;
  name: string;
  status: string;
}

export interface SessionResponse {
  active_deck?: SessionActiveDeck;
  active_soul?: SessionActiveSoul;
  active_workflow?: string;
  open_panels: string[];
  updated_at?: string;
}

export interface GetThumbnailResponse {
  png_base64: string;
  revision_hash: string;
}

// ── v4 document-mode section types ──────────────────────────────────────

export interface SectionListItem {
  id: string;
  position: number;
  kind: string;
  title: string;
  isValid: boolean;
  styleScore?: number;
}

export interface ListSectionsResponse {
  section_count: number;
  sections: SectionListItem[];
}

export interface SectionBreakHints {
  breakBefore?: 'auto' | 'page' | 'avoid';
  breakAfter?: 'auto' | 'page' | 'avoid';
  keepTogether?: boolean;
  fullPage?: boolean;
}

export interface SectionDetail {
  id: string;
  deck_id: string;
  position: number;
  kind: string;
  html: string;
  break_hints?: SectionBreakHints;
  metadata: {
    title?: string;
    narrative?: string;
    tags?: string[];
  };
  last_validation?: {
    passed: boolean;
    issues?: unknown[];
    styleScore?: { overall: number };
  };
  created_at?: string;
  updated_at?: string;
}

export interface GetSectionResponse {
  section: SectionDetail;
}

type ToolHandler = (payload: Record<string, unknown>) => void;
type ToolResultHandler = (result: ToolCallResult<Record<string, unknown>>) => void;

export class McpDeckEditorBridge implements DeckEditorBridge {
  private readonly app = new App(
    { name: 'pengui-slides-deck-editor', version: '0.1.0' },
    {},
    { autoResize: true },
  );
  private readonly toolInputHandlers = new Set<ToolHandler>();
  private readonly toolResultHandlers = new Set<ToolResultHandler>();

  constructor() {
    this.app.ontoolinput = ({ arguments: args }) => {
      this.toolInputHandlers.forEach((handler) => handler(args ?? {}));
    };

    this.app.ontoolresult = (result) => {
      this.toolResultHandlers.forEach((handler) => {
        handler(result as ToolCallResult<Record<string, unknown>>);
      });
    };

    this.app.onhostcontextchanged = (context) => {
      this.applyHostContext(context);
    };
  }

  async connect(): Promise<void> {
    await this.app.connect(new PostMessageTransport(window.parent, window.parent));
    this.applyHostContext(this.app.getHostContext());
  }

  onToolInput(handler: ToolHandler): () => void {
    this.toolInputHandlers.add(handler);
    return () => this.toolInputHandlers.delete(handler);
  }

  onToolResult(handler: ToolResultHandler): () => void {
    this.toolResultHandlers.add(handler);
    return () => this.toolResultHandlers.delete(handler);
  }

  async callTool<TStructured>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolCallResult<TStructured>> {
    return await this.app.callServerTool({
      name,
      arguments: args,
    }) as ToolCallResult<TStructured>;
  }

  async sendRevisionRequest(payload: RevisionPayload): Promise<void> {
    const hostCapabilities = this.app.getHostCapabilities();
    if (!hostCapabilities?.message) {
      throw new Error('This host does not support sending chat messages from MCP Apps.');
    }

    if (hostCapabilities.updateModelContext) {
      await this.app.updateModelContext({
        structuredContent: {
          revision_request: payload,
        },
      });
    }

    await this.app.sendMessage({
      role: 'user',
      content: [{
        type: 'text',
        text: buildRevisionPrompt(payload),
      }],
    });
  }

  /**
   * Nudge the host agent in chat after a user pins a comment. The agent
   * has `list_comments` and can fetch details itself — we just post a
   * concise user-authored message so the current turn has the context
   * it needs to act immediately instead of waiting for the next turn.
   *
   * No-op (silently) when the host doesn't support sendMessage, so
   * pinning still works on minimal hosts.
   */
  async notifyAgentOfComment(args: {
    deck_title: string;
    slide_title?: string;
    page_hint?: string;
    target_label: string;
    kind: string;
    body: string;
  }): Promise<boolean> {
    const caps = this.app.getHostCapabilities();
    if (!caps?.message) return false;

    const locationParts: string[] = [];
    if (args.slide_title) locationParts.push(`"${args.slide_title}"`);
    if (args.page_hint) locationParts.push(args.page_hint);
    const where = locationParts.length > 0 ? ` on ${locationParts.join(' ')}` : '';

    const text = [
      `I left a ${args.kind} comment${where} in "${args.deck_title}":`,
      `Target: ${args.target_label}`,
      `Note: ${args.body}`,
      '',
      'Please call list_comments to pick it up and address it.',
    ].join('\n');

    await this.app.sendMessage({
      role: 'user',
      content: [{ type: 'text', text }],
    });
    return true;
  }

  // ── v4 Wave 2 typed tool methods ─────────────────────────────────────────

  /** List all decks in the workspace (newest first). */
  async listDecks(): Promise<ListDecksResponse> {
    const r = await this.callTool<ListDecksResponse>('list_decks', {});
    return r.structuredContent ?? { deck_count: 0, decks: [] };
  }

  /** List all design souls. */
  async listDesignSouls(): Promise<ListDesignSoulsResponse> {
    const r = await this.callTool<ListDesignSoulsResponse>('list_design_souls', {});
    return r.structuredContent ?? { souls: [] };
  }

  /** Get full detail for one design soul. */
  async getDesignSoul(soulRef: string): Promise<GetDesignSoulResponse> {
    const r = await this.callTool<GetDesignSoulResponse>('get_design_soul', { soul_ref: soulRef });
    if (!r.structuredContent?.soul) throw new Error('No soul returned');
    return r.structuredContent;
  }

  /** List comments for a deck. Pass `resolved: 'all'` to see closed items too. */
  async listComments(
    deckId: string,
    opts: {
      resolved?: 'unresolved' | 'resolved' | 'all';
      target_kind?: 'slide' | 'section' | 'ir_node';
    } = {},
  ): Promise<ListCommentsResponse> {
    const args: Record<string, unknown> = { deck_id: deckId };
    if (opts.resolved) args.resolved = opts.resolved;
    if (opts.target_kind) args.target_kind = opts.target_kind;
    const r = await this.callTool<ListCommentsResponse>('list_comments', args);
    return r.structuredContent ?? { deck_id: deckId, comment_count: 0, comments: [] };
  }

  /** Add a comment from the model side (agent-authored). */
  async addComment(args: {
    deck_id: string;
    target: CommentTarget;
    kind: CommentItem['kind'];
    body: string;
  }): Promise<AddCommentResponse> {
    const r = await this.callTool<AddCommentResponse>('add_comment', args);
    if (!r.structuredContent?.comment) throw new Error('add_comment returned no comment');
    return r.structuredContent;
  }

  /** Resolve a comment. `resolved_by` defaults to 'agent' server-side. */
  async resolveComment(args: {
    comment_id: string;
    resolved_by?: 'user' | 'agent';
    resolution_note?: string;
  }): Promise<ResolveCommentResponse> {
    const r = await this.callTool<ResolveCommentResponse>('resolve_comment', args);
    if (!r.structuredContent?.comment) throw new Error('resolve_comment returned no comment');
    return r.structuredContent;
  }

  /** List assets (optionally filtered). */
  async listAssets(args: { scope_type?: 'soul' | 'deck' | 'global'; role?: 'logo' | 'content' } = {}): Promise<ListAssetsResponse> {
    const r = await this.callTool<ListAssetsResponse>('list_assets', args);
    return r.structuredContent ?? { asset_count: 0, assets: [] };
  }

  /** Get a single asset (with data). */
  async getAsset(assetId: string): Promise<GetAssetResponse> {
    const r = await this.callTool<GetAssetResponse>('get_asset', { asset_id: assetId });
    if (!r.structuredContent?.asset) throw new Error('get_asset returned no asset');
    return r.structuredContent;
  }

  /** Get the current session state. */
  async getSession(): Promise<SessionResponse> {
    const r = await this.callTool<SessionResponse>('get_session', {});
    return r.structuredContent ?? { open_panels: [] };
  }

  // ── Planned app-only tools (agents A+C write their server side concurrently) ──

  /** Set the active workspace context (deck, soul, workflow, open panels). */
  async setActiveWorkspace(args: {
    deck_ref?: string | null;
    soul_ref?: string | null;
    workflow?: 'create-presentation' | 'create-document' | null;
    open_panels?: string[];
  }): Promise<SessionResponse> {
    const r = await this.callTool<SessionResponse>('set_active_workspace', args);
    return r.structuredContent ?? { open_panels: [] };
  }

  /** Upload an asset directly from the app (base64 encoded). */
  async uploadAssetFromApp(args: {
    data_base64: string;
    mime_type: 'image/png' | 'image/jpeg' | 'image/svg+xml' | 'image/webp';
    scope:
      | { type: 'soul'; soul_ref: string }
      | { type: 'deck'; deck_ref: string }
      | { type: 'global' };
    role: 'logo' | 'content';
    label?: string;
  }): Promise<UploadAssetResponse> {
    const r = await this.callTool<UploadAssetResponse>('upload_asset_from_app', args);
    if (!r.structuredContent?.asset) throw new Error('upload_asset_from_app returned no asset');
    return r.structuredContent;
  }

  /** Apply a token override to a soul layer. */
  async applyTokenOverride(args: {
    soul_ref: string;
    layer: string;
    token_name: string;
    value: string;
  }): Promise<void> {
    await this.callTool('apply_token_override', args);
  }

  /** List sections for a document-mode deck (no HTML). */
  async listSections(deckRef: string): Promise<ListSectionsResponse> {
    const r = await this.callTool<ListSectionsResponse>('list_sections', { deck_id: deckRef });
    return r.structuredContent ?? { section_count: 0, sections: [] };
  }

  /** Get one section with its HTML + break hints. */
  async getSection(sectionId: string): Promise<GetSectionResponse> {
    const r = await this.callTool<GetSectionResponse>('get_section', { section_id: sectionId });
    if (!r.structuredContent?.section) throw new Error('get_section returned no section');
    return r.structuredContent;
  }

  /** Apply a block edit (section_kind, break_hints, chrome_config). */
  async applyBlockEdit(
    args:
      | { kind: 'section_kind'; deck_ref: string; section_id: string; new_kind: string }
      | { kind: 'break_hints'; deck_ref: string; section_id: string; hints: { break_before?: string; break_after?: string; keep_together?: boolean; full_page?: boolean } }
      | { kind: 'chrome_config'; deck_ref: string; chrome: Record<string, unknown> },
  ): Promise<{ deck?: unknown; section?: unknown } | undefined> {
    const r = await this.callTool<{ deck?: unknown; section?: unknown }>('apply_block_edit', args);
    return r.structuredContent;
  }

  /** Update deck-level document meta (chrome, TOC, page margins). */
  async updateDocumentMeta(args: { deck_id: string; meta: Record<string, unknown> }): Promise<void> {
    await this.callTool('update_document_meta', args);
  }

  /** Get a PNG thumbnail for a deck, slide, or section. */
  async getThumbnail(args: {
    deck_ref: string;
    slide_id?: string;
    section_id?: string;
  }): Promise<GetThumbnailResponse> {
    const r = await this.callTool<GetThumbnailResponse>('get_thumbnail', args);
    if (!r.structuredContent?.png_base64) throw new Error('get_thumbnail returned no image');
    return r.structuredContent;
  }

  /** Add a comment authored by the user (from the app, not the model). */
  async addCommentFromApp(args: {
    deck_id: string;
    target: CommentTarget;
    kind: CommentItem['kind'];
    body: string;
    view_uuid?: string;
    scroll_snapshot?: string;
  }): Promise<AddCommentResponse> {
    const r = await this.callTool<AddCommentResponse>('add_comment_from_app', args);
    if (!r.structuredContent?.comment) throw new Error('add_comment_from_app returned no comment');
    return r.structuredContent;
  }

  private applyHostContext(context: ReturnType<App['getHostContext']>): void {
    if (!context) {
      return;
    }

    if (context.theme) {
      applyDocumentTheme(context.theme);
    }

    if (context.styles?.variables) {
      applyHostStyleVariables(context.styles.variables, document.documentElement);
    }

    if (context.styles?.css?.fonts) {
      applyHostFonts(context.styles.css.fonts);
    }
  }
}
