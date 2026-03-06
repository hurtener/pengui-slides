import {
  App,
  PostMessageTransport,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
} from '@modelcontextprotocol/ext-apps';
import { buildRevisionPrompt } from './revise';
import type { DeckEditorBridge, RevisionPayload, ToolCallResult } from './types';

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
