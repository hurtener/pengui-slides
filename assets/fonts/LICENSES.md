# Bundled fonts — license manifest

All fonts in this directory are distributed under the SIL Open Font
License, Version 1.1 (OFL-1.1). Embedding in distributed documents
(including PPTX, PDF, HTML data: URIs) is explicitly permitted.

## Inter

- Files: `Inter-Regular.ttf`, `Inter-Medium.ttf`, `Inter-Bold.ttf`,
  `InterDisplay-Bold.ttf`
- Author: Rasmus Andersson
- Source: https://github.com/rsms/inter
- Release: v4.0
- License: SIL Open Font License 1.1
- License text: https://github.com/rsms/inter/blob/master/LICENSE.txt

## JetBrains Mono

- Files: `JetBrainsMono-Regular.ttf`
- Author: JetBrains s.r.o.
- Source: https://github.com/JetBrains/JetBrainsMono
- Release: v2.304
- License: SIL Open Font License 1.1
- License text: https://github.com/JetBrains/JetBrainsMono/blob/master/OFL.txt

## Why TTF (not WOFF2)

PowerPoint's OOXML font embedding requires TrueType (TTF) — WOFF2 is a
browser-only format. Bundling TTF means the same file works for both
Playwright's `@font-face` rendering (static PPTX, PDF) and PowerPoint's
native font embedding (editable PPTX).
