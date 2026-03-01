/**
 * Master tool registry for Pengui Slides MCP Server.
 *
 * Imports and registers all 16 MCP tools:
 *   4 soul tools + 7 deck tools + 1 validation tool + 4 export tools.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServiceContainer } from '../container.js';

// Soul tools
import { registerRegisterDesignSoulTool } from './souls/register-design-soul.tool.js';
import { registerApproveDesignSoulTool } from './souls/approve-design-soul.tool.js';
import { registerListDesignSoulsTool } from './souls/list-design-souls.tool.js';
import { registerGetDesignSoulTool } from './souls/get-design-soul.tool.js';

// Deck tools
import { registerCreateDeckTool } from './decks/create-deck.tool.js';
import { registerAddSlideTool } from './decks/add-slide.tool.js';
import { registerUpdateSlideTool } from './decks/update-slide.tool.js';
import { registerGetSlideTool } from './decks/get-slide.tool.js';
import { registerRemoveSlideTool } from './decks/remove-slide.tool.js';
import { registerReorderSlidesTool } from './decks/reorder-slides.tool.js';
import { registerGetDeckSummaryTool } from './decks/get-deck-summary.tool.js';

// Validation tools
import { registerValidateSlideTool } from './validation/validate-slide.tool.js';

// Export tools
import { registerRenderPreviewTool } from './export/render-preview.tool.js';
import { registerExportPptxTool } from './export/export-pptx.tool.js';
import { registerExportPdfTool } from './export/export-pdf.tool.js';
import { registerExportHtmlTool } from './export/export-html.tool.js';

export function registerAllTools(server: McpServer, container: ServiceContainer): void {
  // Soul tools
  registerRegisterDesignSoulTool(server, container);
  registerApproveDesignSoulTool(server, container);
  registerListDesignSoulsTool(server, container);
  registerGetDesignSoulTool(server, container);

  // Deck tools
  registerCreateDeckTool(server, container);
  registerAddSlideTool(server, container);
  registerUpdateSlideTool(server, container);
  registerGetSlideTool(server, container);
  registerRemoveSlideTool(server, container);
  registerReorderSlidesTool(server, container);
  registerGetDeckSummaryTool(server, container);

  // Validation tools
  registerValidateSlideTool(server, container);

  // Export tools
  registerRenderPreviewTool(server, container);
  registerExportPptxTool(server, container);
  registerExportPdfTool(server, container);
  registerExportHtmlTool(server, container);
}
