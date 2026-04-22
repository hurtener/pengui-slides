<script lang="ts">
  import Pill from './primitives/Pill.svelte';
  import type { FormatKind } from './types';

  interface Props {
    format?: FormatKind;
    size?: 'sm' | 'md';
  }

  let { format = 'slides_16_9', size = 'sm' }: Props = $props();

  const labelMap: Record<FormatKind, string> = {
    slides_16_9: 'Slides · 16:9',
    print_a4_portrait: 'Print · A4',
    print_letter_portrait: 'Print · Letter',
  };

  const toneMap: Record<FormatKind, 'mint' | 'terracotta'> = {
    slides_16_9: 'mint',
    print_a4_portrait: 'terracotta',
    print_letter_portrait: 'terracotta',
  };

  const label = $derived(labelMap[format] ?? 'Slides · 16:9');
  const tone = $derived(toneMap[format] ?? 'mint');
</script>

<Pill {tone} {size}>{label}</Pill>
