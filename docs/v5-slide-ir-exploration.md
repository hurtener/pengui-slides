# Pengui Slides — SlideIR exploration (toward 5.0)

**Status:** historical exploration doc. v4.5 has shipped on this branch —
the IR-first authoring model is live. See "What actually shipped" below.

**Audience:** anyone landing on the experimental branch fresh; should be
self-contained without needing the originating conversation.

**Version:** drafted 2026-04-25, after v4.4 (commit `175427f`) shipped.
Updated 2026-04-26 with the as-shipped v4.5 scope.

---

## 0. What actually shipped in v4.5 (2026-04-26)

Broader than the conservative spike originally scoped in §12 below.

- **5 IR node types** (not 3): `hero`, `prose`, `image`, `callout`,
  `two_column`. `LeafSlideNode` excludes recursion inside `two_column`.
- **Both slides AND sections** use the same node grammar; mode-specific
  divergence stays at the compile boundary
  (`compileSlideIRToHtml` vs `compileSectionIRToHtml`).
- **No coexistence** — the user is the sole consumer on this experimental
  branch and explicitly waived the migration path. Tools take
  `slide_ir` / `section_ir` directly; the `html` argument is gone.
- **Removed**: substituter family (color/spacing/radius/font), surgical
  wrapper repair tools (`promote_section_root`, `wrap_section_root`),
  `section-wrapper-ops.ts`, raw-HTML editor mutation (the editor's
  `applyTextEdit` now throws `EDITOR_HTML_MUTATION_DISABLED` for
  `authored_ir` slides until the IR-aware editor surface ships in v4.6).
- **Added**: `validate_slide_ir` / `validate_section_ir` schema-only tools,
  `pengui://schema/slide-ir` resource (Zod → JSON Schema with notes).
- **Tests**: 905 unit tests passing. e2e script
  `scripts/e2e-section-flow.mjs` rewritten for the IR flow.

**Known follow-ups deferred to v4.6+:**

- IR-aware editor mutation (apply_node_edit / apply_run_edit driving IR
  patches; today the editor reads but cannot mutate IR slides).
- Wider IR catalog (table, chart-via-data, list, hero-with-image).
- Delta tools so common edits don't resubmit the whole body.

The strategic discussion below is preserved verbatim for context.

---

## 1. North star

**5.0 = WYSIWYG.** The destination as captured in the project's roadmap
memory: the agent and human edit the same artifact, see the same live
preview, and HTML stops being the agent's primary interface. Implies:

- Bidirectional state sync (not just refresh-on-mutate).
- Structured-block editing (the `apply_text_edit` / `apply_block_edit`
  pattern from v4, generalized).
- A shared "block" model so the slide and document editor primitives
  don't fork further than they already have.

v4.x is the path, not a pre-5.0 sprint. Each release is one coherent
theme. v4.3 = symmetry + correctness. v4.4 = agent context optimization
+ plumbing audit. The question this document explores: **what is v4.5+
on the path to 5.0?**

---

## 2. The reframe

Pengui Slides today is well described as:

> "HTML generator with preview."

The 5.0-shaped reframe is:

> "Structured visual artifact system with deterministic rendering."

Same deterministic core (Soul → recipe → validation → render). Different
agent contract: the agent emits structured intent, the server compiles
to HTML. HTML moves from "the agent's product" to "the compile target,"
the way assembly sits under a high-level language.

This reframe matches the saved WYSIWYG-compound prioritization filter:
favor features that move toward structured-block editing; reject
features that cement HTML-first thinking.

---

## 3. The originating proposal (Svedit + IR together)

