/**
 * Flow density lint — v4.17.
 *
 * Walks an IR body recursively and emits warnings for `flow` nodes
 * with more than `MAX_RECOMMENDED_STEPS` steps. Visual density is the
 * author's call (not an export blocker), so the warning surfaces
 * through the existing v4.7 `validate_deck_for_export` warnings track
 * rather than the hard-error track.
 *
 * The walker descends into container nodes (grid cells, two_column
 * children, card body) so a flow nested inside a card or grid cell
 * still triggers the lint.
 */

import type { SlideNode } from './nodes.js';

/** A flow with more than this many steps triggers the density warning.
 *  7 is the master-plan target; humans struggle to visually parse
 *  longer chains in the slide-canvas medium. */
export const MAX_RECOMMENDED_FLOW_STEPS = 7;

export interface FlowDensityWarning {
  /** Bracket-style index path into the IR body, e.g. "body[3]" or
   *  "body[2].grid.cells[1][0]". The exact format mirrors the existing
   *  `lintNodesForMode` issue path so the App / agent surface them with
   *  one display rule. */
  path: string;
  /** Number of steps in the offending flow. */
  stepCount: number;
  /** Human-readable message. */
  message: string;
  /** Stable warning code for tooling. */
  code: 'flow-density-high';
}

export function lintFlowDensity(nodes: SlideNode[]): FlowDensityWarning[] {
  const warnings: FlowDensityWarning[] = [];
  walk(nodes, 'body', warnings);
  return warnings;
}

function walk(nodes: SlideNode[], pathPrefix: string, warnings: FlowDensityWarning[]): void {
  nodes.forEach((node, index) => {
    const path = `${pathPrefix}[${index}]`;
    if (node.type === 'flow') {
      if (node.steps.length > MAX_RECOMMENDED_FLOW_STEPS) {
        warnings.push({
          path,
          stepCount: node.steps.length,
          code: 'flow-density-high',
          message:
            `Flow has ${node.steps.length} steps — consider splitting into two flows ` +
            `at ${MAX_RECOMMENDED_FLOW_STEPS} steps for visual readability.`,
        });
      }
      return;
    }
    // Recurse into containers that hold leaf arrays.
    if (node.type === 'two_column') {
      walk(node.left as SlideNode[], `${path}.left`, warnings);
      walk(node.right as SlideNode[], `${path}.right`, warnings);
      return;
    }
    if (node.type === 'grid') {
      node.cells.forEach((cell, cellIndex) => {
        walk(cell as SlideNode[], `${path}.cells[${cellIndex}]`, warnings);
      });
      return;
    }
    if (node.type === 'card') {
      walk(node.body as SlideNode[], `${path}.body`, warnings);
      return;
    }
  });
}
