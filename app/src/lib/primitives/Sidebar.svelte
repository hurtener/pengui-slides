<!--
  Pengui Slides — Sidebar primitive (Cozy Premium).

  Collapsible: expanded it shows brand + nav labels + footer hint;
  collapsed it renders as a 56 px icon rail with title tooltips.

  The collapse state is owned here (localStorage-backed) so the parent
  doesn't have to thread it everywhere. The default on first open is
  auto-collapsed below `AUTO_COLLAPSE_WIDTH` so the app stays usable
  inside Claude Desktop's narrow iframe.
-->
<script lang="ts">
  import { onMount } from 'svelte';

  interface NavItem {
    key: string;
    label: string;
    icon: 'library' | 'plus' | 'cog';
  }

  interface Props {
    active: string;
    onNavigate: (route: string) => void;
    wordmark?: string;
    sub?: string;
    libraryCount?: number;
    items?: NavItem[];
  }

  let {
    active,
    onNavigate,
    wordmark = 'Pengui',
    sub = 'Slides',
    libraryCount = 0,
    items = [
      { key: 'decks',  label: 'Decks',    icon: 'library' },
      { key: 'editor', label: 'Editor',   icon: 'plus' },
      { key: 'export', label: 'Export',   icon: 'cog' }
    ]
  }: Props = $props();

  const STORAGE_KEY = 'pengui-sidebar-collapsed';
  const AUTO_COLLAPSE_WIDTH = 900;

  let collapsed = $state(false);
  let mounted = $state(false);

  onMount(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === '1') collapsed = true;
      else if (stored === '0') collapsed = false;
      else collapsed = window.innerWidth < AUTO_COLLAPSE_WIDTH;
    } catch {
      collapsed = window.innerWidth < AUTO_COLLAPSE_WIDTH;
    }
    mounted = true;
  });

  function toggle(): void {
    collapsed = !collapsed;
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
    } catch {
      // storage unavailable — ignore
    }
  }
</script>