Codex pre-processed the idea: use [Svedit](https://github.com/) — a
Svelte-based editable-JSON substrate — as the editing layer for an
intermediate representation (IR) the agent emits, which compiles to
the existing Pengui HTML/CSS contract.

Architecture sketch from that proposal:

```
Svedit-style editable JSON
        ↓
Pengui SlideIR
        ↓
compileSlideIRToHtml()
        ↓
validate_slide()
        ↓
render / export
```

Strong points the proposal got right:

- The reframe (structured artifact system, not HTML generator) is real.
- Svedit's mental model — JSON tree rendered by Svelte components, mixed
  text + structured content — fits Pengui better than rich-text editors
  (Tiptap/Prosemirror/etc.).
- The pipeline shape (IR → HTML → validate → export) keeps the
  deterministic core intact, which is the load-bearing thing we'd lose
  if an editor library owned the source of truth.

---

## 4. Counter-position: decouple IR from editor

The originating proposal bundled two decisions:
- **Adopt an IR.**
- **Pick Svedit as the editor library.**

This document argues for splitting them.

### Why decouple

1. **The IR is the hard problem, not the editor.** Designing a
   discriminated union of node types that expresses the slides agents
   currently produce — without escape hatches — is product design. Once
   `type: "hero"` ships, removing it is breaking. The editor library is
   replaceable; the IR is durable.

2. **Svedit alpha risk is real.** Their docs warn about copy/paste,
   browser support, mobile UX, selecting larger structures. Svedit
   itself suggests forking `Svedit.svelte`. If forking is the realistic
   outcome, "use Svedit" probably collapses into "maintain a fork of
   Svedit." Worth being honest about that upfront.

3. **The agent contract is half the product.** Today the agent emits
   HTML via `add_slide`. In IR-world it emits structured trees. Two
   contracts cannot coexist forever. That decision shapes the IR design
   more than the editor library does.

4. **Validation pipeline shifts shape.** Today's Stage 1 lints HTML
   syntactic correctness. In IR-world the compiled HTML is correct by
   construction; validation moves to IR semantic checks ("does this
   `metric_grid` have 2-6 items?"). That's not bad — it's clarifying —
   but it's a v5.0-shaped change to a load-bearing subsystem.

### Recommended sequencing

- **v4.5 spike:** SlideIR + `compileSlideIRToHtml` + agent-facing tools.
  No editor library yet. App still renders compiled HTML.
- **v4.6+:** expand IR coverage; agent migration; validation shift.
- **Editor library decision:** v4.7 or v4.8, based on what the IR shape
  actually demands. Candidates: Svedit, Tiptap, custom. "Custom" is on
  the table because Svedit suggests forking anyway.

The structured-artifact win is decoupled from the WYSIWYG-editor win
and can ship separately.

---

## 5. Why IR > HTML for agents

### Wins

1. **Fewer ways to be wrong.** Today's Stage 1 lint exists because HTML
   has dozens of failure modes (wrong root element, missing class, multi
   top-level nodes, literal hex outside soul, broken `<style>`, etc.).
   Most don't exist in IR — `{type: "hero", title: "..."}` cannot have
   a malformed root. Surgical-repair tools (`promote_section_root`,
   `wrap_section_root`) become unnecessary.

2. **Smaller payload per turn.** Slide HTML fragment ≈ 500-2000 chars.
   Equivalent IR ≈ 50-200 chars. Across a 30-section deck this is
   meaningful context-window pressure relieved.

3. **Semantic edits, not syntactic ones.** "Change to two-column with
   chart on left" → in HTML the agent rewrites the whole fragment; in
   IR it's a tree mutation. Diff between turns is meaningful.

4. **Validation moves up the stack.** Today: "is this CSS
   token-compliant?" (syntactic). With IR: "does this hero have a
   title? is this metric_grid count 2-6?" (semantic). Higher
   signal-to-noise.

5. **Refactor without breaking the back catalog.** Redesign how
   `metric_grid` renders (CSS-grid → flexbox), every existing IR still
   renders correctly. With HTML, every previously-emitted slide is
   frozen at its emit-time CSS.

6. **Soul changes propagate properly.** Today, soul changes only
   propagate if the agent used `var()` (hence v4.2 auto-substitute).
   In IR, the agent declares "primary accent color"; the compiler picks
   the var. Auto-substitute becomes structurally unnecessary.

7. **Round-trip with human edits is git-shaped.** Human edit in App =
   "node X.title changed" = one-line semantic diff. With HTML, even a
   typo fix produces a full-fragment diff.

8. **Recipes become type signatures.** Today recipes are HTML templates
   the agent loosely follows. In IR, a recipe is "accepts a hero +
   optional metric_grid + ...". Type-checked.

### Honest costs

- **Coverage trap.** IR can only express what its node types declare.
  HTML expresses anything. Under-design the type space and bespoke
  layouts become impossible. This is the most common failure mode of
  IR systems.
- **Migration corpus.** Every existing prompt, example, and recipe is
  HTML-shaped. Switching the agent contract is a real cost.
- **IR design is product design.** Deprecate-but-not-delete economics.
- **Bespoke is slower in IR.** For one-off custom layouts, HTML is
  faster (just emit CSS). In IR, the node type has to exist first.

### Net

For the ~80% of slides that fit a small set of templates, IR is
strictly better. For the long tail of bespoke layouts, keep HTML as an
escape hatch (probably as `{type: "raw_html", html: "..."}`, gated to
one-offs and still soul-token-validated). Big win: **agent stops
thinking about CSS plumbing, starts thinking about content structure.**

---

## 6. Node catalogue (~25 at 5.0)

Lean is a feature. A small set of well-composed primitives plus a strong
Design Soul produces more visual variety than a large set of weakly
composed ones. Reference: Notion / Coda / Confluence ship 30-50 blocks
but users touch 10-15 frequently.

### Layout / structural (~6)

| Node | Purpose |
|---|---|
| `page` | Slide canvas or doc page (kind discriminator) |
| `hero` | Title + subtitle + eyebrow + optional CTA |
| `two_column` | Symmetric or weighted split |
| `grid` | N-column responsive (covers three_column, four_column, image grids) |
| `stack` | Vertical flow with spacing |
| `cover` | Title page (mode-aware: slide cover vs doc cover) |

### Content leaves (~12)

| Node | Purpose |
|---|---|
| `heading` | h1-h6 hierarchy |
| `prose` | Rich text run (bold/italic/link/code inline) |
| `list` | Bullet / numbered / checklist |
| `image` | With optional caption |
| `figure` | Image + caption + reference number (doc-mode anchorable) |
| `table` | Small data; large-data variant later |
| `metric` | Single KPI |
| `metric_grid` | 2-6 metrics |
| `chart` | Bar/line/pie/donut (heavyweight; data + spec) |
| `quote` | Pull-quote with attribution |
| `callout` | Note / warning / tip / important |
| `code` | Code block with syntax language hint |

### Mode-specific (~4)

| Node | Mode | Purpose |
|---|---|---|
| `toc` | doc-only | Auto-generated from headings |
| `section_divider` | slide-only | Chapter break |
| `bibliography` | doc-only | References list |
| `page_break` | doc-only | Manual break hint |

### Utility / escape (~3)

| Node | Purpose |
|---|---|
| `divider` | Horizontal rule / spacer |
| `asset_ref` | Reference to a soul/deck-scoped asset |
| `raw_html` | Escape hatch; gated, validated, soul-token-checked |

**Total: ~25.** Hard cap recommended at ~30. Beyond that, agents start
failing to choose between similar nodes and the editor surface gets
unwieldy. If a real need emerges for the 31st, that's a signal the IR
design has a gap, not that the cap is wrong.

### Hardest single nodes (plan around them)

- **`chart`** — only node that carries data (not just structure), needs
  a renderer (vega-lite? custom SVG?), near-infinite configurability.
  Treat as its own mini-spike, probably v4.8 or v4.9.
- **`table`** for large data with PDF page-break pagination — Stage 2
  territory.

### Easiest wins early (v4.5 spike)

`hero`, `prose`, `image`, `callout`, `divider`. Prove the IR pattern
without complex rendering or data binding.

---

## 7. Agent surface (tools + schemas + resources)

### Why nodes ≠ tools

Per-node-type tools (`add_hero`, `add_metric_grid`, ...) sound natural
but bloat the tool listing without buying real composition:

- ~25 tools added to today's ~40 = ~65 in the listing. Every tool
  description costs ~5KB of session context before the agent does
  anything.
- Composition is awkward: `two_column { left: metric_grid, right:
  prose }` would need 3 tool calls plus pending-children orchestration.
  The tree literal is the natural unit; per-node tools fight that.

### Tool surface (~8 instead of ~25)

```
add_slide(slide_ir)
update_slide(slide_id, slide_ir)
update_slide_block(slide_id, path, block_ir)   // surgical edit at a path
validate_slide_ir(slide_ir)                     // dry-run, no storage

add_section(section_ir)
update_section(section_id, section_ir)
update_section_block(section_id, path, block_ir)
validate_section_ir(section_ir)
```

The discriminated union is the entire type system, expressed once in
the schemas — not duplicated across 25 tool descriptions.

### How agents get typed hints (5 mechanisms)

1. **Zod discriminated union → JSON Schema in `inputSchema`.** Load-
   bearing. MCP clients surface `inputSchema` natively. A union like:

   ```ts
   const SlideNodeSchema: z.ZodType = z.lazy(() =>
     z.discriminatedUnion('type', [
       z.object({ type: z.literal('hero'), title: z.string(), subtitle: z.string().optional() }),
       z.object({ type: z.literal('two_column'), left: z.array(SlideNodeSchema), right: z.array(SlideNodeSchema) }),
       z.object({ type: z.literal('metric_grid'), items: z.array(MetricSchema).min(2).max(6) }),
       // ...
     ])
   );
   ```

   Agent sees every valid shape, every required field, every constraint.
   No prose needed for "use hero with a title."

2. **`outputSchema` on every tool.** Agent knows what comes back without
   parsing prose. Pairs with the v4.3 `structuredContent` contract.

3. **MCP resource for the node catalogue:** `pengui://schema/slide-ir`.
   Same pattern as v4.4's `get_design_tokens` — lightweight resource the
   agent fetches once per session and caches. Returns the discriminated
   union as JSON Schema.

4. **Per-node usage docs as resources:** `pengui://docs/nodes/{type}`.
   Each type gets ~5 lines:
   ```
   hero — Opening or transition slide.
   Required: title (string, ≤80 chars).
   Optional: subtitle, eyebrow, cta.
   Composes with: nothing (terminal node).
   Example: { type: "hero", title: "Q3 Review", eyebrow: "FY25" }
   ```
   Agent fetches by type when it needs depth. Lazy load.

5. **Validation errors that name the schema path.** `issue at
   slide_ir.children[2].type=metric_grid: items must have 2-6 entries
   (got 1)`. Agent learns the constraint from the error itself, not
   from re-reading docs. Same auto-fix philosophy as v4.1/v4.2 applied
   to schema violations.

### Recipe layer (worth flagging)

Today's recipes are HTML templates. In IR-world they become **parametric
type signatures**:

```
recipe "executive-summary" =
  stack [
    hero { title: $required, subtitle: $optional }
    metric_grid { items: $required (2-4) }
    prose { body: $optional }
  ]
```

Agent picks a recipe (already a v4 verb), schema tells it what slots
exist, recipe compiles into IR. Bridge from "agent imagines a slide"
to "agent composes from known-good shapes." Recipes become first-class
typed objects, not template strings.

---

## 8. Phasing across releases

| Release | Scope | Nodes | Goal |
|---|---|---|---|
| **v4.5 spike** | 3-5 nodes | hero, two_column, prose, image (+ maybe callout) | Prove the round-trip end-to-end. New tools coexist with existing HTML tools. |
| **v4.6** | +5-6 nodes | heading, list, callout, metric_grid, divider | Cover ~70% of typical slides |
| **v4.7** | +4-5 nodes | grid, table, quote, figure, code | Cover most documents |
| **v4.8** | +mode-specific | toc, section_divider, bibliography, page_break, cover | Slide+doc parity |
| **v4.9** | +heavyweights | chart, raw_html, asset_ref polish | Production-ready agent surface |
| **5.0** | full set + editor | 25 nodes + WYSIWYG surface | Ship |

Editor library decision (Svedit / Tiptap / custom) sits around v4.8
once IR shape is proven.

---

## 9. Validation pipeline shifts

Today's Stage 1 lints **HTML syntactic correctness**. In IR-world the
compiled HTML is correct by construction. Validation moves to:

**IR semantic correctness:**
- "this `metric_grid` requires 2-6 items"
- "this `hero` requires a title; subtitle is optional"
- "this `two_column` cannot nest another `two_column` (avoid grid
  recursion in narrow viewports)"
- "this `chart` requires a `data` field with at least one row"

**HTML correctness (Stage 1 today)** becomes mostly redundant. Token
compliance is structural (the IR `color` field is a token reference,
not a literal hex). The lint surface shrinks dramatically.

**Stage 2 (Playwright pagination, render-truth) stays.** That's
true-output validation, not syntactic. A `metric_grid` with 6 large
items might still overflow a slide canvas; only a real render catches
that.

---

## 10. Migration strategy

**Coexistence required.** Cannot break existing HTML-emitting agents
overnight. Three-phase approach:

### Phase A (v4.5-v4.7): IR-alongside

- New tools `add_slide_ir`, `add_section_ir` etc.
- Existing `add_slide`, `add_section` tools keep working.
- Both compile to the same stored HTML.
- Decks track which path each slide was authored through (metadata
  field `source_kind: "html" | "ir"`).

### Phase B (v4.8-v4.9): IR-preferred

- Tool descriptions mark HTML-emit tools as legacy / deprecated.
- All examples / docs use IR.
- Existing HTML decks migrate lazily on next edit (HTML → IR via
  best-effort parser; agent reviews and confirms).
- New decks default to IR.

### Phase C (5.0): IR-only

- HTML-emit tools removed (or kept as `raw_html` escape hatch only).
- IR is the source of truth on disk.
- Editor library lands.

---

## 11. Open questions / risks

### Things to surface before committing

1. **Bundle size.** Whatever editor library lands (Svedit + custom code,
   or Tiptap + custom, or fully custom) — what's the gzipped impact on
   the iframe-loaded MCP App?

2. **Two parallel agent contracts.** How long does HTML coexist with
   IR? Six months? A year? Forever as escape hatch?

3. **Existing slide migration.** Decks already exist. Migrate eagerly
   to IR, or only on next edit? Eager migration risks losing intent;
   lazy migration leaves a permanent two-format problem.

4. **What "valid" means in IR-world.** Today validation rejects literal
   hex without a soul match. In IR, the agent picked from a constrained
   palette upstream. Does the validator still gate, or does it become a
   backstop?

5. **The `chart` node.** Vega-lite spec? Custom SVG generator? PNG via
   matplotlib service? This single node could double the IR's
   complexity.

6. **The `raw_html` escape hatch.** How often do agents reach for it?
   If >20% of slides need it, the IR coverage is wrong. If <5%, IR is
   the right shape and the escape is acceptable.

7. **Recipe migration.** Existing recipes are HTML; need to either
   port them to IR (manual effort) or auto-parse them (lossy).

### Things explicitly NOT decided in this doc

- Editor library choice (Svedit vs Tiptap vs custom). Defer to v4.7+.
- IR storage format on disk (JSON in the existing section/slide store?
  separate field? new table?). Defer to v4.5 spike.
- IR versioning strategy (when node schemas evolve). Defer to v4.6.
- Wayfinder generalization. Real but premature. Park as motivation.

### Things this doc does NOT walk back from v4.x

- MCP-App-primary direction (no parallel web UI / REST).
- Auto-fix philosophy when intent is unambiguous.
- Surgical repair tools when intent is ambiguous (these may simply
  become unnecessary in IR-world rather than being removed).
- Tool descriptions self-contained for an agent without repo access.
- Every new affordance has an e2e check.

---

## 12. v4.5 spike — concrete scope

**Success criterion:** *"Can a structured IR become valid Pengui slide
HTML, round-trip from a real agent call via MCP, and validate cleanly
end-to-end?"*

**Scope:**

1. **Define `SlideIR` for 3 node types.**
   - `hero { title, subtitle?, eyebrow? }`
   - `prose { body }` (with limited inline rich-text: bold/italic/link)
   - `image { asset_id, caption? }`
   - Plus the slide container that holds an array of these.

2. **Implement `compileSlideIRToHtml(ir, soul, format)`.**
   - Pure function, deterministic.
   - Output passes existing Stage 1 validation by construction.
   - Uses Soul tokens (no literal styling).

3. **Add `add_slide_from_ir` MCP tool.**
   - Takes `deck_id` + `slide_ir`.
   - Compiles, stores HTML, validates, returns `{slide_id, slide_ir,
     validation, structuredContent}`.
   - Coexists with `add_slide` (HTML path stays).

4. **Add `validate_slide_ir` MCP tool.**
   - Dry-run: takes `slide_ir`, returns IR-semantic validation.
   - No storage side effects.

5. **Resource: `pengui://schema/slide-ir`.**
   - Returns Zod-derived JSON Schema for the discriminated union.

6. **Tests:**
   - Unit: compileSlideIRToHtml for each node type.
   - Unit: IR semantic validation (missing required field, wrong type).
   - e2e: agent emits IR → tool accepts → stored slide validates →
     render_preview succeeds.

**Out of scope for v4.5:**

- Editor library (no Svedit, no Tiptap, no custom editor).
- All ~25 nodes — only 3.
- Migration of existing HTML slides.
- Section / document mode (slides only first).
- Recipe rewrite as IR templates.
- Validation pipeline shift (Stage 1 still lints the compiled HTML).

**Estimated effort:** ~3-4 days of focused work. Comparable to v4.3
or v4.4 in scope.

**Decision point at end of spike:**

- If IR + tooling + validation feels coherent and the agent UX is
  clearly better → continue to v4.6 IR expansion.
- If IR design surfaces fundamental coverage gaps (e.g. the 3 nodes
  can't even express a typical slide) → reassess; the IR shape may
  need a rethink, or the project may stay on HTML longer.
- If the existing HTML path turns out to handle these cases just as
  well with smaller effort → the experiment was worth running and the
  branch can stay parked.

---

## Appendix A — Why not Tiptap

Tiptap is great for:
> Edit this paragraph. Edit this heading. Edit this bullet list.

Pengui Slides needs:
> Edit this slide component. Edit this metric card. Edit this chart
> caption. Edit this image-grid item. Edit this section layout.

Tiptap models structured nodes via prosemirror's schema, which is also
a tree. The reason to favor Svedit (when the editor decision comes) is
not that Tiptap can't model structured nodes — it's that Svedit's tree
is *your* tree (Svelte components rendering *your* IR), not a
prosemirror schema you have to map into. That's the precise argument;
not "Tiptap is bad."

If Svedit's alpha state proves blocking and Tiptap's mapping cost is
lower than maintaining a Svedit fork, Tiptap remains a viable choice.

## Appendix B — Wayfinder generalization (parked)

The IR pattern generalizes to other artifact types: query intent → SQL
→ chart → metric cards → narrative → assumptions → caveats. A
"Wayfinder answer" could become an editable structured artifact rather
than markdown.

This is real and important strategically. **Explicitly parked** for
this exploration:

- Don't let Wayfinder requirements leak into Pengui SlideIR design.
- Don't conflate two products at the v4.5 spike scope.
- Use as motivation for IR design (evidence that structured > rich-text
  everywhere), not as scope.

When Wayfinder picks up later, the Pengui IR patterns become reference
material — not the other way around.

## Appendix C — Memory references

This document distills and extends three persisted memories:

- `project_roadmap_to_50.md` — incremental 4.x cadence, 5.0 = WYSIWYG.
- `feedback_wysiwyg_compound_filter.md` — favor compound features,
  reject HTML-cementing ones.
- `feedback_mcp_app_primary.md` — keep the MCP App as the user surface,
  no parallel web UI / REST.

If this exploration ships, those memories should be updated to point
to the SlideIR plan as the active path.
