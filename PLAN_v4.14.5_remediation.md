# v4.14.5 — editable-export remediation plan

This is a plan, not implementation. Goal: fix the two concrete defects
the user identified by inspecting `Pengui_v414_Chrome_Editable.pptx`
post-v4.14, then articulate the hybrid model the export pipeline needs
to land long-term.

## What's actually broken (verified by reading the PPTX XML)

Unzipped `output/Pengui_v414_Chrome_Editable.pptx` and read each
`ppt/slides/slideN.xml`. The findings are concrete, not speculative.

### Defect 1 — chrome logos are missing as native objects

**Slide 2 (`slide-content`)** — header should carry CLEAR TECH logo +
GALICIA logo. The XML contains:
- `<p:pic>` for the **full-slide background image** (1920×1080 PNG)
- `<p:sp id="3" name="el-0">` — an empty rect 11581790×260604 EMU
  positioned at the header location (offset y=304495). No content. No
  logos. The header element is acknowledged but its children
  (`<img src="data:image/svg+xml;base64,…" />`) are nowhere.
- Native text shapes for the body content + footer text + page number

**Result in PowerPoint:** the user sees the chrome logos because they're
baked into the background PNG, but they cannot be selected, moved, or
swapped. If they edit the deck and the background gets re-rendered,
chrome stays in the image; if they edit text natively, the background
falls out of sync.

### Defect 2 — cards lose their visual structure

**Slide 3 (`slide-cards`)** — three accented cards (info / accent /
accent_warm) with eyebrows, headings, prose, and lucide icons. The XML
contains:
- `<p:pic>` for the full-slide background (same hybrid model)
- Native text shapes for: 3× eyebrow, 3× card title, 3× description, 1×
  slide title, 1× footer text, 1× page number = 12 text shapes total
- A handful of empty rect shapes (`el-0`, `el-21`, `el-31`, `el-40`)
  that look like card outlines but have no fill/border preserved
- **No `<p:pic>` for any of the 6 lucide icons (one per card)**
- **No shape preserves the colored top-border accent**
- **No card-background rect with the proper surface fill + radius**

**Result in PowerPoint:** the user sees cards from the background image
(properly styled), but if they click anywhere on a card they get bare
text floating in space. Editing a card's text leaves the background
image unchanged — the visual lies.

## Root cause

`src/domain/documents/html-slide-document-compiler.ts:1004` handles
`<img>` elements with this disposition rule:

```ts
if (tagName === 'IMG') {
  // …
  ...(!/^https?:\/\//i.test(src)
    ? { exportDisposition: 'background', fallbackReason: 'non-fetchable-image' }
    : {})
}
```

Translation: any image whose `src` is NOT an `http(s)://` URL gets
flattened into the background. Our chrome logos are `data:image/svg+xml;
base64,…` URIs (resolved from `asset://uuid` by the asset-resolver
pre-step), so they fail this check and disappear into the background.

The same architectural choice cascades:
- Inline `<svg>` icons inside `pengui-card-icon` aren't `<img>` → they
  fall through unhandled and become background-only
- `<article class="pengui-card">` does have a `backgroundColor` +
  `borderTopWidth`, so it gets a `shape` element (line 1040), but the
  shape captures only the rect — not the accent-colored top-border or
  the contained icon

The deeper issue is that the editable compiler is built around a
**per-element binary** (native or background) rather than a
**per-element composite** model (each visual unit can produce a
**group of native shapes** that includes both its chrome and its text).

## Proposed hybrid model

For design-team-quality output, every recognizable IR primitive should
materialize as a coherent PPTX object that a designer can grab, move,
restyle, or replace as a unit. Three categories:

### A — pure native (always extract)
Plain prose, headings, list items, table cells, eyebrows, simple
captions, page numbers, plain-text chrome slots. Same as today.

### B — composite group (NEW — extract as `<p:grpSp>`)
Each instance becomes a single PPTX group containing:

- **Card** (`pengui-card`) → group of:
  - background rect (rounded, soul `--color-surface` fill)
  - top-border rect (3px, accent color from the `pengui-card-accent-*`
    class)
  - icon `<p:pic>` if present (PNG-rasterised from inline SVG, or
    embedded as SVG drawing)
  - eyebrow text shape
  - native text shapes for the inner leaves
