/**
 * MCP Resource: pengui://schema/slide-ir
 *
 * Exposes the SlideIR / SectionIR JSON Schema so agents can fetch the
 * authoritative node grammar (hero, prose, image, callout, heading,
 * list, divider, quote, table, two_column) with field types and enums,
 * instead of inferring shape from tool descriptions alone. Both slides
 * (slide-model decks) and sections (document-model decks) consume the
 * same node union.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import {
  SlideIRSchema,
  SectionIRSchema,
  SLIDE_NODE_TYPES,
} from '../domain/ir/index.js';
import { registerResourceEntry } from './registry.js';

export const SLIDE_IR_SCHEMA_URI = 'pengui://schema/slide-ir';

export function registerSlideIRSchemaResource(server: McpServer): void {
  registerResourceEntry(server, {
    uri: SLIDE_IR_SCHEMA_URI,
    name: 'slide-ir-schema',
    mimeType: 'application/json',
    description:
      'JSON Schema for the Slide / Section IR node tree. Lists every node type ' +
      '(hero, prose, image, callout, heading, list, divider, quote, table, two_column), ' +
      'their fields, the rich-text run shape, and the semantic token enums (background ' +
      'roles, color roles). Fetch this once per session and use it to compose `slide_ir` / ' +
      '`section_ir` arguments for add_slide, update_slide, add_section, update_section, ' +
      'validate_slide_ir, and validate_section_ir.',
    getText: () => {
      const payload = {
        version: '4.7',
        node_types: SLIDE_NODE_TYPES,
        slide_ir: z.toJSONSchema(SlideIRSchema),
        section_ir: z.toJSONSchema(SectionIRSchema),
        notes: [
          'Token references are SEMANTIC, not literal. A node says `background: "accent"`; ' +
            'the compiler emits `var(--color-accent-primary)`. Agents never write hex.',
          'Image nodes reference uploaded assets by id (`asset_id: "uuid"`). Upload binaries ' +
            'with `upload_asset` first. Provide `alt` for accessibility (empty string marks decorative).',
          'two_column.left and two_column.right hold LEAF nodes only (no nested two_column).',
          'Rich text runs (v4.7+): bold / italic / code / strike STACK freely on a single ' +
            'run (no longer mutually exclusive). sup / sub are mutually exclusive at render ' +
            'time — sup wins when both are set. link is independent. `color` is independent ' +
            '(SEMANTIC role: accent | accent_alt | accent_warm | success | warning | error | ' +
            'info | muted | inverse). Omit `color` to inherit the cascade-aware default text ' +
            'color (which auto-swaps to inverse on dark backgrounds). Runs concatenate ' +
            'verbatim — INCLUDE spaces inside text rather than relying on inter-run whitespace.',
          'Table rows must have the same column count as `headers` when headers are provided. ' +
            'Short rows are padded with empty cells at render time and may surface as a ' +
            'validation warning.',
          'Heading levels: h1 is reserved for hero/cover titles in practice; h2–h4 cover most ' +
            'content slide section headers; h5–h6 are uppercase eyebrow-style.',
        ],
      };
      return JSON.stringify(payload, null, 2);
    },
  });
}
