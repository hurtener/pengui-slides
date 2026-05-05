# v4.14 — implementation plan

This is the build plan for "Slide chrome," the second phase of the
gap-closing roadmap (`PLAN_v4.13_design_quality.md`). One new IR concept
(deck-level chrome) plus a per-slide override. The single highest-leverage
visual change in the whole roadmap — every slide gains persistent
brand chrome.

## What ships in v4.14 (scope-cut for one session)

The roadmap's full DeckChrome includes section badges that auto-derive
from preceding `section_divider` nodes and PPTX slide-master mapping.
Both are real engineering and out of scope for this release. v4.14 ships:

- DeckChrome with header + footer regions (left / center / right slots)
- ChromeSlot kinds: `'logo'`, `'text'`, `'page_number'`
- Per-slide `chrome_override: 'inherit' | 'hide'` (hide = cover behavior)
- `showOnCover: boolean` default false applied at deck-service level
- Chrome rendered per-slide in HTML (not via PPTX slide masters — that's
  an additive optimization for v4.14.1)

**Deferred to v4.14.1+:**
- `'section_badge'` slot kind that auto-pulls from nearest preceding
  section_divider (needs a deck-context walker)
- PPTX slide-master mapping (per-slide chrome shapes still work, just
  duplicated — fine for the visual test, costs file size)
- App-side chrome editor UI (consistent with v4.13 — engine first, App
  catches up in the next App-touching release)

## Schema design

**New file `src/domain/ir/chrome.ts`:**

```ts
export const ChromeSlotSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('logo'),
    asset_id: z.string().min(1),
    height: z.enum(['sm', 'md', 'lg']).optional(), // token-driven sizes
  }).strict(),
  z.object({
    kind: z.literal('text'),
    content: RichTextSchema,
  }).strict(),
  z.object({
    kind: z.literal('page_number'),
    format: z.enum(['1', '1/N', '01']).optional(),  // default: '1 / N'
  }).strict(),
]);

export const ChromeRegionSchema = z.object({
  left: ChromeSlotSchema.optional(),
  center: ChromeSlotSchema.optional(),
  right: ChromeSlotSchema.optional(),
}).strict();

export const DeckChromeSchema = z.object({
  header: ChromeRegionSchema.optional(),
  footer: ChromeRegionSchema.optional(),
  /** Whether the cover slide (position 0) inherits deck chrome.
   *  Default false — covers usually want a clean canvas. */
  showOnCover: z.boolean().optional(),
}).strict();
```

**SlideIR extension (`src/domain/ir/slide-ir.ts`):**
```ts
chrome_override: z.enum(['inherit', 'hide']).optional(),
```
- Omitted / 'inherit' → deck-level decision applies
- 'hide' → suppress chrome on this slide regardless of deck setting

**Deck extension (`src/types/deck.ts`):**
```ts
chrome?: DeckChrome;
```

## Compiler flow

**`compileSlideIRToHtml` signature:**
```ts
{ ir, soul, geometry,
  chrome?: DeckChrome,
  slidePosition?: number,    // for page_number slot
  slideCount?: number,       // for page_number slot
}
```

**Render decision tree (in compileSlideIRToHtml):**
```
if (ir.chrome_override === 'hide')           → no chrome
else if (chrome === undefined)                → no chrome
else                                          → render header + footer wrappers
```

**HTML shape with chrome:**
```
<div class="slide pengui-bg-canvas pengui-has-chrome">
  <header class="pengui-chrome-header">
    <div class="pengui-chrome-slot pengui-chrome-slot-left">{slot}</div>
    <div class="pengui-chrome-slot pengui-chrome-slot-center">{slot}</div>
    <div class="pengui-chrome-slot pengui-chrome-slot-right">{slot}</div>
  </header>
  <main class="pengui-chrome-body">{body nodes}</main>
  <footer class="pengui-chrome-footer">{slots…}</footer>
</div>
```

