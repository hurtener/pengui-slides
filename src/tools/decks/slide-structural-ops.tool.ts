/**
 * MCP Tools: insert_slide_node / remove_slide_node / duplicate_slide_node /
 *            move_slide_node
 *
 * v4.9 — direct-manipulation primitives. Each tool wraps a pure IR
 * operation in `src/domain/ir/operations/` and routes through
 * `DeckService.{insert,remove,duplicate,move}SlideNode` so mode-aware
 * lint, validation, and revision tracking all run as normal.
 *
 * After each mutation the comment service migrates `ir_node` pin paths
 * for the affected slide so existing pins follow shifted siblings or
 * re-rooted subtrees instead of silently pointing at the wrong node.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { soulId } from '../../types/common.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import {
  SlideNodeSchema,
  migratePathAfterDuplicate,
  migratePathAfterInsert,
  migratePathAfterMove,
  migratePathAfterRemove,
} from '../../domain/ir/index.js';
import {
  buildValidationDelta,
  buildValidationPresentation,
} from '../../domain/validation/validation-presentation.js';

const PATH_STEP = z.union([z.string(), z.number().int().nonnegative()]);

const TARGET_PATH = z
  .array(PATH_STEP)
  .min(2)
  .describe(
    'Path addressing a node. Examples: ["body", 0]; ["body", 2, "left", 1]; ' +
      '["body", 3, "cells", 0, 1].',
  );

const PARENT_PATH = z
  .array(PATH_STEP)
  .min(1)
  .describe(
    'Path addressing a container. ["body"]; ["body", 2, "left"]; ' +
      '["body", 3, "cells", 1] (a single grid row).',
  );

const POSITION = z
  .number()
  .int()
  .nonnegative()
  .describe('Index inside the container; 0 = before everything; container.length = append.');

// ── Validation runner shared by all four tools ──────────────────────

async function revalidate(
  container: ServiceContainer,
  deckId: string,
  slideId: string,
): Promise<{ validation: ReturnType<typeof buildValidationDelta>; validationDelta: ReturnType<typeof buildValidationDelta>; validationPresentation: ReturnType<typeof buildValidationPresentation> }> {
  const before = await container.deckService.getSlide(slideId);
  const previousValidation = before.lastValidation ?? null;
  const summary = await container.deckService.getDeckSummary(deckId);
  const validation = await container.validationService.validateSlide(
    before.html,
    soulId(summary.soulId as string),
    'lint',
    summary.format,
  );
  await container.deckService.updateSlide({
    deckId,
    slideId,
    lastValidation: validation,
  });
  const validationDelta = buildValidationDelta(validation, previousValidation);
  const validationPresentation = buildValidationPresentation(validationDelta);
  return {
    validation: validation as never,
    validationDelta,
    validationPresentation,
  };
}

// ── insert_slide_node ───────────────────────────────────────────────

export function registerInsertSlideNodeTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'insert_slide_node',
    {
      title: 'Insert Slide Node',
      description:
        'Insert a new IR node into a slide at the given parent + position. Existing siblings ' +
        'at and after `position` shift right by one. Pinned comments inside the same container ' +
        'have their `ir_path` rewritten so they follow the shift.\n\n' +
        'INPUT — `parent_path` addresses the container (e.g. ["body"], ["body", 2, "left"], ' +
        '["body", 3, "cells", 1]). `position` is 0-indexed; pass `container.length` to append. ' +
        '`new_node` follows the IR schema (`pengui://schema/slide-ir`). Inside two_column / grid ' +
        'cells the new node must be a LEAF (no nested layout containers). Doc-only nodes ' +
        '(toc / bibliography / page_break) are rejected by slide-mode lint.',
      inputSchema: z.object({
        deck_id: z.string(),
        slide_id: z.string(),
        parent_path: PARENT_PATH,
        position: POSITION,
        new_node: SlideNodeSchema,
      }),
    },
    async ({ deck_id, slide_id, parent_path, position, new_node }) => {
      try {
        const slide = await container.deckService.insertSlideNode({
          deckId: deck_id,
          slideId: slide_id,
          parentPath: parent_path,
          position,
          newNode: new_node,
        });
        await container.commentService.migrateIrPathsForContainer(deck_id, slide_id, (p) =>
          migratePathAfterInsert(p, parent_path, position),
        );
        const v = await revalidate(container, deck_id, slide_id);
        return textResponse({
          slide_id: slide.id,
          inserted_path: [...parent_path, position],
          source_kind: slide.sourceKind,
          validation: v.validation,
          validation_delta: v.validationDelta,
          validation_presentation: v.validationPresentation,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}

// ── remove_slide_node ───────────────────────────────────────────────

export function registerRemoveSlideNodeTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'remove_slide_node',
    {
      title: 'Remove Slide Node',
      description:
        'Delete a node from a slide IR. Subsequent siblings shift left by one; pinned comments ' +
        'inside the deleted subtree are orphaned (their target downgrades to the slide so the ' +
        'body text stays visible).',
      inputSchema: z.object({
        deck_id: z.string(),
        slide_id: z.string(),
        path: TARGET_PATH,
      }),
    },
    async ({ deck_id, slide_id, path }) => {
      try {
        const slide = await container.deckService.removeSlideNode({
          deckId: deck_id,
          slideId: slide_id,
          path,
        });
        const migration = await container.commentService.migrateIrPathsForContainer(
          deck_id,
          slide_id,
          (p) => migratePathAfterRemove(p, path),
        );
        const v = await revalidate(container, deck_id, slide_id);
        return textResponse({
          slide_id: slide.id,
          removed_path: path,
          orphaned_comments: migration.orphanedCount,
          source_kind: slide.sourceKind,
          validation: v.validation,
          validation_delta: v.validationDelta,
          validation_presentation: v.validationPresentation,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}

// ── duplicate_slide_node ────────────────────────────────────────────

export function registerDuplicateSlideNodeTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'duplicate_slide_node',
    {
      title: 'Duplicate Slide Node',
      description:
        'Clone a node within its container. Default destination is right after the source ' +
        '(`position = sourceIndex + 1`); pass an explicit `position` to insert elsewhere. The ' +
        'clone is structurally independent (deep copy).',
      inputSchema: z.object({
        deck_id: z.string(),
        slide_id: z.string(),
        path: TARGET_PATH,
        position: POSITION.optional(),
      }),
    },
    async ({ deck_id, slide_id, path, position }) => {
      try {
        const slide = await container.deckService.duplicateSlideNode({
          deckId: deck_id,
          slideId: slide_id,
          path,
          position,
        });
        const sourceIdx = path[path.length - 1];
        const clonePos = position ?? (typeof sourceIdx === 'number' ? sourceIdx + 1 : 0);
        await container.commentService.migrateIrPathsForContainer(deck_id, slide_id, (p) =>
          migratePathAfterDuplicate(p, path, clonePos),
        );
        const v = await revalidate(container, deck_id, slide_id);
        const parentPath = path.slice(0, -1);
        return textResponse({
          slide_id: slide.id,
          source_path: path,
          clone_path: [...parentPath, clonePos],
          source_kind: slide.sourceKind,
          validation: v.validation,
          validation_delta: v.validationDelta,
          validation_presentation: v.validationPresentation,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}

// ── move_slide_node ─────────────────────────────────────────────────

export function registerMoveSlideNodeTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'move_slide_node',
    {
      title: 'Move Slide Node',
      description:
        'Move a node to a different position within or across containers. Cross-container moves ' +
        '(e.g. body → two_column.left) are subject to the leaf-only rule for layout containers. ' +
        'The same-container reorder semantics: `to_position` is interpreted POST-removal, so ' +
        'dropping after sibling N matches the user\'s drag-and-drop intent.\n\n' +
        'Pinned comments inside the moved subtree have their paths re-rooted to the destination; ' +
        'pins on shifted siblings have their indices adjusted. RETURNS — `{ slide_id, new_path, ' +
        '... }`. Cannot move a node into its own subtree.',
      inputSchema: z.object({
        deck_id: z.string(),
        slide_id: z.string(),
        from_path: TARGET_PATH,
        to_parent_path: PARENT_PATH,
        to_position: POSITION,
      }),
    },
    async ({ deck_id, slide_id, from_path, to_parent_path, to_position }) => {
      try {
        const { slide, newPath } = await container.deckService.moveSlideNode({
          deckId: deck_id,
          slideId: slide_id,
          fromPath: from_path,
          toParentPath: to_parent_path,
          toPosition: to_position,
        });
        await container.commentService.migrateIrPathsForContainer(deck_id, slide_id, (p) =>
          migratePathAfterMove(p, from_path, to_parent_path, to_position),
        );
        const v = await revalidate(container, deck_id, slide_id);
        return textResponse({
          slide_id: slide.id,
          new_path: newPath,
          source_kind: slide.sourceKind,
          validation: v.validation,
          validation_delta: v.validationDelta,
          validation_presentation: v.validationPresentation,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
