/**
 * MCP Resource: pengui://schema/slide-ir
 *
 * Exposes the SlideIR / SectionIR JSON Schema so agents can fetch the
 * authoritative node grammar (hero, prose, image, callout, two_column)
 * with field types and enums, instead of inferring shape from tool
 * descriptions alone. Both slides (slide-model decks) and sections
 * (document-model decks) consume the same node union.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import {
  SlideIRSchema,
  SectionIRSchema,
  SLIDE_NODE_TYPES,
} from '../domain/ir/index.js';

export const SLIDE_IR_SCHEMA_URI = 'pengui://schema/slide-ir';

export function registerSlideIRSchemaResource(server: McpServer): void {
  server.registerResource(
    'slide-ir-schema',
    SLIDE_IR_SCHEMA_URI,
    {
      description:
        'JSON Schema for the v4.5 Slide / Section IR node tree. Lists every node type ' +
        '(hero, prose, image, callout, two_column), their fields, the rich-text run shape, ' +
        'and the semantic token enums (background roles, color roles). Fetch this once per ' +
        'session and use it to compose `slide_ir` / `section_ir` arguments for add_slide, ' +
        'update_slide, add_section, update_section, validate_slide_ir, and validate_section_ir.',
      mimeType: 'application/json',
    },
    () => {
      const payload = {
        version: '4.5',
        node_types: SLIDE_NODE_TYPES,
        slide_ir: z.toJSONSchema(SlideIRSchema),
        section_ir: z.toJSONSchema(SectionIRSchema),
        notes: [
          'Token references are SEMANTIC, not literal. A node says `background: "accent"`; ' +
            'the compiler emits `var(--color-accent-primary)`. Agents never write hex.',
          'Image nodes reference uploaded assets by id (`asset_id: "uuid"`). Upload binaries ' +
            'with `upload_asset` first.',
          'two_column.left and two_column.right hold LEAF nodes only (no nested two_column) — ' +
            'this is intentional in v4.5.',
          'Rich text runs allow at most one of bold / italic / code, plus an independent link.',
        ],
      };
      return {
        contents: [
          {
            uri: SLIDE_IR_SCHEMA_URI,
            mimeType: 'application/json',
            text: JSON.stringify(payload, null, 2),
          },
        ],
      };
    },
  );
}