- **Chrome header / footer** → group of:
  - hairline rect (border-top/bottom)
  - logo `<p:pic>` for each logo slot (data-URI base64-decoded into a
    proper PPTX media item)
  - text shape for each text/page-number slot
- **Callout** (`pengui-callout`) → group of: background rect + accent
  border-left rect + title text + body text
- **Quote** (`pengui-quote`) → group of: surface rect + border-left rect
  + body text + attribution text

Group dimensions match the source element's `getBoundingClientRect()`.
Children's offsets are relative to the group, not the slide. Editing
text inside the group works in PowerPoint's normal flow; moving the
group moves everything together.

### C — image fallback (keep, but scope tighter)
Reserved for content that genuinely can't be expressed as native PPTX:
- Charts (full ECharts SVG with gradient fills, complex paths)
- Custom illustrations or decorative ornaments (when v4.16 lands)
- Any element with CSS effects we can't translate (filters, blend
  modes, complex pseudo-elements)

In hybrid mode today, every chart-bearing slide flips the WHOLE slide
to background. After v4.14.5: only the chart's bounding rect is
flattened into a `<p:pic>` positioned where the chart sits, and the
rest of the slide stays native.

This means we can drop the per-slide `mode` discriminator
(`native_only` / `hybrid_background` / `image_only`) in favour of
per-element `disposition` decisions.

## Implementation phases

Three deliverables, each independently shippable. Order matters: data-
URI image extraction unblocks most of the chrome and asset story.

### Phase 1 — extract data-URI images as native `<p:pic>` shapes
**Files:** `src/domain/documents/html-slide-document-compiler.ts`,
`src/domain/rendering/editable-pptx-exporter.ts`,
`src/types/slide-document.ts`

**Change:**
- Drop the `non-fetchable-image` background fallback for data-URI
  images. Instead, parse the data URI inline (`data:<mime>;base64,<b64>`),
  emit a `SlideImageElement` with `dataUri: string` (new field) and
  `kind: 'image'`.
- The editable PPTX exporter learns to:
  1. Decode the base64 payload
  2. Register a new media item in `ppt/media/` (PNG, SVG, or JPEG per
     mime)
  3. Emit a `<p:pic>` shape pointing to the new media via the slide's
     `_rels` file
- Add a unit test fixture: a synthetic slide with a 200×100 data-URI
  PNG → assert the resulting PPTX has a `<p:pic>` referencing a media
  file, no background fallback triggered.

**Verification:** re-run `e2e-v414-chrome.mts`, unzip the editable PPTX,
confirm `slide2.xml` and `slide3.xml` each contain TWO `<p:pic>` shapes
in the chrome header (the two logos), with offsets matching the
header's left/right slot positions.

**Effort:** ~300 LOC, ~1 day. Low risk — additive, unit-testable.

### Phase 2 — composite group for `pengui-card`
**Files:** `src/domain/documents/html-slide-document-compiler.ts`,
`src/types/slide-document.ts`,
`src/domain/rendering/editable-pptx-exporter.ts`

**Change:**
- Add a `SlideGroupElement` kind (the `SlideElement` union already
  hints this exists per `src/types/slide-document.ts:161` — extend it
  if needed)
- During the walker, when an element matches selector
  `article.pengui-card`, emit a group element whose `children` are
  produced by recursing into the card. The card's bounding rect is the
  group bounds; children's offsets are relative to the group.
- Add per-card visual children:
  - Background rect (surface fill + corner radius)
  - Top-border rect (3px tall, full width, accent color extracted from
    the `pengui-card-accent-*` class — a tiny class-name → token map
    in the compiler)
  - Icon `<p:pic>` produced by rasterising the inline `<svg>` (Phase 2a)
    OR by storing the SVG markup as a media item (Phase 2b — preferred,
    smaller; PowerPoint supports `image/svg+xml`)
- The editable PPTX exporter learns to emit `<p:grpSp>` with proper
  `<p:grpSpPr>` containing `xfrm` for both the group itself and the
  child offset frame (`a:chOff` / `a:chExt`)

