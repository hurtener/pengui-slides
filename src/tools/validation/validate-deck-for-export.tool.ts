/**
 * MCP Tool: validate_deck_for_export
 *
 * Pre-flight validation for an entire deck. Runs Stage 1 + Stage 2
 * (Playwright render-truth) across every slide / section in one shot
 * and returns a per-item validation report — without committing to an
 * export. Closes the v4.5/4.6 gap where the agent only learned about
 * Stage 2 issues at export time, when the response carried only an
 * `error_count` and no per-issue detail.
 *
 * Slides decks: per-slide validateSlide(depth='full').
 * Document decks: validateDocument across all sections, then split
 *   issues back per section using the `sec-N:` id prefix.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { textResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { soulId as toSoulId } from '../../types/common.js';
import { DeckNotFoundError } from '../../types/errors.js';

export function registerValidateDeckForExportTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'validate_deck_for_export',
    {
      title: 'Validate Deck for Export',
      description:
        'Run full validation (Stage 1 lint + Stage 2 Playwright render-truth) across every slide or ' +
        'section in the deck WITHOUT attempting an export. Use this before `export_pdf` / `export_pptx` / ' +
        '`export_html` so you can see (and fix) all errors in one round-trip instead of chasing them one ' +
        'export attempt at a time. ' +
        '\n\n' +
        'INPUT — `deck_id` (UUID or slug). ' +
        '\n\n' +
        'RETURNS — `{ deck_id, authoring_model, items: [{ slide_id?|section_id?, position, title, ' +
        'kind?, validation: { passed, error_count, warning_count, issues: [{ id, rule, severity, stage, ' +
        'message, fixSuggestion? }] } }], blocking_count, ready_for_export }`. `blocking_count` is the ' +
        'total number of error-severity issues across all items; `ready_for_export` is true when zero. ' +
        '\n\n' +
        'COST — Stage 2 spins up Playwright once per call (slides decks: per slide; document decks: once ' +
        'for the composed document). Budget ~1–3 s per slide / ~3–8 s per document deck.',
      inputSchema: z.object({
        deck_id: z.string().describe('UUID or slug of the deck to validate.'),
      }),
    },
    async ({ deck_id }) => {
      try {
        const summary = await container.deckService.getDeckSummary(deck_id);
        const deck = await container.deckStore.get(summary.id);
        if (!deck) throw new DeckNotFoundError(deck_id);
        const sId = toSoulId(summary.soulId as string);

        if (summary.authoringModel === 'document') {
          const sections = await container.sectionStore.getByDeck(summary.id);
          const validation = await container.validationService.validateDocument(
            deck,
            sections,
            sId,
            'full',
            container.assetService,
          );

          const items = sections.map((section, i) => {
            const prefix = `sec-${i + 1}:`;
            const issues = validation.issues
              .filter((issue) => issue.id.startsWith(prefix))
              .map((issue) => ({
                id: issue.id.slice(prefix.length),
                rule: issue.rule,
                severity: issue.severity,
                stage: issue.stage,
                message: issue.message,
                ...(issue.fixSuggestion ? { fixSuggestion: issue.fixSuggestion } : {}),
              }));
            const errorCount = issues.filter((i) => i.severity === 'error').length;
            const warningCount = issues.filter((i) => i.severity === 'warning').length;
            return {
              section_id: section.id as string,
              position: section.position,
              kind: section.kind,
              title: section.metadata.title,
              validation: {
                passed: errorCount === 0,
                error_count: errorCount,
                warning_count: warningCount,
                issues,
              },
            };
          });

          const blockingCount = items.reduce((sum, it) => sum + it.validation.error_count, 0);

          return textResponse({
            deck_id: summary.id as string,
            authoring_model: 'document',
            items,
            blocking_count: blockingCount,
            ready_for_export: blockingCount === 0,
            stage1_elapsed_ms: validation.stage1ElapsedMs,
            stage2_elapsed_ms: validation.stage2ElapsedMs,
          });
        }

        const slides = await container.slideStore.getByDeck(summary.id);
        const items: Array<{
          slide_id: string;
          position: number;
          title: string;
          validation: {
            passed: boolean;
            error_count: number;
            warning_count: number;
            issues: Array<{
              id: string;
              rule: string;
              severity: string;
              stage: string;
              message: string;
              fixSuggestion?: string;
            }>;
          };
        }> = [];

        for (const slide of slides) {
          const validation = await container.validationService.validateSlide(
            slide.html,
            sId,
            'full',
            summary.format,
          );
          await container.deckService.updateSlide({
            deckId: summary.id as string,
            slideId: slide.id as string,
            lastValidation: validation,
          });
          items.push({
            slide_id: slide.id as string,
            position: slide.position,
            title: slide.metadata.title,
            validation: {
              passed: validation.passed,
              error_count: validation.errorCount,
              warning_count: validation.warningCount,
              issues: validation.issues.map((i) => ({
                id: i.id,
                rule: i.rule,
                severity: i.severity,
                stage: i.stage,
                message: i.message,
                ...(i.fixSuggestion ? { fixSuggestion: i.fixSuggestion } : {}),
              })),
            },
          });
        }

        const blockingCount = items.reduce((sum, it) => sum + it.validation.error_count, 0);

        return textResponse({
          deck_id: summary.id as string,
          authoring_model: 'slides',
          items,
          blocking_count: blockingCount,
          ready_for_export: blockingCount === 0,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}
