<!--
  TokenSwatch — renders one design token visually based on its layer type.

  Layer   → presentation
  color   → filled color chip + hex label
  spacing → size box (width proportional to value)
  typography → font-stack name preview
  shape   → rounded-corner demo rectangle
  depth   → shadow card demo
  default → plain text value
-->
<script lang="ts">
  interface Props {
    name: string;
    value: string;
    layer: string;
  }

  let { name, value, layer }: Props = $props();

  // Normalise layer name so "color", "colours", "colors" all match.
  function inferLayerKind(l: string, v: string): 'color' | 'spacing' | 'typography' | 'shape' | 'depth' | 'other' {
    const lo = l.toLowerCase();
    if (lo.includes('color') || lo.includes('colour') || lo.includes('palette') || v.startsWith('#') || v.startsWith('rgb') || v.startsWith('hsl')) return 'color';
    if (lo.includes('spacing') || lo.includes('space') || lo.includes('size')) return 'spacing';
    if (lo.includes('type') || lo.includes('font') || lo.includes('text')) return 'typography';
    if (lo.includes('shape') || lo.includes('radius') || lo.includes('border-radius')) return 'shape';
    if (lo.includes('depth') || lo.includes('shadow') || lo.includes('elevation')) return 'depth';
    return 'other';
  }

  const layerKind = $derived(inferLayerKind(layer, value));

  /** Parse a pixel value like "16px" → number, clamped to [8, 80]. */
  function parseSpacingPx(v: string): number {
    const n = parseFloat(v);
    if (isNaN(n)) return 20;
    return Math.max(8, Math.min(80, n));
  }

  /** Parse a border-radius value → CSS value (passthrough). */
  function parseRadius(v: string): string {
    return v;
  }
</script>

<div class="swatch-row">
  <div class="swatch-demo" aria-hidden="true">
    {#if layerKind === 'color'}
      <div class="chip" style="background:{value}; border-color: color-mix(in srgb, {value} 70%, #000 30%);"></div>
    {:else if layerKind === 'spacing'}
      <div class="spacing-box" style="width:{parseSpacingPx(value)}px; height:{parseSpacingPx(value) * 0.5}px;"></div>
    {:else if layerKind === 'typography'}
      <span class="font-sample" style="font-family:{value}">Aa</span>
    {:else if layerKind === 'shape'}
      <div class="shape-demo" style="border-radius:{parseRadius(value)};"></div>
    {:else if layerKind === 'depth'}
      <div class="shadow-demo" style="box-shadow:{value};"></div>
    {:else}
      <div class="other-chip"></div>
    {/if}
  </div>
  <div class="swatch-info">
    <span class="swatch-name">{name}</span>
    <span class="swatch-value">{value}</span>
  </div>
</div>

<style>
  .swatch-row {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-2) 0;
    border-bottom: 1px solid var(--border-hairline);
  }

  .swatch-row:last-child {
    border-bottom: none;
  }

  .swatch-demo {
    flex-shrink: 0;
    width: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Color chip */
  .chip {
    width: 32px;
    height: 32px;
    border-radius: var(--r-sm);
    border: 1px solid var(--border-subtle);
  }

  /* Spacing box */
  .spacing-box {
    background: var(--mint-tint);
    border: 1px solid var(--mint);
    border-radius: 3px;
    min-width: 8px;
  }

  /* Typography sample */
  .font-sample {
    font-size: 22px;
    font-weight: 600;
    color: var(--ink-1);
    line-height: 1;
  }

  /* Shape demo */
  .shape-demo {
    width: 32px;
    height: 32px;
    background: var(--mint-tint);
    border: 1.5px solid var(--mint);
  }

  /* Shadow demo */
  .shadow-demo {
    width: 32px;
    height: 32px;
    background: var(--surface-1);
    border-radius: var(--r-sm);
    border: 1px solid var(--border-hairline);
  }

  /* Other */
  .other-chip {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border-subtle);
  }

  .swatch-info {
    min-width: 0;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .swatch-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--ink-1);
    font-family: var(--font-mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .swatch-value {
    font-size: 11px;
    color: var(--ink-3);
    font-family: var(--font-mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
