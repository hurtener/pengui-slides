/**
 * MCP Tool: add_section
 *
 * Appends a section (content block) to a continuous-document print deck.
 * Sections are HTML FRAGMENTS, not full documents — the DocumentComposer
 * concatenates them at export time and lets Chromium paginate.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { ALL_SECTION_KINDS } from '../../types/section.js';
import { soulId } from '../../types/common.js';

const sourceSchema = z.object({
  url: z.string().optional().describe('Source URL.'),
  title: z.string().optional().describe('Source title.'),
  quoteSpan: z.string().optional().describe('Quoted text span from the source.'),
  confidence: z.number().optional().describe('Confidence score (0-1).'),
  retrievedAt: z.string().optional().describe('ISO timestamp of when the source was retrieved.'),
});

const chromeOverridesSchema = z
  .object({
    hide: z.boolean().nullish().describe('Suppress running chrome on pages this section occupies.'),
    running_title: z.string().nullish().describe('Running title to show while this section is on the page.'),
    reset_page_counter: z.boolean().nullish().describe('Reset the page counter at this section (e.g. Part II restarts at 1).'),
  })
  .nullish();

const metadataSchema = z.object({
  title: z.string().describe('Section title.'),
  narrative: z.string().describe('Narrative description of the section.'),
  key_points: z.array(z.string()).nullish().describe('Key points covered in this section.'),
  tags: z.array(z.string()).nullish().describe('Tags for categorisation.'),
  sources: z.array(sourceSchema).nullish().describe('Source attributions.'),
  chrome_overrides: chromeOverridesSchema.describe('Per-section chrome overrides (hide, running title, page-counter reset).'),
});

const breakHintsSchema = z
  .object({
    break_before: z.enum(['auto', 'page', 'avoid']).nullish().describe('Force a page break before this section.'),
    break_after: z.enum(['auto', 'page', 'avoid']).nullish().describe('Force a page break after this section.'),
    keep_together: z.boolean().nullish().describe('Prevent splitting across pages.'),
    full_page: z.boolean().nullish().describe('Render as a full-page block (min-height 100vh + break-after page).'),
  })
  .nullish();

export function registerAddSectionTool(server: McpServer, container: ServiceContainer): void {
  server.registerTool(
    'add_section',
    {
      title: 'Add Section',
      description:
        'Append a section (content block) to a continuous-document print deck. ' +
        'Only valid for decks with `authoring_model: "document"` — for slide decks, call `add_slide`; ' +
        'a mismatch returns `WRONG_AUTHORING_MODEL` naming the right verb. ' +
        '\n\n' +
        'FRAGMENT CONTRACT — the HTML you pass must be a FRAGMENT, not a full document: ' +
        'exactly one top-level `<section class="pengui-section pengui-{kind}">` root, no `<!DOCTYPE>`, ' +
        'no `<html>`/`<head>`/`<body>`, no `<script>`, no standalone `<style>` blocks, no `:root { ... }` ' +
        'custom-property declarations, no fixed page dimensions on the wrapper. ' +
        'Use soul tokens (`var(--color-*)`, `var(--space-*)`, etc.) for styling. ' +
        '\n\n' +
        'AUTO-FIX BEHAVIOUR — the server always injects a canonical `<!-- @section-meta {...} -->` ' +
        'comment above the wrapper from the metadata you provide, so you never emit that comment yourself. ' +
        '\n\n' +
        'VALIDATION — the response includes a `validation` block with `error_count`, `warning_count`, and ' +
        '`issues[]`. Inspect it on every call. If a structural issue fires, prefer the surgical repair tools ' +
        'over re-emitting the whole fragment: ' +
        '`promote_section_root` for `section-structural-root-not-section` (single non-`<section>` root), ' +
        '`wrap_section_root` for `section-structural-multiple-root-elements` (multiple top-level nodes). ' +
        '\n\n' +
        'See `pengui://docs/document-mode` for the full authoring guide and canonical class/break ' +
        'conventions (e.g. `.pengui-figure`, `.pengui-callout`, `.pengui-quote` → break-inside: avoid).',
      inputSchema: z.object({
        deck_id: z
          .string()
          .describe('UUID or slug of the document-mode deck to add the section to.'),
        kind: z
          .enum(ALL_SECTION_KINDS as [string, ...string[]])
          .describe(
            'SectionKind. Drives default break behaviour and kind-specific structural checks. ' +
              'Keep-together kinds (figure, chart, diagram, callout, quote, image) get break-inside: avoid. ' +
              'Full-page kinds (cover, chapter_header) get min-height: 100vh + break-after: page by default.',
          ),
        html: z
          .string()
          .describe(
            'Section HTML fragment. Exactly one top-level `<section class="pengui-section pengui-{kind}">` ' +
              'root. No DOCTYPE, no document-level tags, no fixed page dimensions. ' +
              'Do NOT emit `<!-- @section-meta -->` — the server injects it from `metadata`.',
          ),
        metadata: metadataSchema.describe(
          'Section metadata. Drives the auto-injected @section-meta comment, exports, and the MCP App sidebar.',
        ),
        break_hints: breakHintsSchema.describe(
          'Per-section pagination overrides. Useful when the default for `kind` is not what you want ' +
            '(e.g. a figure you want to allow splitting across pages: `keep_together: false`).',
        ),
        position: z
          .number()
          .int()
          .nonnegative()
          .nullish()
          .describe(
            'Zero-based insertion position. Omit to append to the end. Existing sections at this ' +
              'position and after are shifted down by one.',
          ),
      }),
    },
    async ({ deck_id, kind, html, metadata, break_hints, position }) => {
      try {
        const chromeOverrides = metadata.chrome_overrides
          ? {
              ...(metadata.chrome_overrides.hide != null
                ? { hide: metadata.chrome_overrides.hide }
                : {}),
              ...(metadata.chrome_overrides.running_title != null
                ? { runningTitle: metadata.chrome_overrides.running_title }
                : {}),
              ...(metadata.chrome_overrides.reset_page_counter != null
                ? { resetPageCounter: metadata.chrome_overrides.reset_page_counter }
                : {}),
            }
          : undefined;

        const breakHints = break_hints
          ? {
              ...(break_hints.break_before != null
                ? { breakBefore: break_hints.break_before }
                : {}),
              ...(break_hints.break_after != null
                ? { breakAfter: break_hints.break_after }
                : {}),
              ...(break_hints.keep_together != null
                ? { keepTogether: break_hints.keep_together }
                : {}),
              ...(break_hints.full_page != null
                ? { fullPage: break_hints.full_page }
                : {}),
            }
          : undefined;

        const section = await container.documentService.addSection({
          deckId: deck_id,
          kind: kind as Parameters<typeof container.documentService.addSection>[0]['kind'],
          html,
          metadata: {
            title: metadata.title,
            narrative: metadata.narrative,
            ...(metadata.key_points != null ? { keyPoints: metadata.key_points } : {}),
            ...(metadata.tags != null ? { tags: metadata.tags } : {}),
            ...(metadata.sources != null ? { sources: metadata.sources } : {}),
            ...(chromeOverrides ? { chromeOverrides } : {}),
          },
          ...(breakHints ? { breakHints } : {}),
          ...(position != null ? { position } : {}),
        });

        const deck = await container.deckService.getDeckSummary(deck_id);

        // Fragment lints run inline so the agent learns structural
        // violations on turn 1 instead of discovering them at export.
        // Matches the add_slide contract.
        const validation = await container.validationService.validateSection(
          { id: section.id, kind: section.kind, html: section.html },
          soulId(deck.soulId as string),
          deck.format,
        );

        return textResponse({
          section_id: section.id,
          position: section.position,
          kind: section.kind,
          section_count: deck.sectionCount,
          validation: {
            passed: validation.passed,
            error_count: validation.errorCount,
            warning_count: validation.warningCount,
            issues: validation.issues,
          },
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
