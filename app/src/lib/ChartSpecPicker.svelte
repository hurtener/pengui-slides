<!--
  ChartSpecPicker — sub-flow that turns user input into an IR `chart`
  payload, ready to hand to `insert_slide_node` / `insert_section_node`.

  v4.12 first cut keeps the surface deliberately small:
    Step 1 — pick chart_type (10 tiles, one per supported type).
    Step 2 — paste TSV / CSV data + optional axis titles.
    Step 3 — confirm. The picker calls onPick(payload) where payload
             is a ready-to-insert IR `chart` node.

  Inline SVG preview via `compile_chart` is a v4.12.x polish — for the
  first cut the user iterates by inserting + Change ▾ if needed.
-->
<script lang="ts">
  import { Button } from './primitives/index';

  type ChartType =
    | 'bar' | 'stacked_bar' | 'line' | 'area'
    | 'scatter' | 'pie' | 'donut' | 'histogram' | 'heatmap' | 'radar';

  interface Props {
    open: boolean;
    onPick: (payload: Record<string, unknown>) => void;
    onClose: () => void;
  }

  let { open, onPick, onClose }: Props = $props();

  const TYPES: ReadonlyArray<{ kind: ChartType; label: string; hint: string; glyph: string }> = [
    { kind: 'bar',         label: 'Bar',          hint: 'Categories on x-axis',          glyph: '▥' },
    { kind: 'stacked_bar', label: 'Stacked bar',  hint: 'Series stacked per category',   glyph: '▦' },
    { kind: 'line',        label: 'Line',         hint: 'Trend over a sequence',         glyph: '╱' },
    { kind: 'area',        label: 'Area',         hint: 'Filled trend',                  glyph: '◢' },
    { kind: 'scatter',     label: 'Scatter',      hint: 'x,y point pairs',               glyph: '∴' },
    { kind: 'pie',         label: 'Pie',          hint: 'Share of total (≤7 slices)',    glyph: '◔' },
    { kind: 'donut',       label: 'Donut',        hint: 'Pie with a hole',               glyph: '◯' },
    { kind: 'histogram',   label: 'Histogram',    hint: 'Frequency distribution',        glyph: '▥' },
    { kind: 'heatmap',     label: 'Heatmap',      hint: '2D intensity grid',             glyph: '▦' },
    { kind: 'radar',       label: 'Radar',        hint: 'Multi-axis comparison',         glyph: '✦' },
  ];

  let step = $state<1 | 2>(1);
  let chartType = $state<ChartType | null>(null);
  let dataText = $state('Q1\tQ2\tQ3\tQ4\n10\t12\t9\t14');
  let xAxisTitle = $state('');
  let yAxisTitle = $state('');
  let parseError = $state('');

  function reset(): void {
    step = 1;
    chartType = null;
    dataText = 'Q1\tQ2\tQ3\tQ4\n10\t12\t9\t14';
    xAxisTitle = '';
    yAxisTitle = '';
    parseError = '';
  }

  function pickType(t: ChartType): void {
    chartType = t;
    step = 2;
    parseError = '';
  }

  function close(): void {
    reset();
    onClose();
  }

  // TSV / CSV parser. Detects header row when first line is non-numeric.
  // Returns { categoryLabels, seriesLabels, data } where data is an
  // array of numeric rows (one per series).
  function parseDataText(text: string): {
    categoryLabels: string[];
    seriesLabels?: string[];
    data: number[][];
  } | null {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length === 0) return null;

    // Auto-detect delimiter — tab beats comma when both present.
    const delim = lines[0].includes('\t') ? '\t' : ',';
    const cells = lines.map((l) => l.split(delim).map((c) => c.trim()));

    const firstRow = cells[0];
    const firstRowAllNonNumeric = firstRow.every(
      (c) => c.length > 0 && !Number.isFinite(Number(c)),
    );

    let categoryLabels: string[];
    let dataRows: string[][];
    let seriesLabels: string[] | undefined;

    if (firstRowAllNonNumeric) {
      // First row is the header. Optionally first column of subsequent rows
      // is a series label when it's non-numeric.
      categoryLabels = firstRow;
      const remainder = cells.slice(1);
      const looksLikeSeriesLabels = remainder.every(
        (r) => r.length > 0 && !Number.isFinite(Number(r[0])),
      );
      if (looksLikeSeriesLabels) {
        seriesLabels = remainder.map((r) => r[0]);
        dataRows = remainder.map((r) => r.slice(1));
        // Drop the corner cell from category labels if header has one
        // extra column up front.
        if (categoryLabels.length === dataRows[0]?.length + 1) {
          categoryLabels = categoryLabels.slice(1);
        }
      } else {
        dataRows = remainder;
      }
    } else {
      // No header — every row is data; categories default to indices.
      categoryLabels = firstRow.map((_, i) => `Cat ${i + 1}`);
      dataRows = cells;
    }

    const data: number[][] = [];
    for (const row of dataRows) {
      const nums = row.map((c) => Number(c));
      if (nums.some((n) => !Number.isFinite(n))) return null;
      data.push(nums);
    }
    if (data.length === 0) return null;
    return { categoryLabels, seriesLabels, data };
  }

  function confirm(): void {
    if (!chartType) return;
    const parsed = parseDataText(dataText);
    if (!parsed) {
      parseError = "Couldn't parse data — expected numeric rows separated by tabs or commas (US format: 1234.56).";
      return;
    }
    parseError = '';
    const payload: Record<string, unknown> = {
      type: 'chart',
      chart_type: chartType,
      data: parsed.data,
    };
    if (parsed.categoryLabels && parsed.categoryLabels.length > 0) {
      payload.category_labels = parsed.categoryLabels;
    }
    if (parsed.seriesLabels && parsed.seriesLabels.length > 0) {
      payload.series_labels = parsed.seriesLabels;
    }
    if (xAxisTitle.trim()) payload.x_axis_title = xAxisTitle.trim();
    if (yAxisTitle.trim()) payload.y_axis_title = yAxisTitle.trim();
    onPick(payload);
    reset();
  }
