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

export type CommentTarget =
  | { kind: 'slide'; slide_id: string }
  | { kind: 'section'; section_id: string }
  | { kind: 'element'; container_id: string; edit_id: string };

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
      target_kind?: 'slide' | 'section' | 'element';
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

  /** Apply a block edit (section_kind, break_hints, chrome_config). */
  async applyBlockEdit(args: Record<string, unknown>): Promise<void> {
    await this.callTool('apply_block_edit', args);
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
