import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SECTION_MUTATING_TOOL_NAMES,
  isSectionMutationResponse,
} from '../../../src/tools/_shared/section-mutation-response.js';

describe('isSectionMutationResponse', () => {
  it('accepts a payload with section_id (string)', () => {
    expect(isSectionMutationResponse({ section_id: 'abc-123' })).toBe(true);
  });

  it('accepts a payload with section_count (number)', () => {
    expect(isSectionMutationResponse({ section_count: 0 })).toBe(true);
    expect(isSectionMutationResponse({ section_count: 5 })).toBe(true);
  });

  it('accepts a payload with both fields', () => {
    expect(isSectionMutationResponse({ section_id: 'abc', section_count: 3 })).toBe(true);
  });

  it('rejects a payload missing both fields', () => {
    expect(isSectionMutationResponse({ kind: 'prose' })).toBe(false);
    expect(isSectionMutationResponse({})).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(isSectionMutationResponse(null)).toBe(false);
    expect(isSectionMutationResponse('section_id')).toBe(false);
    expect(isSectionMutationResponse(123)).toBe(false);
  });

  it('rejects empty section_id and negative section_count', () => {
    expect(isSectionMutationResponse({ section_id: '' })).toBe(false);
    expect(isSectionMutationResponse({ section_count: -1 })).toBe(false);
  });

  it('rejects wrong-typed values', () => {
    expect(isSectionMutationResponse({ section_id: 123 })).toBe(false);
    expect(isSectionMutationResponse({ section_count: '5' })).toBe(false);
  });
});

describe('section-mutation tool registry', () => {
  // Source-level guard: every tool listed in SECTION_MUTATING_TOOL_NAMES
  // must use structuredResponse() in its handler so the bridge heuristic
  // in DocumentEditor.svelte (onToolResult → loadSections) actually
  // fires. textResponse() returns no structuredContent and silently
  // breaks the live-refresh path.
  const repo = resolve(__dirname, '../../..');
  const toolDir = resolve(repo, 'src/tools/decks');

  it('every section-mutating tool source uses structuredResponse, not textResponse', () => {
    const offenders: string[] = [];
    for (const toolName of SECTION_MUTATING_TOOL_NAMES) {
      const fileName = toolName.replace(/_/g, '-') + '.tool.ts';
      const path = resolve(toolDir, fileName);
      const src = readFileSync(path, 'utf8');
      if (!/\bstructuredResponse\s*\(/.test(src)) {
        offenders.push(`${toolName} (${fileName}): missing structuredResponse() call`);
      }
      if (/\btextResponse\s*\(/.test(src)) {
        offenders.push(`${toolName} (${fileName}): still uses textResponse() — switch to structuredResponse`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('SECTION_MUTATING_TOOL_NAMES covers every register*.tool.ts file in src/tools/decks/ that names "section"', () => {
    // Belt-and-braces: catch a future tool author who adds e.g. split_section.tool.ts
    // and forgets to add it to the contract list. Heuristic: any *.tool.ts in
    // src/tools/decks/ whose filename contains "section" and whose handler
    // mutates state should be in the list. Read-only tools like
    // get-section / list-sections are explicitly allowed (they don't mutate).
    const READ_ONLY = new Set([
      'get-section.tool.ts',
      'list-sections.tool.ts',
    ]);
    // update-document-meta.tool.ts mutates deck-level chrome, not sections;
    // documented as excluded in section-mutation-response.ts.
    const EXCLUDED = new Set([
      'update-document-meta.tool.ts',
    ]);

    const sectionFiles = readdirSync(toolDir).filter(
      (f) => f.endsWith('.tool.ts') && f.includes('section') && !READ_ONLY.has(f) && !EXCLUDED.has(f),
    );

    const expectedToolNames = sectionFiles.map((f) =>
      f.replace(/\.tool\.ts$/, '').replace(/-/g, '_'),
    );
    const missingFromContract = expectedToolNames.filter(
      (n) => !SECTION_MUTATING_TOOL_NAMES.includes(n as (typeof SECTION_MUTATING_TOOL_NAMES)[number]),
    );

    expect(missingFromContract).toEqual([]);
  });
});
