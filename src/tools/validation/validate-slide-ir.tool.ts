/**
 * MCP Tools: validate_slide_ir / validate_section_ir
 *
 * Lightweight schema-only validators that an agent can call before
 * committing to add_slide / add_section. They run the Zod schema and
 * return the issues array — no compilation, no soul lookup, no
 * Stage 1 / Stage 2 lints. Use the full add_* tools (or `validate_slide`
 * / `validate_section`) for end-to-end validation including soul-token
 * compliance and structural lints.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { SlideIRSchema, SectionIRSchema } from '../../domain/ir/index.js';

interface IssueOut {
  path: string;
  message: string;
  code?: string;
}

function flattenZodIssues(issues: z.core.$ZodIssue[]): IssueOut[] {
  return issues.map((issue) => ({
    path: issue.path.length === 0 ? '<root>' : issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

export function registerValidateSlideIRTool(server: McpServer): void {
  server.registerTool(
    'validate_slide_ir',
    {
      title: 'Validate Slide IR',
      description:
        'Schema-validate a SlideIR tree without committing it to a deck. Returns ' +
        '`{ ok, issues[] }`. Cheap to call — runs only the Zod schema, no compilation, ' +
        'no soul lookup, no structural lints. Use this to iterate on IR drafts before ' +
        'calling add_slide / update_slide. ' +
        '\n\n' +
        'For full validation (token compliance, contrast, render-truth) call add_slide ' +
        'or update_slide and inspect the `validation` block in the response.',
      inputSchema: z.object({
        slide_ir: z
          .unknown()
          .describe('Candidate SlideIR tree. Fetch `pengui://schema/slide-ir` for the grammar.'),
      }),
    },
    async ({ slide_ir }) => {
      try {
        const result = SlideIRSchema.safeParse(slide_ir);
        if (result.success) {
          return structuredResponse({ ok: true, issues: [] });
        }
        return structuredResponse({
          ok: false,
          issues: flattenZodIssues(result.error.issues),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}

export function registerValidateSectionIRTool(server: McpServer): void {
  server.registerTool(
    'validate_section_ir',
    {
      title: 'Validate Section IR',
      description:
        'Schema-validate a SectionIR tree without committing it to a deck. Returns ' +
        '`{ ok, issues[] }`. Sections share the same node grammar as slides. Cheap to ' +
        'call — runs only the Zod schema, no compilation, no soul lookup, no structural lints. ' +
        '\n\n' +
        'For full validation (kind-specific shape checks, token compliance) call ' +
        'add_section or update_section and inspect the `validation` block in the response.',
      inputSchema: z.object({
        section_ir: z
          .unknown()
          .describe('Candidate SectionIR tree. Fetch `pengui://schema/slide-ir` for the grammar.'),
      }),
    },
    async ({ section_ir }) => {
      try {
        const result = SectionIRSchema.safeParse(section_ir);
        if (result.success) {
          return structuredResponse({ ok: true, issues: [] });
        }
        return structuredResponse({
          ok: false,
          issues: flattenZodIssues(result.error.issues),
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