**Verification:** re-run `e2e-v414-chrome.mts`, unzip, confirm
`slide3.xml` has 3 `<p:grpSp>` (one per card) each containing: 1 fill
rect + 1 border-top rect + 1 `<p:pic>` (icon) + 3 text shapes (eyebrow
+ heading + prose). Open in PowerPoint, verify clicking a card selects
the group, double-click drills into a child shape.

**Effort:** ~500 LOC + tests, ~2 days. Medium risk — `<p:grpSp>` mapping
needs care (group transform inheritance is a common PPTX pitfall).

### Phase 3 — composite group for `pengui-chrome-header` / `pengui-chrome-footer`
**Files:** same as Phase 2

**Change:**
- Same group treatment, scoped to chrome header/footer regions.
- Builds on Phase 1 (logos) and Phase 2 (group infrastructure)
- The empty `el-0` "header placeholder" shape currently emitted goes
  away — the group replaces it.

**Verification:** confirm slide 2/3 each have one `<p:grpSp>` for the
header (containing 2 logo `<p:pic>`s) and one `<p:grpSp>` for the
footer (containing 1 text + 1 page-number text + 1 hairline rect).

**Effort:** ~150 LOC + tests, ~0.5 day. Low risk once Phase 2's group
machinery exists.

## Out of scope (defer to follow-up releases)

- **Per-element chart hybrid** (only the chart's rect flattened, not
  the whole slide) — its own ~3-day project, lands in v4.14.6
- **Callout / quote / table composite groups** — apply the Phase 2
  pattern to the rest of the IR, ~1-2 days each, can be incremental
- **PPTX slide masters for chrome** — instead of chrome shapes
  duplicating per slide, map chrome to a real slide master.
  Substantially deeper PPTX work; was already deferred from v4.14
- **Tracking which elements were "edited" by the user** — useful for
  an "auto-recompile if untouched" heuristic; not needed for v4.14.5

## Risks and pitfalls

1. **`<p:grpSp>` math.** Group children's `xfrm` offsets are relative to
   the group's `chOff`/`chExt`, not the slide. Off-by-one errors here
   make groups appear in wrong positions. Mitigation: write a focused
   unit test that constructs a group with known children and asserts
   the resulting XML has correct relative coordinates.

2. **SVG-in-PPTX support.** PowerPoint 2019+ supports `image/svg+xml`
   media items, but older readers (PowerPoint 2016, some viewers)
   don't. Mitigation for Phase 2: ship BOTH a fallback PNG raster AND
   the SVG; the rels file references the SVG with the PNG as
   `cstate="email"` fallback (standard OOXML pattern).

3. **Fonts.** Card text rendered at 18pt in PPTX vs 36px in the
   background image — mismatch the user already noticed. v4.15 (premium
   fonts) is the structural fix. v4.14.5 should at minimum verify that
   the editable native shapes use the same font sizes the background
   PNG used, by reading the computed style at compile time, not the IR
   default sizes. Likely a small fix in the same compiler.

4. **Test surface.** The editable export path only has loose checks in
   the E2E (file size + magic bytes + native object count). v4.14.5
   should add a per-slide structural assertion: "slide N has K groups,
   M images, T text shapes" — measured by parsing the XML, not by
   trusting the exporter's self-report. This lets future regressions
   surface immediately.

## Acceptance criteria

After v4.14.5 ships, re-running `scripts/e2e-v414-chrome.mts` and
unzipping the editable PPTX must show:

- Slide 2 (`slide-content`) header: 2 native `<p:pic>` shapes for the
  two logos, positioned at the header left/right slots
- Slide 3 (`slide-cards`): 3 native `<p:grpSp>` groups, each containing
  the card background + accent border + icon + native text shapes
- No card icon or chrome logo lives only in the background PNG
- Text shape font sizes match the background image's rendered sizes
- File size delta is acceptable (likely +5-15% over v4.14 — extra
  shapes cost a little but are far more useful)
- Opening in PowerPoint: chrome logos selectable, cards selectable as
  groups, nothing visually shifts compared to the v4.14 background-only
  rendering