`<main>` carries the `pengui-chrome-body` class with `flex: 1 1 auto` +
`flex-direction: column` + `justify-content: center`, so the body
content stays vertically centered between header and footer (preserves
today's `justify-content: center` behavior on slides without chrome).

**Deck-service threading:**
- Reads `deck.chrome`
- For each slide, decides whether to pass chrome:
  - `showOnCover === false` AND `slide.position === 0` → pass `chrome=undefined`
  - Else → pass `chrome=deck.chrome`
- Passes `slidePosition: position`, `slideCount: deck.slideIds.length`

## CSS

```css
.pengui-chrome-header,
.pengui-chrome-footer {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--space-md);
  width: 100%;
}
.pengui-chrome-header { padding-bottom: var(--space-md); }
.pengui-chrome-footer { padding-top: var(--space-md); }
.pengui-chrome-slot { display: flex; align-items: center; min-width: 0; }
.pengui-chrome-slot-left   { justify-self: start;  justify-content: flex-start; }
.pengui-chrome-slot-center { justify-self: center; justify-content: center; }
.pengui-chrome-slot-right  { justify-self: end;    justify-content: flex-end; }
.pengui-chrome-logo { display: block; width: auto; }
.pengui-chrome-logo-sm { height: 24px; }
.pengui-chrome-logo-md { height: 32px; }
.pengui-chrome-logo-lg { height: 44px; }
.pengui-chrome-text {
  font-family: var(--font-mono);
  font-size: var(--text-label);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
}
.pengui-chrome-page-number {
  font-family: var(--font-mono);
  font-size: var(--text-label);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
.slide.pengui-has-chrome { justify-content: stretch; }
.slide.pengui-has-chrome > .pengui-chrome-body {
  flex: 1 1 auto;
  display: flex; flex-direction: column;
  gap: var(--space-lg);
  justify-content: center;
  min-height: 0;
}
```

The `.pengui-has-chrome` class on the slide root toggles the body
wrapping behavior. Slides without chrome keep today's `justify-content:
center` on `.slide` directly — no regression.

## Compiler revision

`CURRENT_COMPILER_REVISION` 8 → 9. Cached docs at rev-8 don't carry
chrome shapes; they need to recompile so the editable PPTX picks up
chrome objects.

## E2E verification

`scripts/e2e-v414-chrome.mts`:

1. Spin up an InMemoryAssetStore + AssetService
2. Register two synthetic SVG logos as assets ("CLEAR TECH" mark
   left + "GALICIA" mark right — minimal SVG strings)
3. Build a `DeckChrome` with:
   - Header: left=logo(left-mark), right=logo(right-mark)
   - Footer: left=text("Pengui v4.14 · MAYO 2026"), right=page_number
   - showOnCover=false
4. Build 4 slides:
   - position 0: cover (chrome auto-hidden because showOnCover=false)
   - position 1: heading + prose
   - position 2: cards (reuses v4.13 grid+card pattern)
   - position 3: section_divider + cards (chrome still shows since we
     defer the showOnSectionDividers behavior)
5. Call compileSlideIRToHtml directly with chrome arg per slide,
   resolveAssetRefs, then render through SlideRenderer + Pptx/Pdf
   exporters
6. Verify:
   - Cover slide HTML does NOT contain `pengui-chrome-header`
   - Slides 1-3 HTML DOES contain `pengui-chrome-header` + both logo
     `<img>` tags + page-number text
   - PDF / PPTX file sizes look right
   - qlmanage thumbnail of slide 2 shows dual-logo chrome at top

## Out of scope

- Section badges (auto-derive from preceding section_divider) — needs a
  deck-context walker; defer to v4.14.1
- showOnSectionDividers — same constraint
- PPTX slide masters — every slide currently gets duplicate chrome
  shapes; fine for fidelity, can optimize later
- App-side chrome editor — engine + tools first; App in next App-touching
  release
- Chrome geometry overrides per slide (custom slot content) — `'inherit'`
  vs `'hide'` only this release
