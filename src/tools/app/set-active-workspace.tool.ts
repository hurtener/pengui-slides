/**
 * MCP App Tool: set_active_workspace
 *
 * App-only tool (visibility: ['app']). Called by the MCP App when the user
 * switches decks, souls, or workflows. Updates the in-memory session so that
 * model-visible tools like `get_session` can surface the active context
 * without re-asking every turn.
 */

import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import { DECK_EDITOR_RESOURCE_URI } from '../../resources/app-resources.js';
import { handleToolError } from '../_shared/error-handler.js';
import { structuredResponse } from '../_shared/responses.js';

export function registerSetActiveWorkspaceTool(server: McpServer, container: ServiceContainer): void {
  registerAppTool(
    server,
    'set_active_workspace',
    {
      title: 'Set Active Workspace',
      description:
        'Update the active workspace session — which deck, soul, and workflow the MCP App is ' +
        'currently focused on. Nullable fields clear the corresponding slot. The updated session ' +
        'is returned and reflected in subsequent get_session calls.',
      inputSchema: z.object({
        deck_ref: z
          .string()
          .nullish()
          .describe('Deck UUID or slug to activate. Pass null to clear the active deck.'),
        soul_ref: z
          .string()
          .nullish()
          .describe('Soul UUID or slug to activate. Pass null to clear the active soul.'),
        workflow: z
          .enum(['create-presentation', 'create-document'])
          .nullish()
          .describe('Active workflow hint. Pass null to clear.'),
        open_panels: z
          .array(z.string())
          .optional()
          .describe('Which app route/panel paths are currently open.'),
      }),
      _meta: {
        ui: {
          resourceUri: DECK_EDITOR_RESOURCE_URI,
          visibility: ['app'],
        },
      },
    },
    async ({ deck_ref, soul_ref, workflow, open_panels }) => {
      try {
        const session = await container.editorService.setActiveWorkspace({
          deckRef: deck_ref === undefined ? undefined : (deck_ref ?? null),
          soulRef: soul_ref === undefined ? undefined : (soul_ref ?? null),
          workflow: workflow === undefined ? undefined : (workflow ?? null),
          openPanels: open_panels,
        });

        return structuredResponse(
          {
            ...(session.activeDeck
              ? {
                  active_deck: {
                    id: session.activeDeck.id,
                    slug: session.activeDeck.slug,
                    title: session.activeDeck.title,
                    format: session.activeDeck.format,
                    authoring_model: session.activeDeck.authoringModel,
                  },
                }
              : {}),
            ...(session.activeSoul
              ? {
                  active_soul: {
                    id: session.activeSoul.id,
                    slug: session.activeSoul.slug,
                    name: session.activeSoul.name,
                    status: session.activeSoul.status,
                  },
                }
              : {}),
            ...(session.activeWorkflow ? { active_workflow: session.activeWorkflow } : {}),
            open_panels: session.openPanels,
            ...(session.updatedAt ? { updated_at: session.updatedAt } : {}),
          },
          'Active workspace updated',
        );
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
