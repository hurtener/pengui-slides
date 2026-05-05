# v4.15 — implementation plan

This is the build plan for "Premium fonts," the third phase of the
gap-closing roadmap (`PLAN_v4.13_design_quality.md`). Without bundled
fonts, every output reads as "AI-generated" no matter how good the
layout — system Helvetica/Arial sets a low ceiling on perceived quality.

## What ships in v4.15 — full parity scope

For TRUE static/editable parity (the user's stated goal):

- **Phase A (static parity):** bundled fonts loaded via `@font-face`
  data URIs into the slide HTML so Playwright renders with them. Static
  PPTX (image bundling) and PDF visually use the bundled font.
- **Phase B (editable parity):** PPTX OOXML font embedding via raw
  post-process. Native text shapes in the editable PPTX render with
  the embedded font in PowerPoint regardless of what's installed
  locally.

Bundled font set (curated, OFL-licensed):
- Inter Regular (400), Inter Medium (500), Inter Bold (700) — display + body
- Inter Display Bold (700) — large hero headings
- JetBrains Mono Regular (400) — chrome / mono

That's 5 TTF files total, ~1.5 MB on disk.

## What's deferred

- **Source Serif / Lora / display serifs** — the v4.13 roadmap mentioned
  ~8 fonts. Ship 5 first, expand on demand. Adding a font is one curated
  registry entry.
- **Google Fonts proxy** — runtime resolution from Google Fonts CDN
  with caching. Not needed once the curated set is bundled. Defer until
  we hit a soul that needs an unbundled family.
- **App-side font picker UI** — engine-only release per the v4.13/v4.14
  pattern. App catches up next App-touching release.

## Architecture

### Font registry (`src/domain/souls/font-registry.ts`)

```ts
interface BundledFontFace {
  family: string;            // 'Inter'
  weight: 400 | 500 | 700;
  style: 'normal' | 'italic';
  filename: string;          // 'Inter-Regular.ttf'
  license: string;           // 'OFL-1.1'
  source: string;            // 'https://github.com/rsms/inter'
}

export const BUNDLED_FONTS: BundledFontFace[] = [...];

/** Build @font-face rules with TTF data: URIs for the families used by
 *  the soul. Self-contained — no network, no local file server. */
export function buildFontFaceCss(soul: Pick<DesignSoul, 'layers'>): string;

/** Map a soul's typography family names to bundled font files for
 *  PPTX OOXML embedding. */
export function resolveFontsForEmbedding(soul: Pick<DesignSoul, 'layers'>): BundledFontFace[];
```

### Slide HTML compile

`compileSlideIRToHtml` gains optional `fontFaceCss?: string` arg. When
provided, prepended to the soul's cssTokens block. Renderer (Playwright)
sees the `@font-face` rules and renders with the bundled TTF.

`deck-service` calls `buildFontFaceCss(soul)` once per deck and passes
the result to every slide compile.

### PPTX OOXML font embedding (Phase B)

The editable PPTX exporter's `patchContentTypes` post-process gains a
`embedFonts` step:

1. Scan all slide XMLs for `<a:latin typeface="…"/>` and `<a:ea …/>`
   to collect the set of font families actually used
2. For each used family with a bundled TTF:
   a. Write the TTF binary to `ppt/fonts/font<N>.fntdata`
   b. Add `<Override PartName="/ppt/fonts/font<N>.fntdata"
      ContentType="application/x-fontdata"/>` to `[Content_Types].xml`
   c. Add a `<Relationship Type=".../font" Target="fonts/font<N>.fntdata"/>`
      to `ppt/_rels/presentation.xml.rels`
   d. Add `<p:embeddedFontLst><p:embeddedFont><p:font typeface="…"/>
      <p:regular r:id="…"/></p:embeddedFont></p:embeddedFontLst>` to
      `ppt/presentation.xml`

Per-weight: `<p:regular>`, `<p:bold>`, `<p:italic>`, `<p:boldItalic>`
under one `<p:embeddedFont>` per family.

### CURRENT_COMPILER_REVISION 11 → 12

Slide HTML now includes `@font-face` data URIs. Cached docs at rev 11
don't carry these — must recompile so the rendered PNG (image PPTX) and
the SlideDocument's font measurements (editable PPTX) match.

## E2E

`scripts/e2e-v415-fonts.mts`:

1. Build the same 4-slide deck (cover, content, cards, chart) with two
   souls:
   - **Soul A:** uses `Helvetica` (system) for body+display
   - **Soul B:** uses `Inter Display` (bundled) for display, `Inter`
     (bundled) for body
2. Export both to PDF + image PPTX + editable PPTX
3. Visual diff:
   - PDF: B should look visibly different (Inter Display headings)
   - Image PPTX: same as PDF (uses Playwright)
   - Editable PPTX: unzip, verify `ppt/fonts/font*.fntdata` files exist
     for Inter / Inter Display, presentation.xml has
     `<p:embeddedFontLst>` block, slide XMLs reference Inter typeface
4. Structural assertion: editable PPTX file size delta is bounded
   (~+1MB for embedded fonts is acceptable; >5MB is a regression)

## Risks

1. **TTF font format vs PowerPoint compatibility.** PowerPoint expects
   TTF or compressed EOT. WOFF2 is browser-only. We bundle TTF, so
   Playwright AND PowerPoint both work. Mitigation: stick to the OFL
   font GitHub releases (which ship TTF) — don't rely on Google Fonts
   CSS API (which serves WOFF2).

2. **OOXML font embedding gotchas.** PowerPoint is picky about the
   exact ContentType and Relationship structure. Mitigation: write
   focused unit test, validate against an Office-generated PPTX with
   embedded fonts as a reference.

3. **Bundle size.** ~1.5 MB of TTFs in the repo. Acceptable. Cap the
   curated set at ~10 families.

4. **License compliance.** Both Inter and JetBrains Mono ship under SIL
   Open Font License (OFL-1.1) — embedding in distributed documents is
   explicitly allowed. License manifest in `assets/fonts/LICENSES.md`.
