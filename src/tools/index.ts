/**
 * Master tool registry for Pengui Slides MCP Server.
 *
 * Imports and registers all MCP tools:
 *   soul tools, deck tools, asset tools, validation tools, export tools,
 *   and MCP App editor tools.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServiceContainer } from '../container.js';

// Soul tools
import { registerRegisterDesignSoulTool } from './souls/register-design-soul.tool.js';
import { registerApproveDesignSoulTool } from './souls/approve-design-soul.tool.js';
import { registerListDesignSoulsTool } from './souls/list-design-souls.tool.js';
import { registerGetDesignSoulTool } from './souls/get-design-soul.tool.js';
import { registerGetDesignTokensTool } from './souls/get-design-tokens.tool.js';
import { registerSaveAsTemplateTool } from './souls/save-as-template.tool.js';

// Deck tools
import { registerCreateDeckTool } from './decks/create-deck.tool.js';
import { registerAddSlideTool } from './decks/add-slide.tool.js';
import { registerUpdateSlideTool } from './decks/update-slide.tool.js';
import { registerGetSlideTool } from './decks/get-slide.tool.js';
import { registerRemoveSlideTool } from './decks/remove-slide.tool.js';
import { registerReorderSlidesTool } from './decks/reorder-slides.tool.js';
import { registerGetDeckSummaryTool } from './decks/get-deck-summary.tool.js';
import { registerListDecksTool } from './decks/list-decks.tool.js';
import { registerAddSectionTool } from './decks/add-section.tool.js';
import { registerUpdateSectionTool } from './decks/update-section.tool.js';
import { registerGetSectionTool } from './decks/get-section.tool.js';
import { registerRemoveSectionTool } from './decks/remove-section.tool.js';
import { registerReorderSectionsTool } from './decks/reorder-sections.tool.js';
import { registerListSectionsTool } from './decks/list-sections.tool.js';
import { registerUpdateDocumentMetaTool } from './decks/update-document-meta.tool.js';
import { registerApplySlideNodeEditTool } from './decks/apply-slide-node-edit.tool.js';
import { registerApplySectionNodeEditTool } from './decks/apply-section-node-edit.tool.js';
import { registerApplySlideFieldEditTool } from './decks/apply-slide-field-edit.tool.js';
import { registerApplySectionFieldEditTool } from './decks/apply-section-field-edit.tool.js';
import { registerApplyRecipeTool } from './decks/apply-recipe.tool.js';
import { registerCompileMarkdownTool } from './decks/compile-markdown.tool.js';
import { registerCompileChartTool } from './decks/compile-chart.tool.js';
import {
  registerInsertSlideNodeTool,
  registerRemoveSlideNodeTool,
  registerDuplicateSlideNodeTool,
  registerMoveSlideNodeTool,
} from './decks/slide-structural-ops.tool.js';
import {
  registerInsertSectionNodeTool,
  registerRemoveSectionNodeTool,
  registerDuplicateSectionNodeTool,
  registerMoveSectionNodeTool,
} from './decks/section-structural-ops.tool.js';

// Validation tools
import { registerValidateSlideTool } from './validation/validate-slide.tool.js';
import { registerValidateSectionTool } from './validation/validate-section.tool.js';
import {
  registerValidateSlideIRTool,
  registerValidateSectionIRTool,
} from './validation/validate-slide-ir.tool.js';
import { registerValidateDeckForExportTool } from './validation/validate-deck-for-export.tool.js';

// Resource-access tools (v4.7) — wrap MCP resources for clients that only consume tools
import { registerListResourcesTool } from './resources/list-resources.tool.js';
import { registerGetResourceTool } from './resources/get-resource.tool.js';

// Asset tools
import { registerUploadAssetTool } from './assets/upload-asset.tool.js';
import { registerListAssetsTool } from './assets/list-assets.tool.js';
import { registerGetAssetTool } from './assets/get-asset.tool.js';
import { registerDeleteAssetTool } from './assets/delete-asset.tool.js';

// Export tools
import { registerRenderPreviewTool } from './export/render-preview.tool.js';
import { registerRenderSectionPreviewTool } from './export/render-section-preview.tool.js';
import { registerExportPptxTool } from './export/export-pptx.tool.js';
import { registerExportPdfTool } from './export/export-pdf.tool.js';
import { registerExportHtmlTool } from './export/export-html.tool.js';
import { registerExportGoogleSlidesTool } from './export/export-google-slides.tool.js';

// Comment tools (v4)
import { registerListCommentsTool } from './comments/list-comments.tool.js';
import { registerAddCommentTool } from './comments/add-comment.tool.js';
import { registerResolveCommentTool } from './comments/resolve-comment.tool.js';

// Session tools (v4)
import { registerGetSessionTool } from './session/get-session.tool.js';

// MCP App tools
import { registerAddCommentFromAppTool } from './app/add-comment-from-app.tool.js';
import { registerApplyBlockEditTool } from './app/apply-block-edit.tool.js';
import { registerApplyTextEditTool } from './app/apply-text-edit.tool.js';
import { registerApplyTokenOverrideTool } from './app/apply-token-override.tool.js';
import { registerGetEditorStateTool } from './app/get-editor-state.tool.js';
import { registerGetThumbnailTool } from './app/get-thumbnail.tool.js';
import { registerOpenDeckEditorTool } from './app/open-deck-editor.tool.js';
import { registerSetActiveWorkspaceTool } from './app/set-active-workspace.tool.js';
import { registerUploadAssetFromAppTool } from './app/upload-asset-from-app.tool.js';

export function registerAllTools(server: McpServer, container: ServiceContainer): void {
  // Soul tools
  registerRegisterDesignSoulTool(server, container);
  registerApproveDesignSoulTool(server, container);
  registerListDesignSoulsTool(server, container);
  registerGetDesignSoulTool(server, container);
  registerGetDesignTokensTool(server, container);
  registerSaveAsTemplateTool(server, container);

  // Deck tools
  registerCreateDeckTool(server, container);
  registerAddSlideTool(server, container);
  registerUpdateSlideTool(server, container);
  registerGetSlideTool(server, container);
  registerRemoveSlideTool(server, container);
  registerReorderSlidesTool(server, container);
  registerGetDeckSummaryTool(server, container);
  registerListDecksTool(server, container);
  registerApplySlideNodeEditTool(server, container);
  registerApplySlideFieldEditTool(server, container);
  registerApplyRecipeTool(server, container);
  registerCompileMarkdownTool(server, container);
  registerCompileChartTool(server, container);
  registerInsertSlideNodeTool(server, container);
  registerRemoveSlideNodeTool(server, container);
  registerDuplicateSlideNodeTool(server, container);
  registerMoveSlideNodeTool(server, container);

  // Document (continuous-document mode) tools
  registerAddSectionTool(server, container);
  registerUpdateSectionTool(server, container);
  registerGetSectionTool(server, container);
  registerRemoveSectionTool(server, container);
  registerReorderSectionsTool(server, container);
  registerListSectionsTool(server, container);
  registerUpdateDocumentMetaTool(server, container);
  registerApplySectionNodeEditTool(server, container);
  registerApplySectionFieldEditTool(server, container);
  registerInsertSectionNodeTool(server, container);
  registerRemoveSectionNodeTool(server, container);
  registerDuplicateSectionNodeTool(server, container);
  registerMoveSectionNodeTool(server, container);

  // Asset tools
  registerUploadAssetTool(server, container);
  registerListAssetsTool(server, container);
  registerGetAssetTool(server, container);
  registerDeleteAssetTool(server, container);

  // Validation tools
  registerValidateSlideTool(server, container);
  registerValidateSectionTool(server, container);
  registerValidateSlideIRTool(server);
  registerValidateSectionIRTool(server);
  registerValidateDeckForExportTool(server, container);

  // Resource-access tools (v4.7)
  registerListResourcesTool(server);
  registerGetResourceTool(server);

  // Export tools
  registerRenderPreviewTool(server, container);
  registerRenderSectionPreviewTool(server, container);
  registerExportPptxTool(server, container);
  registerExportPdfTool(server, container);
  registerExportHtmlTool(server, container);
  registerExportGoogleSlidesTool(server, container);

  // Comment tools (v4)
  registerListCommentsTool(server, container);
  registerAddCommentTool(server, container);
  registerResolveCommentTool(server, container);

  // Session tools (v4)
  registerGetSessionTool(server, container);

  // MCP App tools (alphabetical)
  registerAddCommentFromAppTool(server, container);
  registerApplyBlockEditTool(server, container);
  registerApplyTextEditTool(server, container);
  registerApplyTokenOverrideTool(server, container);
  registerGetEditorStateTool(server, container);
  registerGetThumbnailTool(server, container);
  registerOpenDeckEditorTool(server, container);
  registerSetActiveWorkspaceTool(server, container);
  registerUploadAssetFromAppTool(server, container);
}
