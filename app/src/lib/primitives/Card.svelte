<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    padding?: 'sm' | 'md' | 'lg' | 'none';
    elevation?: 'flat' | 'e1' | 'e2';
    children: Snippet;
    class?: string;
  }

  let { padding = 'md', elevation = 'e1', children, class: className }: Props = $props();
</script>

<div class={`card pad-${padding} elev-${elevation} ${className ?? ''}`}>
  {@render children()}
</div>

<style>
  .card {
    background: var(--surface-1);
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    transition:
      box-shadow var(--dur-micro) var(--ease),
      border-color var(--dur-micro) var(--ease);
  }

  .elev-flat {
    box-shadow: none;
  }

  .elev-e1 {
    box-shadow: var(--e1);
  }

  .elev-e2 {
    box-shadow: var(--e2);
  }

  .pad-none {
    padding: 0;
  }

  .pad-sm {
    padding: var(--s-3) var(--s-4);
  }

  .pad-md {
    padding: var(--s-5);
  }

  .pad-lg {
    padding: var(--s-6);
  }
</style>
