# v4.22 — code-content support

Three coordinated changes that fix the SQL-in-callout case end-to-end:
rendering, IR primitive, and edit-path token cost.

## Trigger

The user surfaced a slide with a ~1.5 KB SQL query stuffed into a
`callout` body. Two failures observed:

1. PPTX export fails Stage-2 overflow validation. Root cause:
   `<code>` inside `.pengui-callout-body` inherits `white-space: normal`
   and `font-family: var(--font-body)`. Newlines collapse to spaces;
   the whole SQL becomes one giant body-font line that overflows
   horizontally AND, after natural wrap, vertically.
2. LLM edits hit "token" pressure. `apply_slide_node_edit` requires
   re-emitting the entire `new_node`; for a code-heavy node the LLM
   must reproduce the SQL as a JSON-escaped string each time, which
   is fragile (mis-escapes break the edit) AND output-token-heavy.

## Scope

### Phase A — CSS hotfix for inline `<code>`

Smallest change. Adds two rules so any `<code>` emitted by RichText
renders with:
- `font-family: var(--font-mono)`
- `white-space: pre-wrap`
- a subtle surface-alt background + small padding, only when there's
  no parent `<pre>` (so inline code-spans get a chip-y look but block
  code keeps a clean look).

This unblocks the user's existing slide TODAY without an IR migration.
The visual still won't be pretty for a 1.5KB SQL inside a callout —
that's what Phase B is for — but it stops being a validation failure.

Files:
- `src/domain/ir/compile/layout-css.ts` — add `code { … }` rule near
  the rich-text utility classes.

No schema change. No bump to `CURRENT_COMPILER_REVISION` (visual-only,
no SlideDocument shape change).

### Phase B — `code_block` IR leaf

New block-level primitive. Cleaner home for SQL / TS / Python code in
slides than abusing callout.

Schema:
```ts
{
  type: 'code_block',
  code: z.string().max(4000),   // raw source, whitespace preserved
  language: z.string().regex(/^[a-z][a-z0-9+#-]*$/).optional(),
  // soft cap to prevent slides becoming code dumps; agents that need
  // longer code should split across slides or link to a gist.
}
```

Render:
```html
<figure class="pengui-code-block" data-language="sql">
  <span class="pengui-code-block-language">SQL</span>
  <pre><code>WITH params AS ( … )</code></pre>
</figure>
```

CSS:
- `figure` wrapper: rounded surface-alt background, padding, border.
- `<pre><code>`: mono, `white-space: pre`, `overflow-x: auto` so very
  long lines scroll horizontally rather than push the slide bounds.
- Language label: small mono chip in the top-right corner.

Added to BOTH `LeafBlockNodeSchema` (for use inside cards/columns)
AND `LeafSlideNodeSchema` (for top-level slide body). NOT permitted
inside `chip` / `arrow` (no narrative shift; same rule that excludes
list there).

Stage-1 density lint: warn when a slide has more than ONE code_block —
that's almost always a "split into two slides" signal.

`CURRENT_COMPILER_REVISION` bumps because cached SlideDocuments at the
prior revision don't have a shape inventory entry for the new figure.
The editable-pptx walker treats `<pre>` as a background-disposition
fallback when present (rasterized in the slide PNG, no native shape).

Files:
- `src/domain/ir/nodes.ts` — new schema, add to leaf unions.
- `src/domain/ir/compile/node-renderers.ts` — renderer.
- `src/domain/ir/compile/layout-css.ts` — figure + pre + language CSS.
- `src/domain/validation/stage1/density.ts` (or wherever density lives)
  — code_block count lint.
- `src/domain/documents/slide-document-service.ts` — background-
  disposition handling for `pengui-code-block`.
- `src/build-info.ts` revision bump.

### Phase C — `apply_slide_text_patch` tool

Cuts the edit-path token cost for code-heavy slides. The existing
`apply_slide_field_edit` requires re-emitting the entire field value
(still ~400 tokens of JSON-escaped SQL); this tool patches a substring
in place.

Schema:
```ts
{
  deck_id, slide_id,
  path,            // path to the node (IR path)
  field,           // "code", "text", or RichText slot ("body[0].text")
  find: string,    // substring to replace — MUST occur exactly once
  replace: string, // replacement
}
```

