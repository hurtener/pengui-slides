/**
 * MCP Tools: insert_section_node / remove_section_node /
 *            duplicate_section_node / move_section_node
 *
 * v4.9 — section-mode mirror of `slide-structural-ops.tool.ts`. Each
 * tool wraps a pure IR operation, routes through
 * `DocumentService.{insert,remove,duplicate,move}SectionNode` so
 * mode-aware lint / Stage 1 validation / revision tracking all run,
 * and migrates pinned comment paths inside the section.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { soulId } from '../../types/common.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import {
  SlideNodeSchema,
  migratePathAfterDuplicate,
  migratePathAfterInsert,
  migratePathAfterMove,
  migratePathAfterRemove,
} from '../../domain/ir/index.js';

const PATH_STEP = z.union([z.string(), z.number().int().nonnegative()]);
const TARGET_PATH = z.array(PATH_STEP).min(2);
const PARENT_PATH = z.array(PATH_STEP).min(1);
const POSITION = z.number().int().nonnegative();

async function revalidateSection(
  container: ServiceContainer,
  deckId: string,
  sectionId: string,
) {
  const section = await container.documentService.getSection(sectionId);
  const summary = await container.deckService.getDeckSummary(deckId);
  const validation = await container.validationService.validateSection(
    { id: section.id, kind: section.kind, html: section.html },
    soulId(summary.soulId as string),
    summary.format,
  );
  return {
    passed: validation.passed,
    error_count: validation.errorCount,
    warning_count: validation.warningCount,
    issues: validation.issues,
  };
}

export function registerInsertSectionNodeTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'insert_section_node',
    {
      title: 'Insert Section Node',
      description:
        'Insert a new IR node into a section. Mirror of `insert_slide_node` for document-mode ' +
        'decks. Slide-only nodes (section_divider) are rejected by doc-mode lint.',
      inputSchema: z.object({
        deck_id: z.string(),
        section_id: z.string(),
        parent_path: PARENT_PATH,
        position: POSITION,
        new_node: SlideNodeSchema,
      }),
    },
    async ({ deck_id, section_id, parent_path, position, new_node }) => {
      try {
        const section = await container.documentService.insertSectionNode({
          deckId: deck_id,
          sectionId: section_id,
          parentPath: parent_path,
          position,
          newNode: new_node,
        });
        await container.commentService.migrateIrPathsForContainer(deck_id, section_id, (p) =>
          migratePathAfterInsert(p, parent_path, position),
        );
        const validation = await revalidateSection(container, deck_id, section_id);
        return structuredResponse({
          section_id: section.id as string,
          kind: section.kind,
          position: section.position,
          inserted_path: [...parent_path, position],
          validation,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}

export function registerRemoveSectionNodeTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'remove_section_node',
    {
      title: 'Remove Section Node',
      description:
        'Delete a node from a section IR. Subsequent siblings shift left by one; pinned comments ' +
        'inside the deleted subtree are orphaned.',
      inputSchema: z.object({
        deck_id: z.string(),
        section_id: z.string(),
        path: TARGET_PATH,
      }),
    },
    async ({ deck_id, section_id, path }) => {
      try {
        const section = await container.documentService.removeSectionNode({
          deckId: deck_id,
          sectionId: section_id,
          path,
        });
        const migration = await container.commentService.migrateIrPathsForContainer(
          deck_id,
          section_id,
          (p) => migratePathAfterRemove(p, path),
        );
        const validation = await revalidateSection(container, deck_id, section_id);
        return structuredResponse({
          section_id: section.id as string,
          kind: section.kind,
          position: section.position,
          removed_path: path,
          orphaned_comments: migration.orphanedCount,
          validation,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}

export function registerDuplicateSectionNodeTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'duplicate_section_node',
    {
      title: 'Duplicate Section Node',
      description:
        'Clone a node within its container. Default destination is right after the source.',
      inputSchema: z.object({
        deck_id: z.string(),
        section_id: z.string(),
        path: TARGET_PATH,
        position: POSITION.optional(),
      }),
    },
    async ({ deck_id, section_id, path, position }) => {
      try {
        const section = await container.documentService.duplicateSectionNode({
          deckId: deck_id,
          sectionId: section_id,
          path,
          position,
        });
        const sourceIdx = path[path.length - 1];
        const clonePos = position ?? (typeof sourceIdx === 'number' ? sourceIdx + 1 : 0);
        await container.commentService.migrateIrPathsForContainer(deck_id, section_id, (p) =>
          migratePathAfterDuplicate(p, path, clonePos),
        );
        const validation = await revalidateSection(container, deck_id, section_id);
        const parentPath = path.slice(0, -1);
        return structuredResponse({
          section_id: section.id as string,
          kind: section.kind,
          position: section.position,
          source_path: path,
          clone_path: [...parentPath, clonePos],
          validation,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}

export function registerMoveSectionNodeTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'move_section_node',
    {
      title: 'Move Section Node',
      description:
        'Move a node within or across containers. Mirror of `move_slide_node`. Cannot move a ' +
        'node into its own subtree. Pinned comments follow the moved subtree.',
      inputSchema: z.object({
        deck_id: z.string(),
        section_id: z.string(),
        from_path: TARGET_PATH,
        to_parent_path: PARENT_PATH,
        to_position: POSITION,
      }),
    },
    async ({ deck_id, section_id, from_path, to_parent_path, to_position }) => {
      try {
        const { section, newPath } = await container.documentService.moveSectionNode({
          deckId: deck_id,
          sectionId: section_id,
          fromPath: from_path,
          toParentPath: to_parent_path,
          toPosition: to_position,
        });
        await container.commentService.migrateIrPathsForContainer(deck_id, section_id, (p) =>
          migratePathAfterMove(p, from_path, to_parent_path, to_position),
        );
        const validation = await revalidateSection(container, deck_id, section_id);
        return structuredResponse({
          section_id: section.id as string,
          kind: section.kind,
          position: section.position,
          new_path: newPath,
          validation,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
