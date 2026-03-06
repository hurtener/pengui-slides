<script lang="ts">
  import type { ValidationIssue } from './types';

  export let title = '';
  export let tone: 'error' | 'warning' | 'info' = 'info';
  export let issues: ValidationIssue[] = [];
</script>

<section class={`issue-group ${tone}`}>
  <h4>{title}</h4>
  <ul>
    {#each issues as issue}
      <li>{issue.message}</li>
    {/each}
  </ul>
</section>

<style>
  .issue-group {
    margin-top: 12px;
    padding: 12px;
    border-radius: 16px;
  }

  .issue-group.error {
    background: rgba(182, 71, 49, 0.1);
  }

  .issue-group.warning {
    background: rgba(200, 135, 17, 0.12);
  }

  .issue-group.info {
    background: rgba(31, 95, 171, 0.1);
  }

  h4 {
    margin: 0;
    font-family: "Iowan Old Style", "Palatino Linotype", serif;
    font-weight: 600;
  }

  ul {
    margin: 8px 0 0;
    padding-left: 18px;
  }
</style>
