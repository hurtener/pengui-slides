/**
 * MCP Tool: get_session
 *
 * Returns the active workspace session — which deck, soul, and workflow
 * the user is currently focused on in the MCP App. Agents use this to
 * skip asking "which deck?" every turn.
 *
 * Ephemeral and in-memory: if the server restarts or no app is open,
 * the fields are empty. Callers should treat missing fields as "ask
 * the user" rather than "no such thing."
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import type { ServiceContainer } from '../../container.js';
import { BUILD_INFO } from '../../build-info.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';

export function registerGetSessionTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'get_session',
    {
      title: 'Get Session',
      description:
        'Return the currently active workspace session as declared by the MCP App: ' +
        'active_deck (id + slug + title + format + authoring_model), active_soul (id + ' +
        'slug + name + status), active_workflow, and open_panels. All fields are OPTIONAL ' +
        '— missing means "the app hasn\'t declared one." Use this to avoid re-asking the ' +
        'user which deck/soul to work with; fall back to list_decks / list_design_souls ' +
        'when a slot is empty. Also returns build_info {server_version, build_sha, ' +
        'build_time, git_dirty} for the running process. Use build_time to detect a ' +
        'stale-build session: if the user just ran `npm run build:server` but build_time ' +
        'pre-dates that, Claude Desktop is still serving the old process and must be ' +
        'restarted before new code takes effect.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const session = await container.editorService.getSession();
        return structuredResponse({
          ...(session.activeDeck
            ? {
                active_deck: {
                  id: session.activeDeck.id,
                  deck_id: session.activeDeck.id,
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
                  soul_id: session.activeSoul.id,
                  slug: session.activeSoul.slug,
                  name: session.activeSoul.name,
                  status: session.activeSoul.status,
                },
              }
            : {}),
          ...(session.activeWorkflow ? { active_workflow: session.activeWorkflow } : {}),
          open_panels: session.openPanels,
          ...(session.updatedAt ? { updated_at: session.updatedAt } : {}),
          build_info: BUILD_INFO,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
