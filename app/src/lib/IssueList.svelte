<script lang="ts">
  export type IssueListItem = {
    id: string;
    message: string;
  };

  interface Props {
    title?: string;
    tone?: 'error' | 'warning' | 'info';
    issues?: IssueListItem[];
  }

  let { title = '', tone = 'info', issues = [] }: Props = $props();
</script>

<section class={`issue-group tone-${tone}`}>
  {#if title}
    <h4>{title}</h4>
  {/if}
  <ul>
    {#each issues as issue (issue.id)}
      <li>{issue.message}</li>
    {/each}
  </ul>
</section>

<style>
  .issue-group {
    margin-top: var(--s-3);
    padding: var(--s-3);
    border-radius: var(--r-md);
  }

  .tone-error {
    background: var(--error-tint);
  }

  .tone-warning {
    background: var(--warning-tint);
  }

  .tone-info {
    background: var(--mint-tint);
  }

  h4 {
    margin: 0 0 var(--s-2);
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-1);
  }

  ul {
    margin: 0;
    padding-left: var(--s-5);
    font-size: 13px;
    color: var(--ink-2);
  }

  li + li {
    margin-top: var(--s-1);
  }
</style>
