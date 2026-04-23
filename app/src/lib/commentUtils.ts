import type { CommentTarget, CommentItem } from './bridge';

/** Short human-readable label for a comment's target, e.g. "slide:abc123". */
export function targetLabel(t: CommentTarget): string {
  switch (t.kind) {
    case 'slide': {
      const id = t.slide_id ?? '';
      return `slide:${id.slice(0, 8)}`;
    }
    case 'section': {
      const id = t.section_id ?? '';
      return `section:${id.slice(0, 8)}`;
    }
    case 'element':
      return `${t.container_id.slice(0, 6)}#${t.edit_id}`;
  }
}

/** Map a v4 comment kind to the Pill tone the UI uses. */
export function kindTone(kind: CommentItem['kind']): 'error' | 'warning' | 'note' | 'success' {
  switch (kind) {
    case 'revision':
      return 'warning';
    case 'question':
      return 'note';
    case 'approval':
      return 'success';
    case 'note':
    default:
      return 'note';
  }
}

/** CSS class suffix for kind-driven coloring. Matches selector suffixes used in
 *  CommentPin.svelte / CommentDrawer.svelte. */
export function kindClass(kind: CommentItem['kind']): string {
  return `kind-${kind}`;
}