</script>

{#if open}
  <button type="button" class="picker-scrim" aria-label="Close" onclick={close}></button>
  <div class="picker" role="dialog" aria-label="Configure chart">
    <div class="picker-head">
      <p class="eyebrow">
        {#if step === 1}Choose a chart type{:else}Paste your data{/if}
      </p>
      <Button variant="ghost" size="sm" onclick={close}>Close</Button>
    </div>
    <div class="picker-body">
      {#if step === 1}
        <div class="picker-grid">
          {#each TYPES as t (t.kind)}
            <button
              type="button"
              class="picker-tile"
              onclick={() => pickType(t.kind)}
              aria-label={`${t.label} — ${t.hint}`}
            >
              <span class="tile-glyph" aria-hidden="true">{t.glyph}</span>
              <span class="tile-label">{t.label}</span>
              <span class="tile-hint">{t.hint}</span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="step-back">
          <Button variant="ghost" size="sm" onclick={() => (step = 1)}>← Back</Button>
          <span class="muted">{TYPES.find((t) => t.kind === chartType)?.label}</span>
        </div>
        <label class="field">
          <span class="field-label">Data (TSV or CSV)</span>
          <textarea
            class="data-input"
            rows="6"
            bind:value={dataText}
            placeholder={'Q1\tQ2\tQ3\tQ4\n10\t12\t9\t14'}
            spellcheck="false"
          ></textarea>
          <span class="field-hint">First line is treated as headers when it's non-numeric. First column may name each series. Use `1234.56` decimal format.</span>
        </label>
        <div class="field-row">
          <label class="field">
            <span class="field-label">x-axis title</span>
            <input class="text-input" type="text" bind:value={xAxisTitle} placeholder="Quarter" />
          </label>
          <label class="field">
            <span class="field-label">y-axis title</span>
            <input class="text-input" type="text" bind:value={yAxisTitle} placeholder="USD" />
          </label>
        </div>
        {#if parseError}
          <p class="error">{parseError}</p>
        {/if}
        <div class="actions">
          <Button variant="ghost" onclick={close}>Cancel</Button>
          <Button variant="primary" onclick={confirm}>Insert chart</Button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .picker-scrim {
    position: fixed;
    inset: 0;
    border: 0;
    background: rgba(31, 35, 40, 0.18);
    z-index: 50;
    cursor: pointer;
  }

  .picker {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(640px, calc(100vw - 80px));
    max-height: min(80vh, 600px);
    z-index: 51;
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    box-shadow: var(--e3);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
  }

  .picker-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--s-3) var(--s-4);
    border-bottom: 1px solid var(--border-hairline);
  }

  .picker-body {
    padding: var(--s-3) var(--s-4) var(--s-4);
    overflow-y: auto;
  }

  .eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 11px;
    color: var(--ink-3);
    font-weight: 500;
  }

  .muted {
    color: var(--ink-3);
    font-size: 13px;
  }

  .error {
    color: var(--rose, #b00020);
    font-size: 12px;
    margin: var(--s-2) 0 0;
  }

  .picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--s-2);
  }

  .picker-tile {
    all: unset;
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: var(--s-2);
    align-items: center;
    padding: var(--s-3);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-md);
    background: var(--surface-1);
    cursor: pointer;
    text-align: left;
    transition: border-color 0.12s ease, box-shadow 0.12s ease;
  }

  .picker-tile:hover,
  .picker-tile:focus-visible {
    border-color: var(--mint);
    box-shadow: 0 0 0 3px var(--mint-tint);
    outline: none;
  }

  .tile-glyph {
    grid-row: 1 / span 2;
    width: 28px;
    height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--r-sm);
    background: var(--mint-tint);
    color: var(--mint-hover);
    font-size: 16px;
    font-weight: 600;
    line-height: 1;
  }

  .tile-label {
    grid-column: 2;
    grid-row: 1;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-1);
    line-height: 1.2;
  }

  .tile-hint {
    grid-column: 2;
    grid-row: 2;
    font-size: 11px;
    color: var(--ink-3);
    line-height: 1.3;
  }

  .step-back {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    margin-bottom: var(--s-3);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: var(--s-3);
  }

  .field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--s-3);
  }

  .field-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-3);
    font-weight: 600;
  }

  .field-hint {
    font-size: 11px;
    color: var(--ink-3);
  }

  .data-input,
  .text-input {
    font: inherit;
    padding: var(--s-2);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-md);
    background: var(--surface-1);
    color: var(--ink-1);
    width: 100%;
    box-sizing: border-box;
  }

  .data-input {
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 12px;
    resize: vertical;
    min-height: 120px;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--s-2);
    margin-top: var(--s-3);
  }
</style>