<aside class={`sidebar ${collapsed ? 'collapsed' : ''} ${mounted ? '' : 'pre-hydrate'}`}>
  <div class="brand">
    <div class="mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <rect x="3" y="4" width="18" height="14" rx="2.5" />
        <path d="M8 8h8M8 12h5" stroke-linecap="round" />
      </svg>
    </div>
    <div class="title">
      <span class="wordmark">{wordmark}</span>
      <span class="sub">{sub}</span>
    </div>
    <button
      type="button"
      class="collapse-btn"
      onclick={toggle}
      aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      aria-pressed={collapsed}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">
        {#if collapsed}
          <path d="M6 4l4 4-4 4" stroke-linecap="round" stroke-linejoin="round" />
        {:else}
          <path d="M10 4l-4 4 4 4" stroke-linecap="round" stroke-linejoin="round" />
        {/if}
      </svg>
    </button>
  </div>

  <nav>
    {#each items as item (item.key)}
      <button
        class={`nav ${active === item.key ? 'active' : ''}`}
        onclick={() => onNavigate(item.key)}
        title={collapsed ? item.label : undefined}
        aria-label={item.label}
      >
        <span class="icon" aria-hidden="true">
          {#if item.icon === 'library'}
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="3" y="4" width="4" height="13" rx="1.2" />
              <rect x="9" y="4" width="4" height="13" rx="1.2" />
              <path d="M15 5l2.5 12" stroke-linecap="round" />
            </svg>
          {:else if item.icon === 'plus'}
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M10 4v12M4 10h12" stroke-linecap="round" />
            </svg>
          {:else}
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="10" cy="10" r="2.6" />
              <path d="M10 2v2M10 16v2M4 10H2M18 10h-2M5 5l1.4 1.4M13.6 13.6L15 15M5 15l1.4-1.4M13.6 6.4L15 5" stroke-linecap="round" />
            </svg>
          {/if}
        </span>
        <span class="label">{item.label}</span>
        {#if item.key === 'decks' && libraryCount > 0}
          <span class="count">{libraryCount}</span>
        {/if}
      </button>
    {/each}
  </nav>

  <div class="footer">
    <p class="hint">Presentation &amp; document generation — powered by MCP.</p>
  </div>
</aside>

<style>
  .sidebar {
    width: 240px;
    flex-shrink: 0;
    background: var(--surface-3);
    border-right: 1px solid var(--border-subtle);
    padding: var(--s-5) var(--s-4);
    display: flex;
    flex-direction: column;
    gap: var(--s-5);
    min-height: 100vh;
    transition: width var(--dur-base) var(--ease);
  }

  /* Avoid a single expand→collapse flash on first paint while the
     stored preference is being read. */
  .sidebar.pre-hydrate {
    transition: none;
  }

  .sidebar.collapsed {
    width: 56px;
    padding: var(--s-4) var(--s-2);
    gap: var(--s-4);
    align-items: center;
  }

  .sidebar.collapsed .label,
  .sidebar.collapsed .count,
  .sidebar.collapsed .title,
  .sidebar.collapsed .hint {
    display: none;
  }

  .sidebar.collapsed .brand {
    padding: 0;
    justify-content: center;
  }

  .sidebar.collapsed .nav {
    justify-content: center;
    padding: var(--s-2);
    width: 40px;
  }

  /* Emergency fallback for pathological iframe widths — force collapsed
     look even if JS has not hydrated yet. */
  @media (max-width: 560px) {
    .sidebar:not(.collapsed) {
      width: 56px;
      padding: var(--s-4) var(--s-2);
      gap: var(--s-4);
      align-items: center;
    }
    .sidebar:not(.collapsed) .label,
    .sidebar:not(.collapsed) .count,
    .sidebar:not(.collapsed) .title,
    .sidebar:not(.collapsed) .hint {
      display: none;
    }
    .sidebar:not(.collapsed) .nav {
      justify-content: center;
      padding: var(--s-2);
    }
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: 0 var(--s-2);
    position: relative;
  }

  .mark {
    width: 32px;
    height: 32px;
    border-radius: var(--r-md);
    background: var(--mint-tint);
    color: var(--mint);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .mark :global(svg) {
    width: 20px;
    height: 20px;
  }

  .title {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
    flex: 1;
    min-width: 0;
  }

  .wordmark {
    font-weight: 600;
    color: var(--ink-1);
    letter-spacing: -0.01em;
  }

  .sub {
    font-size: 12px;
    color: var(--ink-3);
  }

  .collapse-btn {
    width: 24px;
    height: 24px;
    border-radius: var(--r-pill);
    color: var(--ink-3);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition:
      background-color var(--dur-micro) var(--ease),
      color var(--dur-micro) var(--ease);
    flex-shrink: 0;
  }

  .collapse-btn:hover {
    background: rgba(255, 255, 255, 0.5);
    color: var(--ink-1);
  }

  .collapse-btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--mint-tint);
  }

  .collapse-btn svg {
    width: 14px;
    height: 14px;
  }

  .sidebar.collapsed .collapse-btn {
    position: absolute;
    top: 38px;
    right: -12px;
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    box-shadow: var(--e1);
    z-index: 2;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
    width: 100%;
  }

  .nav {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: var(--s-3) var(--s-3);
    border-radius: var(--r-md);
    color: var(--ink-2);
    font-size: 14px;
    font-weight: 500;
    text-align: left;
    transition:
      background-color var(--dur-micro) var(--ease),
      color var(--dur-micro) var(--ease);
  }

  .nav:hover {
    background: rgba(255, 255, 255, 0.4);
    color: var(--ink-1);
  }

  .nav.active {
    background: var(--mint-tint);
    color: var(--mint-hover);
  }

  .nav:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--mint-tint);
  }

  .icon {
    display: inline-flex;
    color: inherit;
    flex-shrink: 0;
  }

  .icon :global(svg) {
    width: 18px;
    height: 18px;
  }

  .label {
    flex: 1;
  }

  .count {
    font-size: 11px;
    font-weight: 500;
    color: var(--ink-3);
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    padding: 2px 8px;
    border-radius: var(--r-pill);
  }

  .nav.active .count {
    background: var(--surface-1);
    color: var(--mint-hover);
    border-color: transparent;
  }

  .footer {
    margin-top: auto;
    padding: var(--s-3) var(--s-3);
  }

  .hint {
    font-size: 12px;
    color: var(--ink-3);
    line-height: 1.5;
  }
</style>
