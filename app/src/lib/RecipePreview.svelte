<!--
  RecipePreview — renders a LayoutRecipe's HTML in a sandboxed iframe with srcdoc.
  Passes design tokens from the parent document into the iframe so the recipe
  renders in context.
-->
<script lang="ts">
  import type { LayoutRecipe } from './bridge';

  interface Props {
    recipe: LayoutRecipe;
    height?: number;
  }

  let { recipe, height = 220 }: Props = $props();

  // Build a minimal srcdoc that injects the parent's CSS variables, then renders the recipe HTML.
  const srcdoc = $derived(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  :root {
    --canvas: #F7F2EA;
    --surface-1: #FBF7F1;
    --surface-2: #F1EAE0;
    --ink-1: #1F2328;
    --ink-2: #4B5563;
    --ink-3: #6B7280;
    --border-subtle: #E6DDCF;
    --mint: #2FB8A6;
    --mint-tint: #D9F3EF;
    --r-sm: 10px;
    --r-md: 14px;
    --r-lg: 18px;
    --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px;
    font-family: "Inter", system-ui, sans-serif;
  }
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; background: var(--canvas); }
</style>
</head>
<body>${recipe.html}</body>
</html>`);
</script>

<div class="recipe-preview">
  <div class="recipe-header">
    <span class="recipe-name">{recipe.name}</span>
    {#if recipe.description}
      <span class="recipe-desc">{recipe.description}</span>
    {/if}
  </div>
  <div class="frame-wrap" style="height:{height}px">
    <iframe
      title="Recipe preview: {recipe.name}"
      {srcdoc}
      sandbox="allow-same-origin"
      scrolling="no"
      class="preview-frame"
    ></iframe>
  </div>
</div>

<style>
  .recipe-preview {
    border: 1px solid var(--border-subtle);
    border-radius: var(--r-lg);
    overflow: hidden;
    background: var(--surface-1);
  }

  .recipe-header {
    padding: var(--s-2) var(--s-4);
    border-bottom: 1px solid var(--border-hairline);
    display: flex;
    align-items: baseline;
    gap: var(--s-3);
    flex-wrap: wrap;
  }

  .recipe-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-1);
  }

  .recipe-desc {
    font-size: 11px;
    color: var(--ink-3);
  }

  .frame-wrap {
    overflow: hidden;
    position: relative;
    background: var(--canvas);
  }

  .preview-frame {
    width: 100%;
    height: 100%;
    border: none;
    display: block;
  }
</style>
