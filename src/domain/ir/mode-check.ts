/**
 * Mode-aware IR lint (v4.8).
 *
 * Top-level IR nodes are bimodal by default — same shape in slide and
 * doc decks. v4.8 introduces four mode-specific nodes:
 *   - `section_divider` — slide-only (full-bleed chapter break)
 *   - `toc`, `bibliography`, `page_break` — doc-only
 *
 * The Zod schema accepts all of them at the type level; this helper
 * surfaces a per-mode rejection at Stage 1 (and inside the write tools)
 * so an agent gets a clear diagnostic instead of a silent miscompile.
 */

import {
  DOC_ONLY_NODE_TYPES,
  SLIDE_ONLY_NODE_TYPES,
  type SlideNode,
} from './nodes.js';

export type AuthoringMode = 'slide' | 'doc';

export interface ModeIssue {
  /** JSON-pointer-style path into the IR body, e.g. "body[3]". */
  path: string;
  /** The offending node's discriminator. */
  nodeType: string;
  /** Human-readable explanation. */
  message: string;
}

/**
 * Walk an IR node array and return rejections for nodes that don't
 * belong in the given authoring mode. Bimodal nodes (hero, prose, list,
 * grid, etc.) always pass.
 */
export function lintNodesForMode(nodes: SlideNode[], mode: AuthoringMode): ModeIssue[] {
  const issues: ModeIssue[] = [];
  nodes.forEach((node, index) => {
    if (mode === 'doc' && (SLIDE_ONLY_NODE_TYPES as readonly string[]).includes(node.type)) {
      issues.push({
        path: `body[${index}]`,
        nodeType: node.type,
        message: `Node \`${node.type}\` is slide-only and not allowed in document IR. Use a chapter_header section or a heading node instead.`,
      });
    }
    if (mode === 'slide' && (DOC_ONLY_NODE_TYPES as readonly string[]).includes(node.type)) {
      issues.push({
        path: `body[${index}]`,
        nodeType: node.type,
        message: `Node \`${node.type}\` is doc-only and not allowed in slide IR. ${suggestionFor(node.type)}`,
      });
    }
  });
  return issues;
}

function suggestionFor(nodeType: string): string {
  switch (nodeType) {
    case 'toc':
      return 'TOC is rendered into a chapter / page-bound document by the doc composer; slide decks have no print pagination.';
    case 'bibliography':
      return 'Bibliography is a long-form reference list — model it as a doc-mode section, or use a list of citation lines on a slide.';
    case 'page_break':
      return 'page_break only makes sense in a flowing document; slides are page-bound by definition.';
    default:
      return 'Use a slide-compatible node instead.';
  }
}
