/**
 * Response contract for tools that mutate sections of a document deck.
 *
 * Every section-mutating tool MUST populate `structuredContent` with at
 * least one of:
 *   - `section_id` (string) — the specific section that was added,
 *     updated, or repaired.
 *   - `section_count` (number) — the new total when sections were
 *     removed or reordered.
 *
 * The MCP App's DocumentEditor uses these fields via `bridge.onToolResult`
 * to know when to reload its section rail. Tools that omit them break
 * the live-refresh path silently — the rail goes stale until the user
 * manually re-opens the deck.
 *
 * Tools may include both fields, plus any arbitrary extra fields. This
 * schema is a minimum, not a maximum.
 *
 * If you add a new tool that mutates sections, append its registered
 * name to `SECTION_MUTATING_TOOL_NAMES` and update the e2e check in
 * `scripts/e2e-section-flow.mjs`. The list is the contract surface;
 * keeping it complete is what makes the contract testable.
 *
 * Excluded by design: `update_document_meta` mutates deck-level chrome
 * (TOC, page margins) but not section content; the DocumentEditor reads
 * chrome separately on mount and the section rail does not need to
 * reload when chrome changes.
 */

export const SECTION_MUTATING_TOOL_NAMES = [
  'add_section',
  'update_section',
  'remove_section',
  'reorder_sections',
] as const;

export type SectionMutatingToolName = (typeof SECTION_MUTATING_TOOL_NAMES)[number];

export interface SectionMutationResponse {
  section_id?: string;
  section_count?: number;
  [key: string]: unknown;
}

export function isSectionMutationResponse(value: unknown): value is SectionMutationResponse {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  const hasSectionId = typeof obj.section_id === 'string' && obj.section_id.length > 0;
  const hasSectionCount = typeof obj.section_count === 'number' && obj.section_count >= 0;
  return hasSectionId || hasSectionCount;
}
