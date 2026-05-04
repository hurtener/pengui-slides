/**
 * MCP Tool: compile_chart
 *
 * v4.12 — turn a chart specification into a `chart` IR node and
 * (optionally) insert it into a slide or section in one round-trip.
 *
 * Mirrors `compile_markdown`'s preview/insert duality:
 *
 *   1. PREVIEW (no `target`) — returns `{ node, warnings, svg_preview }`.
 *      `svg_preview` is themed by the deck identified via `deck_id` so
 *      the agent can iterate on chart_type / value_format / data shape
 *      without committing.
 *
 *   2. INSERT (with `target`) — server validates, applies the insert in
 *      IR space, recompiles + revalidates the slide / section ONCE,
 *      saves, and returns `{ inserted_path, warnings }`. The agent does
 *      not echo the IR back through context — it sends the spec, gets
 *      the path.
 *
 * The agent never reasons about ECharts internals; it sends the
 * structured `ChartNode` payload (chart_type + data + labels + knobs).
 * The server owns the SVG produce path.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ServiceContainer } from '../../container.js';
import { structuredResponse } from '../_shared/responses.js';
import { handleToolError } from '../_shared/error-handler.js';
import { ChartNodeSchema, ChartTypeSchema, type ChartNode } from '../../domain/ir/nodes.js';
import { buildEChartsTheme, buildHexToVarMap } from '../../domain/souls/chart-theme-bridge.js';
import {
  renderChartToSvg,
  applyHexToVarSwap,
  toSpec,
} from '../../domain/rendering/chart-renderer.js';
import { soulId } from '../../types/common.js';
import { ErrorCode, PenguiError } from '../../types/errors.js';

const PATH_STEP = z.union([z.string(), z.number().int().nonnegative()]);
const PATH_SCHEMA = z.array(PATH_STEP);

const TARGET_SCHEMA = z.discriminatedUnion('container_kind', [
  z.object({
    container_kind: z.literal('slide'),
    slide_id: z.string(),
    parent_path: PATH_SCHEMA.default(['body']),
    position: z.number().int().nonnegative().default(0),
  }),
  z.object({
    container_kind: z.literal('section'),
    section_id: z.string(),
    parent_path: PATH_SCHEMA.default(['body']),
    position: z.number().int().nonnegative().default(0),
  }),
]);

// Input mirrors ChartNodeSchema but lifts `type` (always `'chart'`) so
// the agent doesn't have to write it. We construct the full ChartNode
// before validating.
const CHART_INPUT_SCHEMA = z.object({
  chart_type: ChartTypeSchema,
  data: z.array(z.array(z.union([z.number(), z.string()]))).min(1),
  series_labels: z.array(z.string()).optional(),
  category_labels: z.array(z.string()).optional(),
  x_axis_title: z.string().optional(),
  y_axis_title: z.string().optional(),
  show_legend: z.boolean().optional(),
  show_grid: z.boolean().optional(),
  value_format: z.enum(['number', 'percent', 'currency', 'compact']).optional(),
  // Caption is RichText — at the tool surface we accept either a plain
  // string (single run) or the full RichText array. We coerce to RichText
  // before building the ChartNode.
  caption: z
    .union([z.string(), z.array(z.object({ text: z.string() }).passthrough())])
    .optional(),
});

type ChartInput = z.infer<typeof CHART_INPUT_SCHEMA>;

export function registerCompileChartTool(
  server: McpServer,
  container: ServiceContainer,
): void {
  server.registerTool(
    'compile_chart',
    {
      title: 'Compile Chart',
      description:
        'Turn a chart specification into an IR `chart` node. Without a ' +
        '`target` returns `{node, warnings, svg_preview}` themed by the ' +
        'deck identified via `deck_id` — useful for iterating on ' +
        'chart_type, value_format, or data shape without committing. ' +
        'With a `target` (slide or section) the server inserts the chart ' +
        'into the addressed container in one round-trip and returns ' +
        '`{inserted_path, warnings}`. Validation runs ONCE on the final ' +
        'state. Coverage: bar, stacked_bar, line, area, scatter, pie, ' +
        'donut, histogram, heatmap, radar — all soul-themed via the ' +
        'category color palette (a–h). PPTX export embeds the chart as a ' +
        'PNG image (native PPTX chart parts are out of scope for v4.12).',
      inputSchema: z.object({
        deck_id: z
          .string()
          .describe(
            'Deck ID — identifies the soul whose 8-color categorical ' +
              'palette themes the chart. Required even for preview.',
          ),
        chart: CHART_INPUT_SCHEMA.describe(
          'Structured chart specification: chart_type + data rows + ' +
            'optional labels + display knobs.',
        ),
        target: TARGET_SCHEMA.optional().describe(
          'When set, compile_chart inserts the resulting node at ' +
            '`target.position` inside `target.parent_path`. Omit for ' +
            'preview-only flows.',
        ),
      }),
    },
    async ({ deck_id, chart, target }) => {
      try {
        const node = buildChartNode(chart);

        // Resolve the deck's soul once — needed for both preview SVG and
        // (in insert mode) the recompile pass that runs inside
        // insertSlideNodesBulk / insertSectionNodesBulk.
        const summary = await container.deckService.getDeckSummary(deck_id);
        const { soul } = await container.soulService.get(soulId(summary.soulId as string));

        const theme = buildEChartsTheme(soul.layers);
        const hexToVar = buildHexToVarMap(soul.layers);
        const rawSvg = renderChartToSvg(toSpec(node), theme);
        const svgPreview = applyHexToVarSwap(rawSvg, hexToVar);

        const warnings: string[] = [];

        if (!target) {
          return structuredResponse({
            mode: 'preview',
            node,
            warnings,
            svg_preview: svgPreview,
          });
        }

        if (target.container_kind === 'slide') {
          const { insertedPaths } = await container.deckService.insertSlideNodesBulk({
            deckId: deck_id,
            slideId: target.slide_id,
            parentPath: target.parent_path,
            position: target.position,
            nodes: [node],
          });
          return structuredResponse({
            mode: 'inserted',
            container_kind: 'slide',
            slide_id: target.slide_id,
            inserted_path: insertedPaths[0],
            warnings,
          });
        }

        const { insertedPaths } = await container.documentService.insertSectionNodesBulk({
          deckId: deck_id,
          sectionId: target.section_id,
          parentPath: target.parent_path,
          position: target.position,
          nodes: [node],
        });
        return structuredResponse({
          mode: 'inserted',
          container_kind: 'section',
          section_id: target.section_id,
          inserted_path: insertedPaths[0],
          warnings,
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  );
}

function buildChartNode(input: ChartInput): ChartNode {
  // Coerce caption (string | RichText | undefined) to RichText | undefined.
  const caption =
    typeof input.caption === 'string'
      ? [{ text: input.caption }]
      : input.caption;

  const candidate: Record<string, unknown> = {
    type: 'chart',
    chart_type: input.chart_type,
    data: input.data,
  };
  if (input.series_labels !== undefined) candidate.series_labels = input.series_labels;
  if (input.category_labels !== undefined) candidate.category_labels = input.category_labels;
  if (input.x_axis_title !== undefined) candidate.x_axis_title = input.x_axis_title;
  if (input.y_axis_title !== undefined) candidate.y_axis_title = input.y_axis_title;
  if (input.show_legend !== undefined) candidate.show_legend = input.show_legend;
  if (input.show_grid !== undefined) candidate.show_grid = input.show_grid;
  if (input.value_format !== undefined) candidate.value_format = input.value_format;
  if (caption !== undefined) candidate.caption = caption;

  const parsed = ChartNodeSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new PenguiError(
      ErrorCode.INVALID_INPUT,
      `compile_chart received an invalid chart payload: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  return parsed.data;
}
