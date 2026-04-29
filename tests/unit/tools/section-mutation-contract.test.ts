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

  /** Build a map: registered tool name → list of `*.tool.ts` files where it appears. */
  function indexRegisteredToolsInDeckDir(): Map<string, string[]> {
    const map = new Map<string, string[]>();
    const files = readdirSync(toolDir).filter((f) => f.endsWith('.tool.ts'));
    const callRegex = /server\.registerTool\(\s*['"]([a-z0-9_]+)['"]/g;
    for (const file of files) {
      const src = readFileSync(resolve(toolDir, file), 'utf8');
      let match: RegExpExecArray | null;
      while ((match = callRegex.exec(src)) !== null) {
        const name = match[1];
        const arr = map.get(name) ?? [];
        arr.push(file);
        map.set(name, arr);
      }
    }
    return map;
  }

  it('every section-mutating tool source uses structuredResponse, not textResponse', () => {
    const index = indexRegisteredToolsInDeckDir();
    const offenders: string[] = [];
    for (const toolName of SECTION_MUTATING_TOOL_NAMES) {
      const files = index.get(toolName);
      if (!files || files.length === 0) {
        offenders.push(`${toolName}: no source file in src/tools/decks/ registers this tool name`);
        continue;
      }
      for (const file of files) {
        const src = readFileSync(resolve(toolDir, file), 'utf8');
        if (!/\bstructuredResponse\s*\(/.test(src)) {
          offenders.push(`${toolName} (${file}): missing structuredResponse() call`);
        }
        if (/\btextResponse\s*\(/.test(src)) {
          offenders.push(`${toolName} (${file}): still uses textResponse() — switch to structuredResponse`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('SECTION_MUTATING_TOOL_NAMES covers every section-mutating tool registered in src/tools/decks/', () => {
    // Belt-and-braces: catch a future tool author who registers a new
    // `*_section*` tool and forgets to add it to the contract list.
    // Heuristic: scan every *.tool.ts in src/tools/decks/ for
    // `server.registerTool('NAME', ...)` calls. If the registered name
    // contains 'section' and is not explicitly read-only, it must appear
    // in SECTION_MUTATING_TOOL_NAMES.
    const READ_ONLY_TOOLS = new Set([
      'get_section',
      'list_sections',
    ]);
    // update_document_meta mutates deck-level chrome, not sections;
    // documented as excluded in section-mutation-response.ts.
    const EXCLUDED_TOOLS = new Set([
      'update_document_meta',
    ]);

    const index = indexRegisteredToolsInDeckDir();
    const registeredSectionTools = [...index.keys()].filter(
      (name) =>
        name.includes('section') &&
        !READ_ONLY_TOOLS.has(name) &&
        !EXCLUDED_TOOLS.has(name),
    );

    const missingFromContract = registeredSectionTools.filter(
      (n) => !SECTION_MUTATING_TOOL_NAMES.includes(n as (typeof SECTION_MUTATING_TOOL_NAMES)[number]),
    );

    expect(missingFromContract).toEqual([]);
  });
});
