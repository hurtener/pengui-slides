<!--
  Pengui Slides — Tabs primitive (Cozy Premium).

  Renders a pill-row tab bar. Follows the visual conventions of the
  sibling study-audio-mcp Tabs component: warm background for inactive,
  mint for active.
-->
<script lang="ts">
  interface Tab {
    key: string;
    label: string;
  }

  interface Props {
    tabs: Tab[];
    active: string;
    onSelect: (key: string) => void;
  }

  let { tabs, active, onSelect }: Props = $props();
</script>

<div class="tab-bar">
  {#each tabs as tab (tab.key)}
    <button
      type="button"
      aria-pressed={active === tab.key}
      class={`tab ${active === tab.key ? 'active' : ''}`}
      onclick={() => onSelect(tab.key)}
    >
      {tab.label}
    </button>
  {/each}
</div>

<style>
  .tab-bar {
    display: flex;
    gap: var(--s-1);
    padding: var(--s-3) var(--s-4) 0;
    flex-wrap: wrap;
  }

  .tab {
    border-radius: var(--r-pill);
    padding: var(--s-2) var(--s-4);
    font-size: 13px;
    font-weight: 500;
    background: var(--surface-2);
    color: var(--ink-2);
    border: 1px solid transparent;
    transition:
      background-color var(--dur-micro) var(--ease),
      color var(--dur-micro) var(--ease),
      border-color var(--dur-micro) var(--ease);
  }

  .tab:hover:not(.active) {
    background: var(--surface-3);
    color: var(--ink-1);
  }

  .tab.active {
    background: var(--mint-tint);
    color: var(--mint-hover);
    border-color: transparent;
  }

  .tab:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--mint-tint);
  }
</style>
