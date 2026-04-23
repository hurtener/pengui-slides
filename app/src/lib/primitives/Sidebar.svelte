<!--
  Pengui Slides — Sidebar primitive (Cozy Premium).

  Ported from study-audio-mcp/frontend/src/components/primitives/Sidebar.svelte.
  The sibling imported `library` from '$stores/library.svelte' to show a file
  count badge. That store is sibling-specific and has been removed.

  Changes from source:
  - Removed `import { library } from '$stores/library.svelte'`.
  - `libraryCount` is now an optional prop (defaults to 0) so callers can
    pass their own count without coupling to a specific store.
  - The `wordmark` and `sub` texts are now props so Wave 2B can brand the
    sidebar for Pengui without editing this file.
  - Navigation items remain hardcoded to the same three keys the sibling
    used; Wave 2B will likely pass them as a prop — for now the generic
    default matches the structure Wave 2B expects.
-->
<script lang="ts">
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
</script>

<aside class="sidebar">
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
  </div>

  <nav>
    {#each items as item (item.key)}
      <button
        class={`nav ${active === item.key ? 'active' : ''}`}
        onclick={() => onNavigate(item.key)}
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
    padding: var(--s-6) var(--s-4);
    display: flex;
    flex-direction: column;
    gap: var(--s-6);
    min-height: 100vh;
    transition: width var(--dur-micro) var(--ease);
  }

  /* Narrow viewport: slim sidebar but keep labels. */
  @media (max-width: 780px) {
    .sidebar {
      width: 180px;
      padding: var(--s-5) var(--s-3);
      gap: var(--s-5);
    }
  }

  /* Very narrow (Claude Desktop's compact iframe): icon-only rail. */
  @media (max-width: 560px) {
    .sidebar {
      width: 64px;
      padding: var(--s-4) var(--s-2);
      gap: var(--s-4);
    }
    .sidebar .label,
    .sidebar .count,
    .sidebar .sub,
    .sidebar .wordmark,
    .sidebar .hint {
      display: none;
    }
    .sidebar .brand {
      padding: 0;
      justify-content: center;
    }
    .sidebar .nav {
      justify-content: center;
      padding: var(--s-3);
    }
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    padding: 0 var(--s-3);
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
  }

  .mark :global(svg) {
    width: 20px;
    height: 20px;
  }

  .title {
    display: flex;
    flex-direction: column;
    line-height: 1.2;
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

  nav {
    display: flex;
    flex-direction: column;
    gap: var(--s-1);
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