Server logic:
- Resolve the node at `path`. Read the field's current string value.
- Validate `find` occurs exactly once. Zero → `NOT_FOUND`; >1 →
  `AMBIGUOUS` (caller must extend `find` to be unique).
- Build the new string and route through `setNodeFieldAtPath` so the
  recompile + validate pipeline matches the other field-edit tools.

Constraints:
- Works on any string-typed field on any node. For RichText, the
  caller addresses a specific run (e.g. `body[0].text` → text of the
  first run). To keep the field grammar parseable without exploding
  the regex, add a dotted-path mode: `name[idx].name`.
- One patch per call. Multi-edit is a future enhancement; agents that
  want it can call the tool repeatedly.

Files:
- `src/domain/ir/operations/set-field.ts` — extend `parseFieldName` to
  accept `name[idx].name` AND add a sibling `applyTextPatchAtPath`
  helper.
- `src/domain/decks/deck-service.ts` — `applySlideTextPatch` method.
- `src/tools/decks/apply-slide-text-patch.tool.ts` — new MCP tool.
- `src/tools/index.ts` — register.
- Tests for: exactly-one-match enforcement, idempotent failure on
  zero matches, ambiguous-error on multiple matches, recompile +
  validation runs.

No mirror for section mode in this phase — sections rarely hold code.
Add later if asked.

## Order of work

1. Phase A (CSS) — 15 min, unblocks the user's current slide.
2. Phase B (code_block primitive) — couple of hours, lots of touch
   points but each one is small.
3. Phase C (text patch tool) — ~1 hour, builds on existing set-field
   infrastructure.

Validation between phases:
- After A: regenerate the user's slide (need a repro script).
  Confirm SQL renders with newlines AND mono. Confirm overflow lint
  passes.
- After B: add an e2e that authors a code_block, exports PPTX,
  inspects that the figure is rasterized as background (not native
  text, because the SlideDocument walker shouldn't try to emit each
  line as a shape).
- After C: end-to-end test that calls the tool, verifies the field
  changes, verifies a re-export still passes.

### Phase D — readable default font sizes in PPTX export

Observed: a normal-text run lands at ~7pt in the exported PPTX, with
smaller runs at ~5.5pt. Both are below comfortable presentation
sizes. Target: body ≈ 10–12pt, small ≈ 8–9pt.

Root cause sketch (to confirm before changing):
- Soul defaults emit sizeBody=13 (px). Slide canvas is 1920×1080 px on
  a 13.33×7.5 in widescreen format. `scaledPt` in
  `src/domain/rendering/editable-pptx-exporter.ts:236` computes
  `pxToPt(value * textScale)` where
  `textScale = min(xInchesPerPx, yInchesPerPx) * 96`. For the wide
  format that's ~0.667. So 13px → ~6.5pt. That matches the symptom.

Likely fix path:
1. Bump soul typography baseline: sizeBody 13 → 18, sizeLabel 11 →
   13, sizeCaption 10 → 11. The default pengui souls underestimate
   what reads on a 16:9 slide at presentation distance.
2. Add a floor in `scaledPt`: never emit < 9pt for body / < 7pt for
   label, regardless of the input pixel size. The floor protects
   against custom souls that inherit the old defaults.
3. Validate against the architecture-diagram e2e — sizes should bump
   without breaking the layout (the soul-CSS path uses pixel sizes,
   not point sizes, so HTML render is unchanged).

Open question: should this be a soul-default-bump (cascades to all
existing souls) or a per-soul opt-in? Bias toward default-bump — the
current defaults are wrong for slides — and let any deck that wants
the old sizing override at the soul level.

Files:
- Soul typography defaults: hunt down where pengui souls are seeded
  (likely `src/domain/souls/`).
- `src/domain/rendering/editable-pptx-exporter.ts` — `scaledPt` floor.
- e2e architecture script(s) — bump LAYERS.typography to reflect new
  scale.

## Out of scope (v4.22)

- Syntax highlighting (would need a tokenizer; can ship later as
  pure CSS-classed highlights).
- Line numbers.
- Diff/patch tool that takes a unified diff. The single find/replace
  primitive covers ~90% of small surgical edits; bigger rewrites can
  still go through `apply_slide_node_edit`.
- Section-mode mirror of `apply_slide_text_patch`.
